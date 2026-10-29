// Prueba de restauración: monta un PostgreSQL temporal con el motor portátil de zamorApp Escritorio, le aplica las
// migraciones, restaura el respaldo indicado, verifica fila por fila y lo borra todo. El resultado queda en
// public.respaldos (tipo «restauracion») y el Inicio muestra cuándo se probó por última vez.
// Uso: DATABASE_URL="<nube>" ZAMORAPP_PG_BIN="<carpeta con initdb y pg_ctl>" node scripts/probar-restauracion.mjs <respaldo.json.gz> <carpeta temporal>
// Nunca toca la base local del programa ni el SAME: carpeta propia, solo 127.0.0.1 y un puerto libre desde 54339.
// Si hay menos de 1,5 GB de memoria libre, la pospone (sale con código 3) para no frenar la PC.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { configuracion } from "./conexion-segura.mjs";

const MEMORIA_MINIMA = Number(process.env.RESTAURACION_MEMORIA_MB ?? 1536) * 1024 * 1024;
const [archivo, temporal] = process.argv.slice(2);
if (!archivo || !temporal) throw new Error("Uso: probar-restauracion.mjs <respaldo.json.gz> <carpeta temporal>");
const pgBin = process.env.ZAMORAPP_PG_BIN ?? "";
const exe = (n) => path.join(pgBin, process.platform === "win32" ? `${n}.exe` : n);
if (!fs.existsSync(exe("initdb"))) throw new Error(`No encontré el PostgreSQL portátil en «${pgBin}»`);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Antes de borrar nada: la carpeta tiene que ser la de la prueba, dentro de .zamorapp o de la carpeta temporal del sistema
const carpetaPrueba = path.resolve(temporal);
const permitidas = [path.join(os.homedir(), ".zamorapp"), os.tmpdir()].map((d) => path.resolve(d) + path.sep);
if (path.basename(carpetaPrueba) !== "prueba-restauracion" || !permitidas.some((d) => carpetaPrueba.startsWith(d))) {
  throw new Error(`Carpeta temporal no permitida: «${carpetaPrueba}» (debe llamarse prueba-restauracion y estar en %USERPROFILE%\\.zamorapp o en la carpeta temporal)`);
}
const libre = os.freemem();
if (libre < MEMORIA_MINIMA) {
  console.log(`Prueba de restauración pospuesta: solo hay ${(libre / 2 ** 30).toFixed(1)} GB de memoria libre`);
  process.exit(3);
}

const datos = path.join(carpetaPrueba, "base");
// Con clave al azar (no «trust»): mientras dura la prueba, ningún otro programa de la PC puede leer los datos
const clave = crypto.randomBytes(24).toString("hex");
const inicio = Date.now();
let resultado;
try {
  fs.rmSync(carpetaPrueba, { recursive: true, force: true });
  fs.mkdirSync(carpetaPrueba, { recursive: true });
  const archivoClave = path.join(carpetaPrueba, ".clave");
  fs.writeFileSync(archivoClave, clave, { mode: 0o600 });
  try {
    correr("initdb", ["-D", datos, "-U", "postgres", "-E", "UTF8", "--locale=C", "-A", "scram-sha-256", `--pwfile=${archivoClave}`], 180_000);
  } finally {
    fs.rmSync(archivoClave, { force: true });
  }
  const puerto = await puertoLibre(54339);
  correr("pg_ctl", ["start", "-D", datos, "-w", "-t", "60", "-l", path.join(carpetaPrueba, "base.log"), "-o",
    `-p ${puerto} -c listen_addresses=127.0.0.1 -c max_connections=10 -c shared_buffers=32MB${process.platform === "win32" ? "" : ` -c unix_socket_directories=${JSON.stringify(datos)}`}`], 90_000);
  const local = `postgresql://postgres:${clave}@127.0.0.1:${puerto}/postgres?sslmode=disable`;
  await estructura(local);
  const r = spawnSync(process.execPath, [path.join(raiz, "scripts", "restaurar.mjs"), archivo], {
    env: { ...process.env, DATABASE_URL: local }, encoding: "utf8", windowsHide: true, timeout: 20 * 60_000 });
  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const m = salida.match(/(\d+) tablas, (\d+) filas/);
  resultado = r.status === 0
    ? { estado: "ok", tablas: Number(m?.[1]), filas: Number(m?.[2]), detalle: `Restaurado y verificado en ${Math.round((Date.now() - inicio) / 1000)} s` }
    : { estado: "fallo", detalle: salida.slice(-1500) || `restaurar.mjs terminó con código ${r.status}` };
} catch (e) {
  resultado = { estado: "fallo", detalle: e.message.slice(-1500) };
} finally {
  // Siempre se apaga y se borra: no queda ninguna copia extra de los datos clínicos
  if (fs.existsSync(path.join(datos, "postmaster.pid"))) {
    spawnSync(exe("pg_ctl"), ["stop", "-D", datos, "-m", "fast", "-w", "-t", "60"], { stdio: "ignore", windowsHide: true, timeout: 90_000 });
  }
  fs.rmSync(carpetaPrueba, { recursive: true, force: true });
}

await anotar({ ...resultado, archivo: path.basename(archivo) });
console.log(`Prueba de restauración (${resultado.estado}) de ${path.basename(archivo)}: ${resultado.estado === "ok" ? `${resultado.tablas} tablas, ${resultado.filas} filas · ` : ""}${resultado.detalle}`);
if (resultado.estado !== "ok") process.exitCode = 1;

function correr(programa, argumentos, espera) {
  const r = spawnSync(exe(programa), argumentos, { encoding: "utf8", windowsHide: true, timeout: espera,
    stdio: programa === "pg_ctl" ? "ignore" : "pipe" }); // pg_ctl sin tuberías: en Windows el servidor las hereda y no termina
  if (r.status !== 0) {
    const log = path.join(carpetaPrueba, "base.log");
    throw new Error(`${programa} falló: ${r.stderr || r.error || (fs.existsSync(log) ? fs.readFileSync(log, "utf8").slice(-800) : "")}`);
  }
}

// Las mismas piezas que la base local del escritorio: equivalentes de Supabase y luego las migraciones en orden
async function estructura(url) {
  const c = new pg.Client(configuracion(url));
  await c.connect();
  try {
    const migraciones = path.join(raiz, "supabase", "migrations");
    const piezas = [path.join(raiz, "supabase", "pruebas", "00_stubs_supabase.sql"),
      ...fs.readdirSync(migraciones).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(migraciones, f))];
    for (const pieza of piezas) {
      await c.query("begin");
      try {
        await c.query(fs.readFileSync(pieza, "utf8"));
        await c.query("commit");
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw new Error(`${path.basename(pieza)}: ${e.message}`);
      }
    }
  } finally {
    await c.end();
  }
}

async function puertoLibre(desde) {
  for (let p = desde; p < desde + 20; p++) {
    const ok = await new Promise((listo) => {
      const s = net.createServer().once("error", () => listo(false)).once("listening", () => s.close(() => listo(true)));
      s.listen(p, "127.0.0.1");
    });
    if (ok) return p;
  }
  throw new Error(`No hay puertos libres desde ${desde}`);
}

// En la nube, junto a los respaldos; si no hay internet, el resultado igual queda en el registro de la PC
async function anotar(r) {
  const c = new pg.Client({ ...configuracion(process.env.DATABASE_URL), connectionTimeoutMillis: 30_000 });
  try {
    await c.connect();
    await c.query(
      `insert into public.respaldos (estado, tipo, archivo, tablas, filas, destinos, detalle, equipo)
       values ($1, 'restauracion', $2, $3, $4, 0, left(nullif($5, ''), 2000), $6)`,
      [r.estado, r.archivo, r.tablas ?? null, r.filas ?? null, r.detalle ?? "", os.hostname()],
    );
  } catch (e) {
    console.error(`No se pudo anotar la prueba de restauración en la base: ${e.message}`);
  } finally {
    await c.end().catch(() => {});
  }
}
