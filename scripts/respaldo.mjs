// Respaldo completo de los datos de zamorApp (Supabase) en un archivo .json.gz.
// Uso: DATABASE_URL="postgresql://..." node scripts/respaldo.mjs <carpeta> [<carpeta2> ...]
// Guarda todas las tablas de los esquemas public y clinico, más las cuentas de usuario,
// y conserva en cada carpeta los últimos 30 respaldos más uno por mes de los últimos 12 meses.
// Anota cada intento en public.respaldos (la app avisa si pasa un día sin respaldo correcto),
// purga lo temporal vencido (mantenimiento_purgar) y anota el resumen de espacio.
// La estructura está en supabase/migrations.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import pg from "pg";

const CONSERVAR = 30;
const MESES = 12;
const OMITIR = new Set(["public.cie10"]); // catálogo fijo, se recarga con cargar-cie10.mjs
// El pooler de Supabase a veces corta la conexión (ECONNRESET): se reintenta con espera creciente
const INTENTOS = 3;
const ESPERA_MS = Number(process.env.RESPALDO_ESPERA_MS ?? 30_000);
const carpetas = process.argv.slice(2);
if (!carpetas.length) throw new Error("Indica al menos una carpeta de destino");

let cliente = null;
let datos, filas, ultimoError;
for (let intento = 1; intento <= INTENTOS && !datos; intento++) {
  try {
    ({ datos, filas } = await leerBase());
  } catch (e) {
    ultimoError = e;
    await cerrar();
    console.error(`Intento ${intento} de ${INTENTOS}: no se pudo leer la base (${e.message})`);
    if (intento < INTENTOS) await new Promise((r) => setTimeout(r, ESPERA_MS * intento));
  }
}
if (!datos) {
  await anotar({ estado: "fallo", detalle: `No se pudo leer la base tras ${INTENTOS} intentos: ${ultimoError.message}` });
  await cerrar();
  throw ultimoError;
}

const comprimido = zlib.gzipSync(JSON.stringify(datos));
const archivo = `respaldo-${datos.fecha.slice(0, 19).replace(/[T:]/g, "-")}.json.gz`;
const guardados = [];
const errores = [];
for (const carpeta of carpetas) {
  try {
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, archivo), comprimido);
    for (const f of sobrantes(fs.readdirSync(carpeta))) fs.unlinkSync(path.join(carpeta, f));
    guardados.push(carpeta);
  } catch (e) {
    errores.push(`${carpeta}: ${e.message}`);
  }
}

// ok: en la PC y en la copia externa; aviso: solo en una carpeta (Google Drive cerrado o con error); fallo: en ninguna
const estado = guardados.length === 0 ? "fallo" : guardados.length < 2 || errores.length ? "aviso" : "ok";
const detalle = [...errores, ...(carpetas.length < 2 ? ["Google Drive no estaba abierto: el respaldo quedó solo en la PC"] : [])].join(" · ");
await anotar({ estado, archivo, tamano_kb: Math.round(comprimido.length / 1024), tablas: Object.keys(datos.tablas).length, filas, destinos: guardados.length, detalle });

let mantenimiento = "";
try {
  const c = await conectado();
  const { rows: [p] } = await c.query("select public.mantenimiento_purgar() as r");
  const { rows: [r] } = await c.query("select public.mantenimiento_resumen() as r");
  mantenimiento = ` · mantenimiento ${JSON.stringify({ ...p.r, ...r.r })}`;
} catch (e) {
  mantenimiento = ` · mantenimiento no disponible (${e.message})`;
}
await cerrar();
console.log(`Respaldo ${archivo} (${estado}): ${Object.keys(datos.tablas).length} tablas, ${filas} filas, ${(comprimido.length / 1024).toFixed(0)} KB en ${guardados.length} carpeta(s)${detalle ? ` · ${detalle}` : ""}${mantenimiento}`);
if (estado === "fallo") process.exitCode = 1;

// Todas las tablas de public y clinico, más las cuentas de usuario
async function leerBase() {
  const c = await conectado();
  const { rows: tablas } = await c.query(
    `select table_schema || '.' || table_name as nombre from information_schema.tables
     where table_type = 'BASE TABLE' and (table_schema in ('public', 'clinico')
       or (table_schema = 'auth' and table_name in ('users', 'identities')))
     order by 1`,
  );
  const datos = { fecha: new Date().toISOString(), tablas: {} };
  let filas = 0;
  for (const { nombre } of tablas) {
    if (OMITIR.has(nombre)) continue;
    const [esquema, tabla] = nombre.split(".");
    const { rows } = await c.query(`select coalesce(json_agg(t), '[]') as filas from "${esquema}"."${tabla}" t`);
    datos.tablas[nombre] = rows[0].filas;
    filas += rows[0].filas.length;
  }
  return { datos, filas };
}

// Conexión viva (abre una nueva si la anterior se cortó). Sin el manejador de 'error', un corte
// del pooler mientras el cliente está ocioso tumba el proceso («Unhandled 'error' event»).
async function conectado() {
  if (cliente) return cliente;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30_000 });
  c.on("error", (e) => {
    console.error(`La base cortó la conexión: ${e.message}`);
    if (cliente === c) cliente = null;
  });
  await c.connect();
  cliente = c;
  return c;
}

async function cerrar() {
  const c = cliente;
  cliente = null;
  await c?.end().catch(() => {});
}

// Anota el intento en public.respaldos para que la app muestre el estado; si la tabla aún no existe, sigue
// Con dos intentos: si el corte fue lo que hizo fallar el respaldo, la segunda conexión suele entrar
async function anotar(r) {
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const c = await conectado();
      await c.query(
        `insert into public.respaldos (estado, archivo, tamano_kb, tablas, filas, destinos, detalle, equipo)
         values ($1, $2, $3, $4, $5, $6, left(nullif($7, ''), 2000), $8)`,
        [r.estado, r.archivo ?? null, r.tamano_kb ?? null, r.tablas ?? null, r.filas ?? null, r.destinos ?? 0, r.detalle ?? "", os.hostname()],
      );
      return;
    } catch (e) {
      await cerrar();
      console.error(`No se pudo anotar el respaldo en la base: ${e.message}`);
    }
  }
}

// Respaldos que sobran: fuera de los últimos CONSERVAR y que no son el último de su mes (hasta MESES meses).
function sobrantes(nombres) {
  const todos = nombres.filter((f) => /^respaldo-\d{4}-\d{2}-.*\.json\.gz$/.test(f)).sort().reverse();
  const meses = new Set();
  return todos.filter((f, i) => {
    const mes = f.slice(9, 16);
    const mensual = !meses.has(mes) && meses.size < MESES;
    if (mensual) meses.add(mes);
    return i >= CONSERVAR && !mensual;
  });
}
