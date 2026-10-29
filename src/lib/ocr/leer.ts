// Lector de laboratorio en el navegador: PDF con texto (pdfjs) o imagen/escaneo (Tesseract.js en un Worker).
// Todos sus archivos los sirve la app en /ocr (ver src/build/recursos-ocr.mjs): funciona sin internet y nada sale del equipo.
"use client";

import type { Linea } from "@/lib/ocr/interpretar";

export const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_PAGINAS = 20;
export const MAX_PAGINAS_LOTE = 40; // PDF del laboratorio con varios trabajadores (cada uno se relee con sus hojas)
const LADO_MAXIMO = 2400;

export type Avance = { texto: string; paso: number; total: number };
export type Pagina = { pagina: number; imagen: string; ancho: number; alto: number }; // imagen: objectURL para el visor

type Opciones = { avance: (a: Avance) => void; senal: AbortSignal; maxPaginas?: number };

class Cancelado extends Error {
  constructor() { super("Lectura cancelada."); }
}
const revisar = (s: AbortSignal) => { if (s.aborted) throw new Cancelado(); };
export const esCancelado = (e: unknown) => e instanceof Cancelado;

// Escala de grises y contraste estirado (percentiles 2–98): Tesseract lee mejor las cifras pálidas de las fotos
function preparar(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g;
    hist[g]++;
  }
  const total = d.length / 4;
  let acum = 0, bajo = 0, alto = 255;
  for (let v = 0; v < 256; v++) { acum += hist[v]; if (acum < total * 0.02) bajo = v; if (acum < total * 0.98) alto = v; }
  const rango = Math.max(1, alto - bajo);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.max(0, Math.min(255, ((d[i] - bajo) * 255) / rango));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
}

async function canvasDeImagen(archivo: Blob) {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

const aUrl = (c: HTMLCanvasElement) => new Promise<string>((ok) => c.toBlob((b) => ok(b ? URL.createObjectURL(b) : ""), "image/jpeg", 0.85));

// Tesseract en su propio Worker, con rutas fijas a los archivos de la app (nunca un CDN)
async function crearLector(o: Opciones) {
  const { createWorker } = await import("tesseract.js");
  o.avance({ texto: "Preparando el lector…", paso: 0, total: 1 });
  const worker = await createWorker("spa", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    gzip: true,
    workerBlobURL: false,
  });
  const cancelar = () => void worker.terminate();
  o.senal.addEventListener("abort", cancelar, { once: true });
  return {
    async leer(c: HTMLCanvasElement, pagina: number): Promise<Linea[]> {
      const { data } = await worker.recognize(c, {}, { blocks: true });
      const lineas: Linea[] = [];
      for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
        const texto = l.text.replace(/\s+/g, " ").trim();
        if (texto) lineas.push({ texto, confianza: l.confidence, pagina, caja: { x0: l.bbox.x0 / c.width, y0: l.bbox.y0 / c.height, x1: l.bbox.x1 / c.width, y1: l.bbox.y1 / c.height } });
      }
      return lineas;
    },
    cerrar: async () => { o.senal.removeEventListener("abort", cancelar); await worker.terminate(); },
  };
}

async function leerPdf(archivo: Blob, o: Opciones) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const tope = o.maxPaginas ?? MAX_PAGINAS;
    if (doc.numPages > tope) throw new Error(`El PDF tiene ${doc.numPages} páginas; el lector acepta hasta ${tope}.`);
    const lineas: Linea[] = [];
    const paginas: Pagina[] = [];
    let lector: Awaited<ReturnType<typeof crearLector>> | null = null;
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        revisar(o.senal);
        o.avance({ texto: `Leyendo página ${n} de ${doc.numPages}…`, paso: n - 1, total: doc.numPages });
        const pag = await doc.getPage(n);
        const vista = pag.getViewport({ scale: 2 });
        const c = document.createElement("canvas");
        c.width = Math.round(vista.width);
        c.height = Math.round(vista.height);
        await pag.render({ canvasContext: c.getContext("2d")!, viewport: vista, canvas: c } as Parameters<typeof pag.render>[0]).promise;
        paginas.push({ pagina: n, imagen: await aUrl(c), ancho: c.width, alto: c.height });
        // PDF digital: el texto ya viene en el archivo (exacto). Se arman las líneas por altura.
        const contenido = await pag.getTextContent();
        const items = contenido.items.flatMap((it) => ("str" in it && it.str.trim() ? [{ s: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || 10, w: it.width }] : []));
        if (items.reduce((s, i) => s + i.s.length, 0) >= 20) {
          const [, , , altoPdf] = pag.view;
          const filas: (typeof items)[] = [];
          for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
            const fila = filas.find((f) => Math.abs(f[0].y - it.y) < it.h * 0.5);
            if (fila) fila.push(it); else filas.push([it]);
          }
          for (const f of filas) {
            f.sort((a, b) => a.x - b.x);
            const x0 = Math.min(...f.map((i) => i.x)), x1 = Math.max(...f.map((i) => i.x + i.w));
            const y = f[0].y, h = Math.max(...f.map((i) => i.h));
            lineas.push({ texto: f.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim(), confianza: 100, pagina: n,
              caja: { x0: x0 / pag.view[2], x1: x1 / pag.view[2], y0: (altoPdf - y - h) / altoPdf, y1: (altoPdf - y + h * 0.3) / altoPdf } });
          }
        } else {
          // PDF escaneado (solo imagen): se lee la página como foto
          lector ??= await crearLector(o);
          revisar(o.senal);
          o.avance({ texto: `Leyendo página ${n} de ${doc.numPages} (escaneada)…`, paso: n - 1, total: doc.numPages });
          preparar(c);
          lineas.push(...(await lector.leer(c, n)));
        }
        pag.cleanup();
      }
    } finally {
      await lector?.cerrar();
    }
    return { lineas, paginas };
  } finally {
    await doc.destroy();
  }
}

async function leerFoto(archivo: Blob, o: Opciones) {
  const c = await canvasDeImagen(archivo);
  const paginas: Pagina[] = [{ pagina: 1, imagen: await aUrl(c), ancho: c.width, alto: c.height }];
  const lector = await crearLector(o);
  try {
    revisar(o.senal);
    o.avance({ texto: "Leyendo la imagen…", paso: 0, total: 1 });
    preparar(c);
    return { lineas: await lector.leer(c, 1), paginas };
  } finally {
    await lector.cerrar();
  }
}

/** Lee un resultado de laboratorio. Lanza un error claro si el archivo no se puede leer. */
export async function leerResultado(archivo: Blob, tipo: string, o: Opciones): Promise<{ lineas: Linea[]; paginas: Pagina[] }> {
  if (archivo.size > MAX_BYTES) throw new Error("El archivo pasa de 15 MB: el lector acepta hasta 15 MB.");
  try {
    return tipo === "application/pdf" ? await leerPdf(archivo, o) : await leerFoto(archivo, o);
  } catch (e) {
    if (o.senal.aborted) throw new Cancelado();
    throw e;
  }
}

/** Copia solo esas páginas a un PDF nuevo: así cada paciente recibe y guarda únicamente sus hojas. */
export async function extraerPaginas(archivo: Blob, paginas: number[]): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const origen = await PDFDocument.load(await archivo.arrayBuffer());
  const nuevo = await PDFDocument.create();
  for (const p of await nuevo.copyPages(origen, paginas.map((n) => n - 1))) nuevo.addPage(p);
  return new Blob([new Uint8Array(await nuevo.save())], { type: "application/pdf" });
}
