import "server-only";
import { request } from "node:https";
import { connect, rootCertificates, type PeerCertificate } from "node:tls";
import { X509Certificate } from "node:crypto";
import { leerHtmlBcv, leerJsonRespaldo, type TasaLeida } from "@/lib/tasa-bcv";

// Fuentes de la tasa BCV (solo servidor). El portal del BCV no envía el certificado intermedio de su cadena: los
// navegadores lo bajan solos (AIA) pero Node no, y fetch fallaba siempre en Vercel; el respaldo solo trae la tasa de hoy,
// nunca la de mañana (06-nov-2026: el BCV publicaba 09-nov y se guardaba nada). Aquí se hace lo mismo que el navegador:
// se lee del certificado del BCV la dirección pública de su emisor, se baja ese intermedio y se conecta CON verificación
// completa contra las raíces de confianza de Node. Nunca se desactiva la verificación TLS.

const ESPERA_MS = 15_000;
const UA = "Mozilla/5.0 (compatible; zamorApp-Ocupacional/1.0)";
let intermedioBcv: string | null = null; // se guarda en memoria mientras viva la función

const motivo = (e: unknown) => {
  const c = (e as { cause?: { code?: string; message?: string } })?.cause;
  return (c?.code ?? c?.message ?? (e as Error)?.message ?? String(e)).slice(0, 80);
};

async function traer(url: string) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ESPERA_MS), headers: { "User-Agent": UA } });
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

async function intermedioPorAia(host: string): Promise<string | null> {
  const c = await certificadoDe(host);
  const uri = (c?.infoAccess as Record<string, string[]> | undefined)?.["CA Issuers - URI"]?.[0];
  if (!uri) return null;
  const der = Buffer.from(await (await traer(uri)).arrayBuffer());
  try {
    return new X509Certificate(der).toString(); // DER o PEM → PEM
  } catch {
    return null;
  }
}

// GET con las raíces de Node más el intermedio del BCV; la verificación TLS sigue completa
function getConIntermedio(url: string, intermedio: string): Promise<string> {
  return new Promise((ok, mal) => {
    const req = request(url, { method: "GET", ca: [...rootCertificates, intermedio], headers: { "User-Agent": UA }, timeout: ESPERA_MS }, (res) => {
      if ((res.statusCode ?? 0) >= 400) { res.resume(); mal(new Error(`HTTP ${res.statusCode}`)); return; }
      const partes: Buffer[] = [];
      res.on("data", (d: Buffer) => partes.push(d));
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
    return await (await traer(url)).text();
  } catch (e) {
    fallas.push(`bcv directo: ${motivo(e)}`);
  }
  try {
    intermedioBcv ??= await intermedioPorAia("www.bcv.org.ve");
    if (!intermedioBcv) { fallas.push("bcv: sin intermedio AIA"); return null; }
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
