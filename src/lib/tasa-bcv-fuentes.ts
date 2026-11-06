import "server-only";
import { request } from "node:https";
import { connect, rootCertificates, type PeerCertificate } from "node:tls";
import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { ahora } from "@/lib/fecha";
import { leerHtmlBcv, leerJsonRespaldo, type TasaLeida } from "@/lib/tasa-bcv";

// Fuentes de la tasa BCV (solo servidor). El portal del BCV no envía el certificado intermedio de su cadena: los
// navegadores lo bajan solos (AIA) pero Node no, y fetch fallaba siempre en Vercel; el respaldo solo trae la tasa de hoy,
// nunca la de mañana (06-nov-2026: el BCV publicaba 09-nov y se guardaba nada). Aquí se hace lo mismo que el navegador:
// se lee del certificado del BCV la dirección pública de su emisor, se baja ese intermedio y se conecta CON verificación
// completa contra las raíces de confianza de Node. Nunca se desactiva la verificación TLS.

const ESPERA_MS = 15_000;
const UA = "Mozilla/5.0 (compatible; zamorApp-Ocupacional/1.0)";
const TOPE_AIA = 64 * 1024;
const TOPE_HTML = 2 * 1024 * 1024;
let intermedioBcv: string | null = null; // se guarda en memoria mientras viva la función

const motivo = (e: unknown) => {
  const c = (e as { cause?: { code?: string; message?: string } })?.cause;
  return (c?.code ?? c?.message ?? (e as Error)?.message ?? String(e)).slice(0, 80);
};

async function traer(url: string, redirect: RequestRedirect = "follow") {
  const r = await fetch(url, { cache: "no-store", redirect, signal: AbortSignal.timeout(ESPERA_MS), headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

// Certificado que presenta el servidor: solo se usa para saber dónde publica su emisor (no se confía en nada más)
function certificadoDe(host: string): Promise<PeerCertificate | null> {
  return new Promise((ok) => {
    const s = connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate();
      s.end();
      ok(c && Object.keys(c).length ? c : null);
    });
    s.setTimeout(ESPERA_MS, () => { s.destroy(); ok(null); });
    s.on("error", () => ok(null));
  });
}

// Lee un cuerpo con tope de tamaño (no se baja más de lo necesario)
async function bytesConTope(r: Response, tope: number): Promise<Buffer> {
  if (Number(r.headers.get("content-length") ?? 0) > tope) throw new Error("respuesta demasiado grande");
  const partes: Uint8Array[] = [];
  let n = 0;
  const lector = r.body?.getReader();
  if (!lector) return Buffer.alloc(0);
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    n += value.length;
    if (n > tope) { await lector.cancel(); throw new Error("respuesta demasiado grande"); }
    partes.push(value);
  }
  return Buffer.concat(partes);
}

// Solo direcciones públicas por nombre: nada de IP ni hosts internos
function uriAiaValida(uri: string): boolean {
  try {
    const u = new URL(uri);
    const h = u.hostname.toLowerCase();
    return (u.protocol === "http:" || u.protocol === "https:") && !isIP(h.replace(/^\[|\]$/g, "")) && h.includes(".")
      && !/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h);
  } catch {
    return false;
  }
}

let raices: X509Certificate[] | null = null;
// El intermedio solo se acepta si es una CA vigente emitida Y firmada por una raíz de confianza de Node (Analizar,
// 06-nov): así un intermediario no puede colar una CA propia.
function intermedioConfiable(x: X509Certificate): boolean {
  if (!x.ca) return false;
  const t = ahora();
  if (!(Date.parse(x.validFrom) <= t && t <= Date.parse(x.validTo))) return false;
  raices ??= rootCertificates.flatMap((pem) => { try { return [new X509Certificate(pem)]; } catch { return []; } });
  return raices.some((r) => x.checkIssued(r) && x.verify(r.publicKey));
}

async function intermedioPorAia(host: string, fallas: string[]): Promise<string | null> {
  const c = await certificadoDe(host);
  const uri = (c?.infoAccess as Record<string, string[]> | undefined)?.["CA Issuers - URI"]?.[0];
  if (!uri) { fallas.push("bcv: sin dirección AIA"); return null; }
  if (!uriAiaValida(uri)) { fallas.push("bcv: dirección AIA no válida"); return null; }
  const der = await bytesConTope(await traer(uri, "error"), TOPE_AIA) // sin redirecciones: no puede saltar a un host interno;
  let x: X509Certificate;
  try {
    x = new X509Certificate(der); // DER o PEM
  } catch {
    fallas.push("bcv: intermedio ilegible");
    return null;
  }
  if (!intermedioConfiable(x)) { fallas.push("bcv: intermedio no confiable"); return null; }
  return x.toString();
}

// GET con las raíces de Node más el intermedio ya verificado; la verificación TLS sigue completa. Sigue hasta 3
// redirecciones solo dentro del mismo host; cuerpo con tope de 2 MB.
function getConIntermedio(url: string, intermedio: string, saltos = 3): Promise<string> {
  return new Promise((ok, mal) => {
    const req = request(url, { method: "GET", ca: [...rootCertificates, intermedio], headers: { "User-Agent": UA }, timeout: ESPERA_MS }, (res) => {
      const st = res.statusCode ?? 0;
      if (st >= 300 && st < 400) {
        res.resume();
        const destino = res.headers.location ? new URL(res.headers.location, url) : null;
        if (!destino || destino.protocol !== "https:" || destino.host !== new URL(url).host || saltos <= 0) { mal(new Error(`redirección ${st}`)); return; }
        getConIntermedio(destino.toString(), intermedio, saltos - 1).then(ok, mal);
        return;
      }
      if (st >= 400) { res.resume(); mal(new Error(`HTTP ${st}`)); return; }
      const partes: Buffer[] = [];
      let n = 0;
      res.on("data", (d: Buffer) => {
        n += d.length;
        if (n > TOPE_HTML) { req.destroy(new Error("respuesta demasiado grande")); return; }
        partes.push(d);
      });
      res.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
      res.on("error", mal);
    });
    req.on("timeout", () => req.destroy(new Error("tiempo agotado")));
    req.on("error", mal);
    req.end();
  });
}

async function htmlBcv(fallas: string[]): Promise<string | null> {
  const url = "https://www.bcv.org.ve/";
  try {
    return (await bytesConTope(await traer(url), TOPE_HTML)).toString("utf8");
  } catch (e) {
    fallas.push(`bcv directo: ${motivo(e)}`);
  }
  try {
    intermedioBcv ??= await intermedioPorAia("www.bcv.org.ve", fallas);
    if (!intermedioBcv) return null;
    return await getConIntermedio(url, intermedioBcv);
  } catch (e) {
    intermedioBcv = null;
    fallas.push(`bcv con intermedio: ${motivo(e)}`);
    return null;
  }
}

// Primero el BCV (trae la de mañana desde la tarde); si falla o cambió el formato, el respaldo (solo la de hoy).
export async function leerTasaBcv(): Promise<{ tasa: TasaLeida | null; fallas: string[] }> {
  const fallas: string[] = [];
  const html = await htmlBcv(fallas);
  if (html) {
    const l = leerHtmlBcv(html);
    if (l) return { tasa: { ...l, fuente: "bcv" }, fallas };
    fallas.push("bcv: formato no reconocido");
  }
  try {
    const l = leerJsonRespaldo(await (await traer("https://ve.dolarapi.com/v1/dolares/oficial")).json());
    if (l) return { tasa: { ...l, fuente: "respaldo" }, fallas };
    fallas.push("respaldo: formato no reconocido");
  } catch (e) {
    fallas.push(`respaldo: ${motivo(e)}`);
  }
  return { tasa: null, fallas };
}
