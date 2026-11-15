// Respaldo de los archivos de zamorApp (adjuntos y solicitudes del Storage) en la PC y en Google Drive.
// Uso: DATABASE_URL="postgresql://..." node scripts/respaldo-archivos.mjs <carpeta> [<carpeta2> ...]
// Sin llaves nuevas: con la clave de la base deja un pase de un solo uso (10 min) y la función respaldo-archivos de
// Supabase devuelve enlaces firmados de lectura. Copia incremental: solo baja lo nuevo o cambiado desde la última vez.
// Los archivos quedan en <carpeta>/archivos/<bucket>/<ruta>; nunca se borran del respaldo aunque se borren en la nube.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { configuracion } from "./conexion-segura.mjs";

const carpetas = process.argv.slice(2).map((c) => path.join(c, "archivos"));
if (!carpetas.length) throw new Error("Indica al menos una carpeta de destino");
const url = process.env.DATABASE_URL ?? "";
const funcion = process.env.RESPALDO_FUNCION_URL ?? urlFuncion(url);
const indiceRuta = path.join(carpetas[0], "indice.json");

const indice = leerIndice();
const bajados = [];
const errores = [];
let archivos = [];
try {
  const pase = crypto.randomBytes(32).toString("hex");
  await conBase((c) => c.query("insert into public.pases_respaldo (huella) values ($1)", [crypto.createHash("sha256").update(pase).digest("hex")]));
  const r = await fetch(funcion, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pase, desde: indice.hasta }),
    signal: AbortSignal.timeout(60_000) });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`la función respondió ${r.status}: ${cuerpo.error ?? ""}`);
  archivos = cuerpo.archivos ?? [];
} catch (e) {
  await anotar({ estado: "fallo", detalle: `No se pudo pedir la lista de archivos: ${e.message}` });
  throw e;
}

for (const a of archivos) {
  const clave = `${a.bucket}/${a.nombre}`;
  try {
    const destino = rutaSegura(carpetas[0], a.bucket, a.nombre);
    const previo = indice.archivos[clave];
    if (previo?.cambiado === a.cambiado && fs.existsSync(destino)) continue;
    if (!a.url) throw new Error("sin enlace firmado");
    const r = await fetch(a.url, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`descarga ${r.status}`);
    const contenido = Buffer.from(await r.arrayBuffer());
    if (a.bytes && contenido.length !== Number(a.bytes)) throw new Error(`tamaño ${contenido.length} en vez de ${a.bytes}`);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(`${destino}.parcial`, contenido);
    fs.renameSync(`${destino}.parcial`, destino);
    indice.archivos[clave] = { cambiado: a.cambiado, bytes: contenido.length };
    bajados.push(clave);
  } catch (e) {
    errores.push(`${clave}: ${e.message}`);
  }
}
// Solo se avanza la fecha si todo bajó: lo que falló se vuelve a pedir la próxima vez
if (!errores.length && archivos.length) indice.hasta = archivos.map((a) => a.cambiado).sort().at(-1);
fs.mkdirSync(carpetas[0], { recursive: true });
fs.writeFileSync(indiceRuta, JSON.stringify(indice));

// Las demás carpetas (Drive) se ponen al día con la de la PC: lo que falte o haya cambiado de tamaño
let copiados = 0;
const guardados = [carpetas[0]];
for (const carpeta of carpetas.slice(1)) {
  try {
    // Aunque todavía no haya archivos que copiar: el índice va igual (sin esto, ENOENT en Drive desde el 29-oct)
    fs.mkdirSync(carpeta, { recursive: true });
    for (const relativa of recorrer(carpetas[0])) {
      const origen = path.join(carpetas[0], relativa);
      const destino = path.join(carpeta, relativa);
      if (fs.existsSync(destino) && fs.statSync(destino).size === fs.statSync(origen).size) continue;
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(origen, destino);
      copiados++;
    }
    fs.copyFileSync(indiceRuta, path.join(carpeta, "indice.json")); // para retomar desde Drive en otra PC
    guardados.push(carpeta);
  } catch (e) {
    errores.push(`${carpeta}: ${e.message}`);
  }
}

const total = Object.keys(indice.archivos).length;
const estado = errores.length || guardados.length < 2 ? "aviso" : "ok";
const detalle = [...errores.slice(0, 5), ...(errores.length > 5 ? [`y ${errores.length - 5} más`] : []),
  ...(carpetas.length < 2 ? ["Google Drive no estaba abierto: los archivos quedaron solo en la PC"] : [])].join(" · ");
await anotar({ estado, filas: total, destinos: guardados.length, detalle });
console.log(`Archivos (${estado}): ${bajados.length} nuevos o cambiados, ${total} en total${copiados ? `, ${copiados} copiados a Drive` : ""}${detalle ? ` · ${detalle}` : ""}`);

function urlFuncion(conexion) {
  // El usuario del pooler es «postgres.<proyecto>»
  const proyecto = decodeURIComponent(new URL(conexion).username).split(".")[1];
  if (!proyecto) throw new Error("No pude deducir el proyecto de Supabase; define RESPALDO_FUNCION_URL");
  return `https://${proyecto}.supabase.co/functions/v1/respaldo-archivos`;
}

// La ruta viene de la nube: nunca puede salir de la carpeta del respaldo (sin «..», sin rutas absolutas ni unidades)
function rutaSegura(base, bucket, nombre) {
  const partes = [bucket, ...String(nombre).split("/")];
  if (partes.some((p) => !p || p === "." || p === ".." || /[\\:*?"<>|\0]/.test(p))) throw new Error("ruta no permitida");
  const destino = path.resolve(base, ...partes);
  if (!destino.startsWith(path.resolve(base) + path.sep)) throw new Error("ruta no permitida");
  return destino;
}

function* recorrer(base, relativa = "") {
  for (const e of fs.readdirSync(path.join(base, relativa), { withFileTypes: true })) {
    const r = path.join(relativa, e.name);
    if (e.isDirectory()) yield* recorrer(base, r);
    else if (!e.name.endsWith(".parcial") && r !== "indice.json") yield r;
  }
}

function leerIndice() {
  try {
    const i = JSON.parse(fs.readFileSync(indiceRuta, "utf8"));
    return { hasta: i.hasta ?? null, archivos: i.archivos ?? {} };
  } catch {
    return { hasta: null, archivos: {} };
  }
}

async function conBase(trabajo) {
  const c = new pg.Client({ ...configuracion(url), connectionTimeoutMillis: 30_000 });
  await c.connect();
  try { return await trabajo(c); } finally { await c.end().catch(() => {}); }
}

async function anotar(r) {
  try {
    await conBase((c) => c.query(
      `insert into public.respaldos (estado, tipo, filas, destinos, detalle, equipo)
       values ($1, 'archivos', $2, $3, left(nullif($4, ''), 2000), $5)`,
      [r.estado, r.filas ?? null, r.destinos ?? 0, r.detalle ?? "", os.hostname()]));
  } catch (e) {
    console.error(`No se pudo anotar el respaldo de archivos en la base: ${e.message}`);
  }
}
