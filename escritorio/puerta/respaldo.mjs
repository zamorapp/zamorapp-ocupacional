// Fase C (local primero): respaldo de la base de la PC. Botón «Respaldar ahora» = sincronizar con la nube y después
// guardar una copia completa de la base local (pg_dump) en la carpeta de respaldos de la PC y, cifrada con la clave
// de respaldo, en una carpeta externa (la de Google Drive en la PC, que el cliente de Drive sube solo). También corre
// solo una vez al día. La copia externa va SIEMPRE cifrada (AES-256-GCM con clave derivada por scrypt): es la base
// clínica completa fuera de la PC. Para restaurar en otra PC hacen falta el archivo y la clave de respaldo.
// Fechas con la hora anclada (nube.reloj), nunca con la de Windows.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { CONFIG } from "./config.mjs";

const MAGIA = Buffer.from("ZAMORAPP-RESPALDO-1\n");
const CADA_MS = 24 * 3600e3; // respaldo automático diario
const GUARDAR_LOCALES = 7;
const GUARDAR_EXTERNOS = 30;
const exe = (nombre) => path.join(CONFIG.pgBin, process.platform === "win32" ? `${nombre}.exe` : nombre);

export class Respaldo {
  constructor({ estado, nube, motor, registro = () => {}, sincronizar = async () => {} }) {
    Object.assign(this, { estado, nube, motor, registro, sincronizar });
    this.enCurso = null;
    this.paso = null;
  }

  #cfg() { return (this.estado.d.respaldo ??= { carpeta: null, clave: null, ultimo: null, error: null }); }
  get carpetaLocal() { return path.join(CONFIG.datos, "respaldos"); }

  // Para la pantalla: qué hay configurado, cómo fue el último y si hay uno en curso
  estadoActual() {
    const c = this.#cfg();
    return { enCurso: Boolean(this.enCurso), paso: this.paso, carpeta: c.carpeta, cifrado: Boolean(c.clave), ultimo: c.ultimo, error: c.error,
      carpetaExternaExiste: Boolean(c.carpeta && fs.existsSync(c.carpeta)) };
  }

  // Carpeta externa y clave de respaldo (la pone un administrador o el gerente médico desde la app)
  configurar({ carpeta, clave }) {
    const c = this.#cfg();
    if (carpeta !== undefined) {
      const ruta = carpeta ? path.resolve(String(carpeta)) : null;
      if (ruta && !fs.existsSync(ruta)) throw new Error(`La carpeta no existe: ${ruta}`);
      c.carpeta = ruta;
    }
    if (clave !== undefined) {
      if (clave && String(clave).length < 8) throw new Error("La clave de respaldo debe tener al menos 8 caracteres");
      c.clave = clave ? String(clave) : null;
    }
    this.estado.guardar();
    return this.estadoActual();
  }

  // Carpetas de Google Drive (u otro disco) que suelen existir en una PC con Windows: sugerencias para la pantalla
  carpetasSugeridas() {
    const salida = [];
    const casa = process.env.USERPROFILE || process.env.HOME || "";
    const candidatas = [path.join(casa, "Mi unidad"), path.join(casa, "My Drive"), path.join(casa, "Google Drive"), path.join(casa, "OneDrive")];
    if (process.platform === "win32") for (const l of "DEFGHIJKLMNOPQRSTUVWXYZ") candidatas.push(`${l}:\\Mi unidad`, `${l}:\\My Drive`);
    for (const c of candidatas) { try { if (fs.statSync(c).isDirectory()) salida.push(c); } catch { /* no está */ } }
    return salida;
  }

  // ¿Toca el automático? Una vez al día, con la hora anclada
  vencido() {
    const u = this.#cfg().ultimo;
    return !u?.ok || this.nube.reloj.ahora() - Date.parse(u.fecha) > CADA_MS;
  }

  hacer(opciones = {}) {
    this.enCurso ??= this.#hacer(opciones).finally(() => { this.enCurso = null; this.paso = null; });
    return this.enCurso;
  }

  async #hacer({ sincronizar = true, automatico = false } = {}) {
    const c = this.#cfg();
    const inicio = performance.now();
    const resultado = { fecha: this.nube.reloj.iso(), ok: false, archivo: null, bytes: 0, externo: null, automatico, sincronizado: false };
    try {
      if (sincronizar) { this.paso = "sincronizando con la nube"; resultado.sincronizado = await this.sincronizar().then(() => true).catch(() => false); }
      this.paso = "copiando la base de la PC";
      fs.mkdirSync(this.carpetaLocal, { recursive: true });
      const nombre = `zamorapp-${resultado.fecha.slice(0, 16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4})/, "$1-$2")}`;
      const archivo = path.join(this.carpetaLocal, `${nombre}.dump`);
      await this.#volcar(archivo);
      resultado.archivo = archivo;
      resultado.bytes = fs.statSync(archivo).size;
      if (c.carpeta) {
        if (!c.clave) throw new Error("Falta la clave de respaldo: sin ella la copia no sale de la PC");
        if (!fs.existsSync(c.carpeta)) throw new Error(`La carpeta externa no está disponible: ${c.carpeta}`);
        this.paso = "guardando la copia cifrada en la carpeta externa";
        const externo = path.join(c.carpeta, `${nombre}.zamorapp`);
        await cifrarArchivo(archivo, externo, c.clave);
        resultado.externo = externo;
        this.#rotar(c.carpeta, ".zamorapp", GUARDAR_EXTERNOS);
      }
      this.#rotar(this.carpetaLocal, ".dump", GUARDAR_LOCALES);
      resultado.ok = true;
      c.error = null;
      this.registro(`[respaldo] listo en ${Math.round((performance.now() - inicio) / 1000)} s: ${archivo} (${Math.round(resultado.bytes / 1024)} KB)${resultado.externo ? ` y ${resultado.externo}` : ""}`);
    } catch (e) {
      c.error = e.message;
      this.registro(`[respaldo] falló: ${e.message}`);
    }
    c.ultimo = resultado;
    this.estado.guardar();
    return { ...resultado, error: c.error };
  }

  #volcar(archivo) {
    return new Promise((ok, mal) => {
      const salida = fs.createWriteStream(`${archivo}.parcial`);
      const p = spawn(exe("pg_dump"), ["--format=custom", "--compress=6", "--no-owner", "--dbname", this.motor.url()], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let err = "";
      p.stderr.on("data", (d) => { err += d; });
      p.stdout.pipe(salida);
      p.on("error", mal);
      p.on("close", (codigo) => {
        salida.end(() => {
          if (codigo !== 0) { fs.rmSync(`${archivo}.parcial`, { force: true }); return mal(new Error(`pg_dump terminó con ${codigo}: ${err.trim().split("\n").pop() || "sin mensaje"}`)); }
          fs.renameSync(`${archivo}.parcial`, archivo);
          ok();
        });
      });
    });
  }

  #rotar(carpeta, extension, guardar) {
    try {
      const lista = fs.readdirSync(carpeta).filter((f) => f.startsWith("zamorapp-") && f.endsWith(extension)).sort();
      for (const f of lista.slice(0, Math.max(0, lista.length - guardar))) fs.rmSync(path.join(carpeta, f), { force: true });
    } catch (e) { this.registro(`[respaldo] no se pudieron limpiar copias viejas en ${carpeta}: ${e.message}`); }
  }

  // Lista de copias disponibles (local y externa) para la pantalla «Restaurar»
  copias() {
    const c = this.#cfg();
    const de = (carpeta, ext, externo) => {
      try { return fs.readdirSync(carpeta).filter((f) => f.startsWith("zamorapp-") && f.endsWith(ext)).sort().reverse()
        .map((f) => ({ archivo: path.join(carpeta, f), bytes: fs.statSync(path.join(carpeta, f)).size, externo })); } catch { return []; }
    };
    return [...de(this.carpetaLocal, ".dump", false), ...(c.carpeta ? de(c.carpeta, ".zamorapp", true) : [])];
  }

  // Prepara una restauración: deja el volcado descifrado listo y el programa la aplica al arrancar de nuevo
  // (motor.iniciar: carga en una base aparte, la cambia por la actual y vuelve a aplicar migraciones).
  async prepararRestauracion(archivo, clave) {
    const ruta = path.resolve(String(archivo || ""));
    if (!fs.existsSync(ruta)) throw new Error("No existe ese archivo de respaldo");
    fs.mkdirSync(this.carpetaLocal, { recursive: true });
    const destino = path.join(this.carpetaLocal, "restaurar.dump");
    if (ruta.endsWith(".zamorapp")) await descifrarArchivo(ruta, destino, clave || this.#cfg().clave || "");
    else fs.copyFileSync(ruta, destino);
    this.estado.d.restaurar = { archivo: destino, origen: ruta, pedido: this.nube.reloj.iso() };
    this.estado.guardar();
    return { listo: true, archivo: destino, mensaje: "Cierra y vuelve a abrir zamorApp Escritorio: al arrancar se restaura la copia y luego se sincroniza con la nube." };
  }
}

// Archivo cifrado: MAGIA + sal(16) + iv(12) + cifrado + etiqueta(16). Clave = scrypt(clave de respaldo, sal)
export async function cifrarArchivo(origen, destino, clave) {
  const sal = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const k = crypto.scryptSync(String(clave), sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const cifrador = crypto.createCipheriv("aes-256-gcm", k, iv);
  const salida = fs.createWriteStream(`${destino}.parcial`);
  salida.write(Buffer.concat([MAGIA, sal, iv]));
  await pipeline(fs.createReadStream(origen), cifrador, salida);
  fs.appendFileSync(`${destino}.parcial`, cifrador.getAuthTag());
  fs.renameSync(`${destino}.parcial`, destino);
}

export async function descifrarArchivo(origen, destino, clave) {
  const tam = fs.statSync(origen).size;
  const cab = Buffer.alloc(MAGIA.length + 28);
  const fd = fs.openSync(origen, "r");
  try { fs.readSync(fd, cab, 0, cab.length, 0); } finally { fs.closeSync(fd); }
  if (!cab.subarray(0, MAGIA.length).equals(MAGIA) || tam < cab.length + 16) throw new Error("Ese archivo no es un respaldo de zamorApp");
  const sal = cab.subarray(MAGIA.length, MAGIA.length + 16), iv = cab.subarray(MAGIA.length + 16, MAGIA.length + 28);
  const etiqueta = Buffer.alloc(16);
  const fd2 = fs.openSync(origen, "r");
  try { fs.readSync(fd2, etiqueta, 0, 16, tam - 16); } finally { fs.closeSync(fd2); }
  const k = crypto.scryptSync(String(clave), sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
  d.setAuthTag(etiqueta);
  try {
    await pipeline(fs.createReadStream(origen, { start: cab.length, end: tam - 17 }), d, fs.createWriteStream(`${destino}.parcial`));
  } catch {
    fs.rmSync(`${destino}.parcial`, { force: true });
    throw new Error("La clave de respaldo no es la correcta o el archivo está dañado");
  }
  fs.renameSync(`${destino}.parcial`, destino);
}
