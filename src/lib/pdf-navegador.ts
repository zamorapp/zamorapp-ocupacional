import "server-only";
import { existsSync } from "node:fs";
import type { Browser } from "puppeteer-core";

// Chromium sin ventana: solo lo usa la ruta /api/pdf, la única función de Vercel que lleva su binario (67 MB).
// PDF generado en el servidor con la sesión de quien lo pide (nunca con la llave de servicio):
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

// Solo páginas de /imprimir de la propia app, ya normalizadas (%2e%2e, \.\. y similares se resuelven antes de comparar)
export function rutaImprimir(ruta: string, base = urlInterna()): string | null {
  try {
    const u = new URL(ruta, base);
    return u.origin === new URL(base).origin && u.pathname.startsWith("/imprimir/") ? u.href : null;
  } catch {
    return null;
  }
}

// Genera un PDF por cada ruta de /imprimir, en un solo navegador, con las cookies de la sesión. Mismo orden.
export async function pdfConNavegador(rutas: string[], sesion: { name: string; value: string }[]): Promise<Buffer[]> {
  const base = urlInterna();
  const destinos = rutas.map((r) => rutaImprimir(r, base));
  if (destinos.some((d) => !d)) throw new Error("Solo se convierten páginas de /imprimir");
  const navegador = await abrirNavegador();
  try {
    const pagina = await navegador.newPage();
    await pagina.setCookie(...sesion.map((c) => ({ name: c.name, value: c.value, url: base, httpOnly: true, secure: base.startsWith("https") })));
    await pagina.emulateMediaType("print");
    const salida: Buffer[] = [];
    for (const destino of destinos as string[]) {
      const respuesta = await pagina.goto(destino, { waitUntil: "networkidle0", timeout: 45_000 });
      if (!respuesta?.ok()) throw new Error(`No se pudo preparar el documento (${respuesta?.status() ?? "sin respuesta"}).`);
      if (new URL(pagina.url()).pathname.startsWith("/login")) throw new Error("La sesión venció: vuelve a entrar y repite el envío.");
      await pagina.evaluate(() => document.fonts.ready);
      // El índice del informe de vigilancia calcula sus páginas al abrir: se espera a que termine (máx. 10 s)
      await pagina.waitForFunction(() => document.documentElement.getAttribute("data-indice-paginas") !== "midiendo", { timeout: 10_000 }).catch(() => {});
      salida.push(Buffer.from(await pagina.pdf({ preferCSSPageSize: true, printBackground: true })));
    }
    return salida;
  } finally {
    await navegador.close();
  }
}

// PDF aplanado de una hoja del enlace del paciente (/registro/<token>/documento/…), sin sesión. La cabecera secreta va
// SOLO en la carga de esa página de la propia app (nunca a otro sitio ni a las imágenes): con ella la página incrusta la
// firma y el sello (registro-pdf.ts). Una sola hoja por llamada.
export async function pdfRegistroConNavegador(ruta: string, cabecera: Record<string, string>): Promise<Buffer> {
  const base = urlInterna();
  let destino: URL;
  try {
    destino = new URL(ruta, base);
  } catch {
    throw new Error("Ruta no válida");
  }
  if (destino.origin !== new URL(base).origin || !/^\/registro\/[A-Za-z0-9_-]{40,60}\/documento\/[a-z-]+$/.test(destino.pathname)) {
    throw new Error("Solo se convierten hojas del enlace del paciente");
  }
  const navegador = await abrirNavegador();
  try {
    const pagina = await navegador.newPage();
    await pagina.setRequestInterception(true);
    pagina.on("request", (r) => {
      const propia = r.isNavigationRequest() && r.frame() === pagina.mainFrame() && new URL(r.url()).origin === destino.origin
        && new URL(r.url()).pathname === destino.pathname;
      void (propia ? r.continue({ headers: { ...r.headers(), ...cabecera } }) : r.continue());
    });
    await pagina.emulateMediaType("print");
    const respuesta = await pagina.goto(destino.href, { waitUntil: "networkidle0", timeout: 45_000 });
    if (!respuesta?.ok() || new URL(pagina.url()).pathname !== destino.pathname) throw new Error("Tus documentos ya no están disponibles en este enlace.");
    await pagina.evaluate(() => document.fonts.ready);
    // La firma y el sello se redibujan con marca de agua (marcar-firmas.tsx): sin esa marca no se imprime nada
    await pagina.waitForFunction(() => document.documentElement.getAttribute("data-firmas") !== null, { timeout: 10_000 });
    const estado = await pagina.evaluate(() => ({
      marca: document.documentElement.getAttribute("data-firmas"),
      originales: Array.from(document.querySelectorAll<HTMLImageElement>('[data-prueba="firma-medico"] img')).some((i) => i.naturalWidth > 300),
      sinCargar: Array.from(document.querySelectorAll<HTMLImageElement>('[data-prueba="firma-medico"] img')).some((i) => !i.complete || !i.naturalWidth),
    }));
    if (estado.marca !== "listas" || estado.originales || estado.sinCargar) throw new Error("No se pudo preparar la firma del documento.");
    return Buffer.from(await pagina.pdf({ preferCSSPageSize: true, printBackground: true }));
  } finally {
    await navegador.close();
  }
}
