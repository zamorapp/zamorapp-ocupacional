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
import { empaquetar, listar } from "./tar.mjs";

const MAGIA = Buffer.from("ZAMORAPP-RESPALDO-1\n");
const CADA_MS = 24 * 3600e3; // respaldo automático diario
const GUARDAR_LOCALES = 7;
const GUARDAR_EXTERNOS = 30;
// Paquetes de adjuntos: cada uno trae TODOS los archivos (solo se agregan: el más nuevo contiene todo), así que
// bastan 1 en la PC y 2 en Drive (Analizar: los escaneados pueden ocupar GB). Aviso si uno pasa de 5 GB.
const GUARDAR_ADJUNTOS_LOCALES = 1;
const GUARDAR_ADJUNTOS_EXTERNOS = 2;
const AVISO_ADJUNTOS_BYTES = 5 * 1024 ** 3;
const CLAVE_MINIMA = 12;
// Pasos fijos del avance (para la pantalla): subir a la nube, copia en la PC, copia a Drive, prueba de descifrado
export const PASOS = ["nube", "pc", "drive", "prueba"];
export const AVISO_CLAVE = "Sin esta clave, la copia de Drive no sirve; anótala en papel. La nube sigue siendo el otro respaldo.";
const exe = (nombre) => path.join(CONFIG.pgBin, process.platform === "win32" ? `${nombre}.exe` : nombre);

export class Respaldo {
  constructor({ estado, nube, motor, replica = null, registro = () => {}, sincronizar = async () => {} }) {
    Object.assign(this, { estado, nube, motor, replica, registro, sincronizar });
    this.enCurso = null;
    this.paso = null;
  }

  #cfg() {
    const c = (this.estado.d.respaldo ??= {});
    for (const k of ["carpeta", "clave", "ultimo", "error", "restauracionProbada", "restauracionFallida", "avisoRestauracion"]) c[k] ??= null;
    c.porAnotar ??= []; // anotaciones para public.respaldos (nube) que no pudieron subir: se reintentan
    return c;
  }
  get carpetaLocal() { return path.join(CONFIG.datos, "respaldos"); }
  get carpetaAdjuntos() { return path.join(CONFIG.datos, "adjuntos"); } // la misma de adjuntos.mjs

  // Para la pantalla: qué hay configurado, cómo fue el último y si hay uno en curso
  estadoActual() {
    const c = this.#cfg();
    // La restauración fallida la anota motor.mjs al arrancar, sin hora (allí no hay reloj anclado): se fecha aquí
    if (c.restauracionFallida && !c.restauracionFallida.fecha) { c.restauracionFallida.fecha = this.nube.reloj.iso(); this.estado.guardar(); }
    return { enCurso: Boolean(this.enCurso), paso: this.paso, pasos: PASOS, carpeta: c.carpeta, cifrado: Boolean(c.clave), ultimo: c.ultimo, error: c.error,
      carpetaExternaExiste: Boolean(c.carpeta && fs.existsSync(c.carpeta)),
      hora: this.nube.reloj.iso(), horaSinAncla: !this.nube.reloj.verificada, claveMinima: CLAVE_MINIMA, avisoClave: AVISO_CLAVE,
      restauracionProbada: c.restauracionProbada, restauracionFallida: c.restauracionFallida, avisoRestauracion: c.avisoRestauracion,
      restauracionPendiente: this.estado.d.restaurar ? { origen: this.estado.d.restaurar.origen, pedido: this.estado.d.restaurar.pedido, adjuntos: Boolean(this.estado.d.restaurar.adjuntos), aviso: this.estado.d.restaurar.avisoAdjuntos || null } : null };
  }

  // Carpeta externa y clave de respaldo (la pone un administrador o el gerente médico desde la app). La clave se
  // escribe dos veces (confirmacion) y tiene al menos 12 caracteres (Analizar). Nunca se devuelve.
  configurar({ carpeta, clave, confirmacion }) {
    const c = this.#cfg();
    if (carpeta !== undefined) {
      const ruta = carpeta ? path.resolve(String(carpeta)) : null;
      if (ruta && !fs.existsSync(ruta)) throw new Error(`La carpeta no existe: ${ruta}`);
      c.carpeta = ruta;
    }
    if (clave !== undefined) {
      if (clave) {
        if (String(clave).length < CLAVE_MINIMA) throw new Error(`La clave de respaldo debe tener al menos ${CLAVE_MINIMA} caracteres`);
        if (confirmacion !== clave) throw new Error("Escribe la clave de respaldo dos veces iguales");
      }
      c.clave = clave ? String(clave) : null;
      c.restauracionProbada = null; // con clave nueva, la próxima copia externa se vuelve a probar
    }
    this.estado.guardar();
    return { ...this.estadoActual(), aviso: clave ? AVISO_CLAVE : undefined };
  }

  // «Cancelar restauración» antes de cerrar el programa: se borra el volcado preparado
  cancelarRestauracion() {
    const r = this.estado.d.restaurar;
    if (r?.archivo) fs.rmSync(r.archivo, { force: true });
    if (r?.adjuntos) fs.rmSync(r.adjuntos, { force: true });
    this.estado.d.restaurar = null;
    this.estado.guardar();
    return { cancelada: Boolean(r) };
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
    const resultado = { fecha: this.nube.reloj.iso(), ok: false, archivo: null, bytes: 0, externo: null, probada: null, automatico, sincronizado: false };
    try {
      if (sincronizar) { this.paso = "nube"; resultado.sincronizado = await this.sincronizar().then(() => true).catch(() => false); }
      this.paso = "pc";
      fs.mkdirSync(this.carpetaLocal, { recursive: true });
      // AAAAMMDD-HHMMSS: con los segundos, dos respaldos en el mismo minuto no se pisan (antes era AAAAMMDD-HHMM)
      const nombre = `zamorapp-${resultado.fecha.slice(0, 19).replace(/[-:T]/g, "").replace(/(\d{8})(\d{6})/, "$1-$2")}`;
      const archivo = path.join(this.carpetaLocal, `${nombre}.dump`);
      await this.#volcar(archivo);
      resultado.archivo = archivo;
      resultado.bytes = fs.statSync(archivo).size;
      // Fase C.2: los adjuntos (exámenes escaneados, PDF) no están en la base: van en un paquete tar aparte.
      // Solo se arma uno nuevo cuando cambió algo desde el último (son archivos que solo se agregan).
      resultado.adjuntos = await this.#empaquetarAdjuntos(nombre);
      if (c.carpeta) {
        if (!c.clave) throw new Error("Falta la clave de respaldo: sin ella la copia no sale de la PC");
        if (!fs.existsSync(c.carpeta)) throw new Error(`La carpeta externa no está disponible: ${c.carpeta}`);
        this.paso = "drive";
        const externo = path.join(c.carpeta, `${nombre}.zamorapp`);
        const huella = await cifrarArchivo(archivo, externo, c.clave);
        resultado.externo = externo;
        let huellaAdj = null;
        if (resultado.adjuntos?.archivo && (resultado.adjuntos.nuevo || !resultado.adjuntos.externo || !fs.existsSync(resultado.adjuntos.externo))) {
          resultado.adjuntos.externo = path.join(c.carpeta, `${nombre}.adjuntos.zamorapp`);
          huellaAdj = await cifrarArchivo(resultado.adjuntos.archivo, resultado.adjuntos.externo, c.clave);
        }
        // Prueba de restauración (Analizar): la copia externa se descifra con la clave guardada y tiene que ser
        // byte a byte el volcado de la PC. Si no, la copia de Drive no sirve y se avisa ya, no cuando haga falta.
        this.paso = "prueba";
        resultado.probada = await this.#probar(externo, c.clave, huella, resultado.bytes,
          huellaAdj ? { archivo: resultado.adjuntos.externo, huella: huellaAdj, bytes: fs.statSync(resultado.adjuntos.archivo).size } : null);
        if (resultado.adjuntos?.externo) { c.adjuntosExterno = resultado.adjuntos.huellaLista; }
        this.#rotar(c.carpeta, ".adjuntos.zamorapp", GUARDAR_ADJUNTOS_EXTERNOS);
        this.#rotar(c.carpeta, ".zamorapp", GUARDAR_EXTERNOS, ".adjuntos.zamorapp");
      }
      this.#rotar(this.carpetaLocal, ".adjuntos.tar", GUARDAR_ADJUNTOS_LOCALES);
      if (resultado.adjuntos?.bytes > AVISO_ADJUNTOS_BYTES) {
        resultado.aviso = `El paquete de adjuntos pesa ${(resultado.adjuntos.bytes / 1024 ** 3).toFixed(1)} GB: revisa el espacio de Google Drive`;
        this.registro(`[respaldo] ${resultado.aviso}`);
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
    await this.#anotar({ tipo: "respaldo", estado: resultado.ok ? (resultado.externo ? "ok" : "aviso") : "fallo",
      archivo: resultado.archivo ? path.basename(resultado.archivo) : null, tamano_kb: Math.round(resultado.bytes / 1024) || null,
      destinos: resultado.ok ? (resultado.externo ? 2 : 1) : 0,
      detalle: c.error || (resultado.externo ? "copia en la PC y cifrada en la carpeta externa" : "copia solo en la PC") });
    return { ...resultado, error: c.error };
  }

  async #probar(externo, clave, huella, bytes, adjuntos = null) {
    const c = this.#cfg();
    const prueba = { fecha: this.nube.reloj.iso(), ok: false, archivo: path.basename(externo), detalle: null, anotadaEnNube: false };
    try {
      const r = await verificarArchivo(externo, clave);
      if (r.huella !== huella || r.bytes !== bytes) throw new Error("La copia descifrada no coincide con el volcado de la PC");
      if (adjuntos) {
        const ra = await verificarArchivo(adjuntos.archivo, clave);
        if (ra.huella !== adjuntos.huella || ra.bytes !== adjuntos.bytes) throw new Error("La copia de adjuntos descifrada no coincide con el paquete de la PC");
      }
      prueba.ok = true;
      prueba.detalle = `descifrada con la clave de respaldo: ${Math.round(bytes / 1024)} KB íntegros${adjuntos ? ` y adjuntos (${Math.round(adjuntos.bytes / 1024)} KB)` : ""}`;
    } catch (e) {
      prueba.detalle = e.message;
      this.registro(`[respaldo] la prueba de descifrado de ${externo} falló: ${e.message}`);
    }
    c.restauracionProbada = prueba;
    this.estado.guardar();
    await this.#anotar({ tipo: "restauracion", estado: prueba.ok ? "ok" : "fallo", archivo: prueba.archivo, tamano_kb: Math.round(bytes / 1024), destinos: null, detalle: prueba.detalle });
    if (!prueba.ok) throw new Error(`La copia de Drive no se pudo abrir con la clave de respaldo: ${prueba.detalle}`);
    return prueba;
  }

  // Anota en public.respaldos (nube, #116) con el secreto del equipo; sin internet queda en cola y sube después
  async #anotar(fila) {
    const c = this.#cfg();
    c.porAnotar.push(fila);
    if (c.porAnotar.length > 50) c.porAnotar.splice(0, c.porAnotar.length - 50);
    await this.#subirAnotaciones();
  }

  async #subirAnotaciones() {
    const c = this.#cfg();
    const eq = this.estado.d.equipo;
    const uid = this.replica?.usuarioSincronia?.();
    if (eq && uid && this.nube.enLinea) {
      while (c.porAnotar.length) {
        const f = c.porAnotar[0];
        try {
          await this.nube.rpc(uid, "anotar_respaldo", { p_equipo: eq.id, p_secreto: eq.secreto, p_tipo: f.tipo, p_estado: f.estado,
            p_archivo: f.archivo, p_tamano_kb: f.tamano_kb, p_destinos: f.destinos, p_detalle: f.detalle });
          c.porAnotar.shift();
          if (f.tipo === "restauracion" && c.restauracionProbada?.archivo === f.archivo) c.restauracionProbada.anotadaEnNube = true;
        } catch (e) { this.registro(`[respaldo] no se pudo anotar en la nube (${f.tipo}): ${e.message}`); break; }
      }
    }
    this.estado.guardar();
  }

  // Anotaciones pendientes (hechas sin internet): las sube el ciclo de sincronía
  async anotarPendientes() { if (this.#cfg().porAnotar.length) await this.#subirAnotaciones(); }

  // Paquete tar de datos/adjuntos. Si nada cambió desde el último paquete (misma lista de rutas y tamaños), no se
  // repite: el último sigue valiendo. Devuelve null sin adjuntos.
  async #empaquetarAdjuntos(nombre) {
    const c = this.#cfg();
    const lista = listar(this.carpetaAdjuntos);
    if (!lista.length) return null;
    const huellaLista = crypto.createHash("sha256").update(lista.map((a) => `${a.ruta}\0${a.bytes}\n`).join("")).digest("hex");
    const ultimo = c.ultimo?.adjuntos;
    if (ultimo?.archivo && ultimo.huellaLista === huellaLista && fs.existsSync(ultimo.archivo)
        && (!c.carpeta || (ultimo.externo && fs.existsSync(ultimo.externo) && c.adjuntosExterno === huellaLista))) {
      return { ...ultimo, nuevo: false };
    }
    const archivo = path.join(this.carpetaLocal, `${nombre}.adjuntos.tar`);
    const r = await empaquetar(this.carpetaAdjuntos, archivo);
    return { archivo, externo: null, archivos: r.archivos, bytes: r.bytes, huellaLista, nuevo: true };
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

  #rotar(carpeta, extension, guardar, excepto = null) {
    try {
      const lista = fs.readdirSync(carpeta).filter((f) => f.startsWith("zamorapp-") && f.endsWith(extension) && !(excepto && f.endsWith(excepto))).sort();
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
    return [...de(this.carpetaLocal, ".dump", false), ...(c.carpeta ? de(c.carpeta, ".zamorapp", true) : [])].filter((x) => !x.archivo.endsWith(".adjuntos.zamorapp"));
  }

  // Los paquetes de adjuntos de la misma carpeta que la copia elegida, del más nuevo al más viejo (los adjuntos
  // solo se agregan: el más nuevo contiene todo)
  #paquetesAdjuntosPara(ruta) {
    const carpeta = path.dirname(ruta), ext = ruta.endsWith(".zamorapp") ? ".adjuntos.zamorapp" : ".adjuntos.tar";
    try { return fs.readdirSync(carpeta).filter((f) => f.startsWith("zamorapp-") && f.endsWith(ext)).sort().reverse().map((f) => path.join(carpeta, f)); }
    catch { return []; }
  }

  // Prepara una restauración: deja el volcado descifrado listo y el programa la aplica al arrancar de nuevo
  // (motor.iniciar: carga en una base aparte, la cambia por la actual y vuelve a aplicar migraciones).
  async prepararRestauracion(archivo, clave) {
    const ruta = path.resolve(String(archivo || ""));
    if (!fs.existsSync(ruta)) throw new Error("No existe ese archivo de respaldo");
    fs.mkdirSync(this.carpetaLocal, { recursive: true });
    const destino = path.join(this.carpetaLocal, "restaurar.dump");
    const k = clave || this.#cfg().clave || "";
    if (ruta.endsWith(".zamorapp")) await descifrarArchivo(ruta, destino, k);
    else fs.copyFileSync(ruta, destino);
    // Fase C.2: con la base va el paquete de adjuntos más reciente de esa carpeta que se pueda abrir. Si ninguno
    // abre (clave distinta, archivo dañado), la base se restaura igual y se avisa (Analizar).
    let adjuntos = null, paquete = null, avisoAdjuntos = null;
    const candidatos = this.#paquetesAdjuntosPara(ruta);
    for (const p of candidatos) {
      const tmp = path.join(this.carpetaLocal, "restaurar.adjuntos.tar");
      try {
        if (p.endsWith(".zamorapp")) await descifrarArchivo(p, tmp, k); else fs.copyFileSync(p, tmp);
        adjuntos = tmp; paquete = p; break;
      } catch (e) { avisoAdjuntos = `${path.basename(p)}: ${e.message}`; this.registro(`[respaldo] paquete de adjuntos ${p} no se pudo abrir: ${e.message}`); }
    }
    if (candidatos.length && !paquete) avisoAdjuntos = `Los adjuntos no se pudieron abrir con esa clave (${avisoAdjuntos}); se restaura solo la base`;
    else if (paquete && paquete !== candidatos[0]) avisoAdjuntos = `El paquete de adjuntos más nuevo no abrió; se usa ${path.basename(paquete)}`;
    else avisoAdjuntos = null;
    this.estado.d.restaurar = { archivo: destino, adjuntos, origen: ruta, origenAdjuntos: paquete, avisoAdjuntos, pedido: this.nube.reloj.iso() };
    this.estado.guardar();
    return { listo: true, archivo: destino, adjuntos: Boolean(adjuntos), aviso: avisoAdjuntos || undefined,
      mensaje: "Cierra y vuelve a abrir zamorApp Escritorio: al arrancar se restaura la copia y luego se sincroniza con la nube." };
  }
}

// Archivo cifrado: MAGIA + sal(16) + iv(12) + cifrado + etiqueta(16). Clave = scrypt(clave de respaldo, sal)
// Devuelve la huella SHA-256 del original (para la prueba de descifrado)
export async function cifrarArchivo(origen, destino, clave) {
  const sal = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const k = crypto.scryptSync(String(clave), sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const cifrador = crypto.createCipheriv("aes-256-gcm", k, iv);
  const salida = fs.createWriteStream(`${destino}.parcial`);
  salida.write(Buffer.concat([MAGIA, sal, iv]));
  const huella = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(origen), async function* (fuente) { for await (const trozo of fuente) { huella.update(trozo); yield trozo; } }, cifrador, salida);
  fs.appendFileSync(`${destino}.parcial`, cifrador.getAuthTag());
  fs.renameSync(`${destino}.parcial`, destino);
  return huella.digest("hex");
}

// Lee la cabecera y deja listo el descifrador; el contenido se manda a «destino» (archivo o un hash)
function abrirCifrado(origen, clave) {
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
  return { lector: fs.createReadStream(origen, { start: cab.length, end: tam - 17 }), d };
}

// Prueba de descifrado sin escribir nada en disco: huella y tamaño del contenido descifrado
export async function verificarArchivo(origen, clave) {
  const { lector, d } = abrirCifrado(origen, clave);
  const huella = crypto.createHash("sha256");
  let bytes = 0;
  try { await pipeline(lector, d, async function (fuente) { for await (const trozo of fuente) { huella.update(trozo); bytes += trozo.length; } }); }
  catch { throw new Error("La clave de respaldo no es la correcta o el archivo está dañado"); }
  return { huella: huella.digest("hex"), bytes };
}

export async function descifrarArchivo(origen, destino, clave) {
  const { lector, d } = abrirCifrado(origen, clave);
  try {
    await pipeline(lector, d, fs.createWriteStream(`${destino}.parcial`));
  } catch {
    fs.rmSync(`${destino}.parcial`, { force: true });
    throw new Error("La clave de respaldo no es la correcta o el archivo está dañado");
  }
  fs.renameSync(`${destino}.parcial`, destino);
}
