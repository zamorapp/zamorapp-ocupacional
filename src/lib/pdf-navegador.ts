import "server-only";
import { existsSync } from "node:fs";
import type { Browser } from "puppeteer-core";

// Chromium sin ventana: solo lo usa la ruta /api/pdf, la única función de Vercel que lleva su binario (67 MB).
// PDF generado en el servidor con la sesión de quien lo pide (nunca con service_role):
// un Chromium sin ventana abre la misma página de /imprimir que ve el usuario, con sus cookies,
// así la RLS decide qué datos salen y el PDF es idéntico al impreso.
// En Vercel usa @sparticuz/chromium; en la PC (escritorio o desarrollo) el Edge o Chrome instalado, o CHROME_PATH.

const CANDIDATOS = [
  process.env.CHROME_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
];

// Dirección de la propia app para el Chromium del servidor. Nunca sale de una cabecera del cliente
// (si no, alguien podría mandar las cookies de la sesión a otro sitio).
export function urlInterna() {
  if (process.env.ZAMORAPP_URL_INTERNA) return process.env.ZAMORAPP_URL_INTERNA.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}

async function abrirNavegador(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  const ruta = CANDIDATOS.find((r) => r && existsSync(r));
  if (!ruta) throw new Error("No se encontró Edge ni Chrome en este equipo para generar el PDF.");
  return puppeteer.launch({ executablePath: ruta, headless: true, args: ["--no-first-run", "--disable-extensions"] });
}

// Genera un PDF por cada ruta de /imprimir, en un solo navegador, con las cookies de la sesión. Mismo orden.
export async function pdfConNavegador(rutas: string[], sesion: { name: string; value: string }[]): Promise<Buffer[]> {
  if (rutas.some((r) => !r.startsWith("/imprimir/"))) throw new Error("Solo se convierten páginas de /imprimir");
  const base = urlInterna();
  const navegador = await abrirNavegador();
  try {
    const pagina = await navegador.newPage();
    await pagina.setCookie(...sesion.map((c) => ({ name: c.name, value: c.value, url: base, httpOnly: true, secure: base.startsWith("https") })));
    await pagina.emulateMediaType("print");
    const salida: Buffer[] = [];
    for (const ruta of rutas) {
      const respuesta = await pagina.goto(base + ruta, { waitUntil: "networkidle0", timeout: 45_000 });
      if (!respuesta?.ok()) throw new Error(`No se pudo preparar el documento (${respuesta?.status() ?? "sin respuesta"}).`);
      if (new URL(pagina.url()).pathname.startsWith("/login")) throw new Error("La sesión venció: vuelve a entrar y repite el envío.");
      await pagina.evaluate(() => document.fonts.ready);
      salida.push(Buffer.from(await pagina.pdf({ preferCSSPageSize: true, printBackground: true })));
    }
    return salida;
  } finally {
    await navegador.close();
  }
}
