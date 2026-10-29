// Fase B: archivos adjuntos (exámenes escaneados, PDF del laboratorio) en la PC, con o sin internet.
// Se guardan en CONFIG.datos/adjuntos/<bucket>/<ruta> (la misma ruta que en la nube) y esperan en
// local.adjuntos_cola hasta subir con la sesión de la nube de quien los guardó. Lo que ya está en la PC se
// sirve desde el disco; lo que no, se baja de la nube una vez y queda guardado para verlo sin internet.
// Permisos: los mismos de la nube (RLS de clinico.adjuntos y es_clinico del bucket), comprobados en la base
// local con la identidad del token de la sesión. El archivo local nunca se borra solo.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { CONFIG } from "./config.mjs";

const BUCKETS = new Set(["adjuntos"]); // las firmas y sellos son data: en perfiles: no pasan por aquí
const TIPOS = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
const MAX_BYTES = 10 * 1024 * 1024; // el mismo tope del bucket y de validar_adjunto
const MAX_INTENTOS = 5;
const SEGUNDOS_FIRMA = 3600;
// Las URL firmadas vencen por performance.now() (no por la fecha de Windows, que Cesar cambia por el SAME) y solo
// valen en este arranque de la puerta: performance.now() vuelve a 0 al reiniciar, así que el arranque va en la firma.
const ARRANQUE = crypto.randomBytes(8).toString("hex");
// Bytes iniciales de cada tipo: un archivo que no empieza así no es lo que dice ser
const MAGICOS = { "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47] };
const esDelTipo = (bytes, tipo) => (MAGICOS[tipo] || []).every((b, i) => bytes[i] === b);
const noEncontrado = { statusCode: "404", error: "not_found", message: "Object not found" };

// <org>/<trabajador>/<archivo>: sin «..», sin barras invertidas ni caracteres de control
export function rutaSegura(ruta) {
  let r;
  try { r = decodeURIComponent(ruta); } catch { return null; }
  if (!r || r.length > 500 || r.startsWith("/") || /[\\\0-\x1f]/.test(r)) return null;
  const partes = r.split("/");
  return partes.length >= 2 && partes.every((p) => p && p !== "." && p !== "..") ? r : null;
}

// Archivo de un formulario multipart (así sube supabase-js un File/Blob desde el navegador)
export function archivoDeFormulario(cuerpo, tipoContenido) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(tipoContenido || "");
  if (!m) return null;
  const limite = Buffer.from(`--${m[1] || m[2]}`);
  let i = cuerpo.indexOf(limite);
  while (i >= 0) {
    const inicio = i + limite.length + 2; // salta \r\n
    const fin = cuerpo.indexOf(limite, inicio);
    if (fin < 0) break;
    const parte = cuerpo.subarray(inicio, fin - 2); // sin el \r\n antes del límite
    const corte = parte.indexOf("\r\n\r\n");
    if (corte >= 0) {
      const cab = parte.subarray(0, corte).toString("utf8");
      // La parte del archivo: la que trae filename o la que no se llama cacheControl/metadata
      if (/filename=/i.test(cab) || !/name="(cacheControl|metadata)"/i.test(cab)) {
        const tipo = /content-type:\s*([^\r\n;]+)/i.exec(cab)?.[1]?.trim().toLowerCase();
        return { bytes: parte.subarray(corte + 4), tipo };
      }
    }
    i = fin;
  }
  return null;
}

// escrituraLocal(): true cuando la fase A guarda las filas en la PC. Hasta entonces, sin internet no se aceptan
// archivos nuevos (la fila de clinico.adjuntos no se podría guardar y el archivo quedaría huérfano en la nube).
export function crearAdjuntos({ estado, nube, motor, registro = () => {}, carpeta = path.join(CONFIG.datos, "adjuntos"), escrituraLocal = () => false }) {
  const d = () => estado.d;
  // Clave propia para las URL firmadas, derivada del secreto de la PC (no sirve como token de sesión)
  const clave = () => crypto.createHmac("sha256", d().jwtSecreto).update("zamorapp:adjuntos").digest();
  const archivo = (bucket, ruta) => {
    const destino = path.resolve(carpeta, bucket, ruta);
    if (!destino.startsWith(path.resolve(carpeta, bucket) + path.sep)) throw new Error("ruta fuera de la carpeta de adjuntos");
    return destino;
  };
  const tipoDe = (ruta) => TIPOS[path.extname(ruta).toLowerCase()] || "application/octet-stream";

  async function conBase(fn) {
    const c = new pg.Client({ connectionString: motor.url() });
    await c.connect();
    try { return await fn(c); } finally { await c.end().catch(() => {}); }
  }

  // ¿Puede esta sesión ver (o subir) el archivo? Igual que en la nube: la fila de clinico.adjuntos visible con su RLS,
  // o, para subir, es_clinico de la organización (primera carpeta de la ruta, como la política del bucket).
  async function permiso(quien, ruta, paraSubir) {
    const org = ruta.split("/")[0];
    if (!/^[0-9a-f-]{36}$/i.test(org)) return false;
    return conBase(async (c) => {
      await c.query("begin");
      try {
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: quien.uid, role: "authenticated", aal: quien.aal })]);
        await c.query("set local role authenticated");
        const { rows: [r] } = await c.query(
          `select public.es_clinico($1::uuid) as clinico, exists (select 1 from public.adjuntos where ruta = $2) as fila`, [org, ruta]);
        return paraSubir ? r.clinico : r.fila;
      } finally { await c.query("rollback").catch(() => {}); }
    });
  }
  // La copia local puede ir atrasada (p. ej. un miembro reactivado en la nube que aún no bajó): con internet, antes
  // de negar una subida se le pregunta a la nube, que es la que decide (CI del #119 con PostgREST real, 29-oct-2026).
  async function clinicoEnLaNube(quien, ruta) {
    if (!nube.enLinea) return false;
    try { return (await nube.rpc(quien.uid, "es_clinico", { p_org: ruta.split("/")[0] })) === true; } catch { return false; }
  }
  const enCola = (bucket, ruta) => conBase(async (c) =>
    (await c.query("select autor, tipo, estado from local.adjuntos_cola where bucket = $1 and ruta = $2", [bucket, ruta])).rows[0] || null);

  const firmarUrl = (bucket, ruta, uid) => {
    const datos = Buffer.from(JSON.stringify({ b: bucket, r: ruta, u: uid, a: ARRANQUE, e: Math.round(performance.now()) + SEGUNDOS_FIRMA * 1000 })).toString("base64url");
    const firma = crypto.createHmac("sha256", clave()).update(datos).digest("base64url");
    // Misma forma que la nube: supabase-js arma encodeURI(<url>/storage/v1 + signedURL), así que va sin codificar
    return `/object/sign/${bucket}/${ruta}?token=${datos}.${firma}`;
  };
  const leerFirma = (token) => {
    const [datos, firma] = String(token || "").split(".");
    if (!datos || !firma) return null;
    const esperada = crypto.createHmac("sha256", clave()).update(datos).digest();
    const dada = Buffer.from(firma, "base64url");
    if (dada.length !== esperada.length || !crypto.timingSafeEqual(dada, esperada)) return null;
    try {
      const v = JSON.parse(Buffer.from(datos, "base64url"));
      return v.a === ARRANQUE && v.e >= performance.now() ? v : null;
    } catch { return null; }
  };

  function enviarArchivo(res, ruta, destino, extra = {}) {
    const bytes = fs.readFileSync(destino);
    res.writeHead(200, { "Content-Type": tipoDe(ruta), "Content-Length": bytes.length, "Cache-Control": "private, max-age=600", ...extra });
    res.end(bytes);
  }

  // Lo que no está en la PC se baja de la nube con la sesión del usuario y queda guardado (para verlo sin internet)
  async function bajarDeLaNube(bucket, ruta, uid) {
    if (!await nube.confirmar()) return false;
    const token = await nube.token(uid).catch(() => null);
    if (!token) return false;
    try {
      const r = await fetch(`${CONFIG.nube}/storage/v1/object/authenticated/${bucket}/${ruta.split("/").map(encodeURIComponent).join("/")}`, {
        headers: { apikey: CONFIG.nubeAnon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) return false;
      escribir(archivo(bucket, ruta), Buffer.from(await r.arrayBuffer()));
      return true;
    } catch (e) {
      nube.marcarCaida(`al bajar un adjunto: ${e.message}`);
      return false;
    }
  }

  function escribir(destino, bytes) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const tmp = `${destino}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, destino);
  }

  let subiendo = null;
  const subirPronto = () => setTimeout(() => { subir().catch((e) => registro(`[adjuntos] ${e.message}`)); }, 1500).unref?.();

  // Sube la cola en el orden en que se guardó, con la sesión de la nube de cada autor. La llama la sincronía
  // DESPUÉS de las filas (así clinico.adjuntos ya está en la nube cuando llega el archivo). 409 = ya estaba.
  async function subir() {
    if (subiendo) return subiendo;
    subiendo = (async () => {
      let subidos = 0, rechazados = 0;
      if (!await nube.confirmar()) return { subidos, rechazados };
      const pendientes = await conBase(async (c) =>
        (await c.query("select id, bucket, ruta, tipo, autor, intentos from local.adjuntos_cola where estado = 'pendiente' order by orden limit 200")).rows);
      for (const p of pendientes) {
        const token = await nube.token(p.autor).catch(() => null);
        if (!token) continue; // sin sesión del autor en la nube: espera a que vuelva a entrar con internet
        let bytes;
        try { bytes = fs.readFileSync(archivo(p.bucket, p.ruta)); } catch {
          await conBase((c) => c.query("update local.adjuntos_cola set estado = 'rechazado', motivo = 'El archivo ya no está en la PC' where id = $1", [p.id]));
          rechazados++;
          continue;
        }
        let r;
        try {
          r = await fetch(`${CONFIG.nube}/storage/v1/object/${p.bucket}/${p.ruta.split("/").map(encodeURIComponent).join("/")}`, {
            // POST sin upsert: el bucket no tiene UPDATE a propósito (nada clínico se reemplaza en la nube). Si un corte
            // por tiempo dejó el archivo arriba, el reintento recibe 409 y cuenta como subido.
            method: "POST", body: bytes, signal: AbortSignal.timeout(120000),
            headers: { apikey: CONFIG.nubeAnon, Authorization: `Bearer ${token}`, "content-type": p.tipo, "cache-control": "max-age=3600" },
          });
        } catch (e) {
          nube.marcarCaida(`al subir adjuntos: ${e.message}`);
          break;
        }
        if (r.ok || r.status === 409) {
          await conBase((c) => c.query("update local.adjuntos_cola set estado = 'subido', motivo = null where id = $1", [p.id]));
          subidos++;
          continue;
        }
        if (r.status >= 500) { registro(`[adjuntos] la nube respondió ${r.status}; se reintenta en la próxima sincronía`); break; }
        const motivo = (await r.text().catch(() => "")).slice(0, 300) || `HTTP ${r.status}`;
        const agotado = p.intentos + 1 >= MAX_INTENTOS;
        await conBase((c) => c.query("update local.adjuntos_cola set intentos = intentos + 1, motivo = $2, estado = $3 where id = $1",
          [p.id, motivo, agotado ? "rechazado" : "pendiente"]));
        if (agotado) rechazados++;
        registro(`[adjuntos] la nube rechazó un archivo (${r.status}, intento ${p.intentos + 1})`);
      }
      if (subidos || rechazados) registro(`[adjuntos] subidos ${subidos}, rechazados ${rechazados}`);
      return { subidos, rechazados };
    })().finally(() => { subiendo = null; });
    return subiendo;
  }

  async function contar() {
    try {
      return await conBase(async (c) => {
        const { rows: [r] } = await c.query("select count(*) filter (where estado = 'pendiente')::int pendientes, count(*) filter (where estado = 'rechazado')::int rechazados from local.adjuntos_cola");
        return r;
      });
    } catch { return { pendientes: null, rechazados: null }; }
  }

  // GET de una URL firmada por esta PC: no lleva sesión (la usan <img> e <iframe>), la firma dice quién y qué
  async function servirFirmado(req, res, ruta) {
    const m = /^\/storage\/v1\/object\/sign\/([a-z0-9_-]+)\/(.+)$/.exec(ruta);
    const token = new URL(req.url, "http://x").searchParams.get("token");
    if (!m || !BUCKETS.has(m[1]) || !token || token.split(".").length !== 2) return false; // firma de la nube: no es nuestra
    const v = leerFirma(token);
    const r = rutaSegura(m[2]);
    if (!v || !r || v.b !== m[1] || v.r !== r) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ statusCode: "400", error: "InvalidSignature", message: "La firma no es válida o venció" })); return true; }
    const destino = archivo(m[1], r);
    if (!fs.existsSync(destino) && !await bajarDeLaNube(m[1], r, v.u)) {
      res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify(noEncontrado)); return true;
    }
    enviarArchivo(res, r, destino);
    return true;
  }

  // Pedidos de storage con sesión. Devuelve false si no son de un bucket local (los atiende la nube como siempre).
  async function atender(req, res, ruta, crudo, quien, responderJson) {
    const responder = (...a) => { responderJson(...a); return true; }; // atendido: la puerta no sigue con la nube
    const u = new URL(req.url, "http://x");
    // Firmar varios: POST /storage/v1/object/sign/<bucket> {expiresIn, paths}
    let m = /^\/storage\/v1\/object\/sign\/([a-z0-9_-]+)$/.exec(ruta);
    if (m && req.method === "POST" && BUCKETS.has(m[1])) {
      let pedido = null;
      try { pedido = JSON.parse(crudo.toString("utf8")); } catch { /* se responde abajo */ }
      if (!Array.isArray(pedido?.paths)) return responder(res, 400, { statusCode: "400", error: "invalid", message: "Faltan las rutas" });
      const salida = [];
      for (const p of pedido.paths.slice(0, 1000)) {
        const r = rutaSegura(String(p));
        const ve = r && (await permiso(quien, r, false) || (await enCola(m[1], r))?.autor === quien.uid);
        if (!ve && r && await nube.confirmar()) return false; // la fila aún no bajó a la copia: que firme la nube
        salida.push(ve ? { path: p, signedURL: firmarUrl(m[1], r, quien.uid), error: null } : { path: p, signedURL: null, error: "Either the object does not exist or you do not have access to it" });
      }
      return responder(res, 200, salida);
    }
    m = /^\/storage\/v1\/object\/(sign|authenticated|)\/?([a-z0-9_-]+)\/(.+)$/.exec(ruta);
    if (!m || !BUCKETS.has(m[2])) return false;
    const [, accion, bucket] = m;
    const r = rutaSegura(m[3]);
    if (!r) return responder(res, 400, { statusCode: "400", error: "InvalidKey", message: "Ruta de archivo no válida" });
    const destino = archivo(bucket, r);

    // Subir: POST (nuevo) o PUT (reemplazar) /storage/v1/object/<bucket>/<ruta>
    if (accion === "" && (req.method === "POST" || req.method === "PUT")) {
      if (!escrituraLocal() && !await nube.confirmar()) return responder(res, 503, { statusCode: "503", error: "offline", message: "Sin conexión a internet: el archivo se podrá subir cuando vuelva la conexión." });
      if (!await permiso(quien, r, true) && !await clinicoEnLaNube(quien, r)) return responder(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      const formulario = /multipart\/form-data/i.test(req.headers["content-type"] || "") ? archivoDeFormulario(crudo, req.headers["content-type"]) : null;
      const bytes = formulario ? formulario.bytes : crudo;
      const tipo = (formulario?.tipo || String(req.headers["content-type"] || "").split(";")[0]).trim().toLowerCase();
      if (!Object.values(TIPOS).includes(tipo) || tipoDe(r) !== tipo) return responder(res, 415, { statusCode: "415", error: "invalid_mime_type", message: "Solo se aceptan PDF, JPG o PNG." });
      if (!bytes.length || bytes.length > MAX_BYTES) return responder(res, 413, { statusCode: "413", error: "Payload too large", message: "El archivo pesa más de 10 MB." });
      const reemplaza = req.method === "PUT" || req.headers["x-upsert"] === "true";
      if (bytes.length && !esDelTipo(bytes, tipo)) return responder(res, 415, { statusCode: "415", error: "invalid_mime_type", message: "El archivo no es un PDF, JPG o PNG válido." });
      // Reemplazar solo lo que aún no llegó a la nube (pendiente o rechazado): lo que ya está allá no se reemplaza,
      // igual que en la nube, donde el bucket no tiene UPDATE
      const duplicado = { statusCode: "409", error: "Duplicate", message: "The resource already exists" };
      if (fs.existsSync(destino) && (!reemplaza || !["pendiente", "rechazado"].includes((await enCola(bucket, r))?.estado))) return responder(res, 409, duplicado);
      escribir(destino, bytes);
      await conBase((c) => c.query(
        `insert into local.adjuntos_cola (bucket, ruta, tipo, tamano, autor) values ($1, $2, $3, $4, $5)
         on conflict (bucket, ruta) do update set tipo = excluded.tipo, tamano = excluded.tamano, autor = excluded.autor,
           estado = 'pendiente', motivo = null, intentos = 0, orden = nextval(pg_get_serial_sequence('local.adjuntos_cola', 'orden'))`,
        [bucket, r, tipo, bytes.length, quien.uid]));
      subirPronto();
      return responder(res, 200, { Id: crypto.randomUUID(), Key: `${bucket}/${r}` });
    }

    const ve = await permiso(quien, r, false) || (await enCola(bucket, r))?.autor === quien.uid;
    // Firmar uno: POST /storage/v1/object/sign/<bucket>/<ruta> {expiresIn}
    if (accion === "sign" && req.method === "POST") {
      if (!ve) {
        if (await nube.confirmar()) return false; // la fila aún no bajó a la copia: que firme la nube
        return responder(res, 400, noEncontrado);
      }
      return responder(res, 200, { signedURL: firmarUrl(bucket, r, quien.uid) });
    }
    // Bajar con sesión: GET /storage/v1/object/authenticated/<bucket>/<ruta> o /object/<bucket>/<ruta>
    if (req.method === "GET" && accion !== "sign") {
      if (!ve) {
        if (await nube.confirmar()) return false;
        return responder(res, 400, noEncontrado);
      }
      if (!fs.existsSync(destino) && !await bajarDeLaNube(bucket, r, quien.uid)) return responder(res, 400, noEncontrado);
      enviarArchivo(res, r, destino);
      return true;
    }
    return false;
  }

  // Borrar (DELETE /storage/v1/object/<bucket> {prefixes}): solo con internet; si la nube lo borra, se quita de la PC
  async function alBorrar(req, crudo, status) {
    const m = /^\/storage\/v1\/object\/([a-z0-9_-]+)$/.exec(req.url.split("?")[0]);
    if (!m || !BUCKETS.has(m[1]) || req.method !== "DELETE" || status >= 300) return;
    let rutas = [];
    try { rutas = JSON.parse(crudo.toString("utf8"))?.prefixes || []; } catch { return; }
    for (const p of rutas) {
      const r = rutaSegura(String(p));
      if (!r) continue;
      fs.rmSync(archivo(m[1], r), { force: true });
      await conBase((c) => c.query("delete from local.adjuntos_cola where bucket = $1 and ruta = $2", [m[1], r]));
    }
  }

  return { atender, servirFirmado, subir, contar, alBorrar, carpeta };
}
