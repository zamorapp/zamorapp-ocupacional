// «Firmar y sellar PDF» (Documentos › Firmar y sellar PDF): estampa la firma y el sello del médico en cualquier PDF,
// todo en el equipo (pdf.js para ver, pdf-lib para escribir). El PDF nunca se sube: solo se leen las imágenes por
// firma_sello() con la sesión de quien firma.
import type { PDFPageProxy } from "pdfjs-dist";

// Caja en fracciones de la página tal como se ve (0 a 1, origen arriba a la izquierda)
export type Caja = { x: number; y: number; w: number; h: number };
export type Imagen = { url: string; proporcion: number }; // proporcion = alto / ancho
export type Colocacion = { firma: Caja | null; sello: Caja | null };

// Ancho base de cada imagen respecto del ancho de la página (tamaño 100 %)
export const ANCHO_FIRMA = 0.24;
export const ANCHO_SELLO = 0.15;

const limitar = (c: Caja): Caja => ({ ...c, x: Math.min(Math.max(c.x, 0), Math.max(1 - c.w, 0)), y: Math.min(Math.max(c.y, 0), Math.max(1 - c.h, 0)) });

// Abajo a la derecha: la firma y, a su derecha, el sello, sobre el margen inferior
export function cajasAbajo(firma: Imagen | null, sello: Imagen | null, tam: number, relacion: number): Colocacion {
  const fw = ANCHO_FIRMA * tam, sw = ANCHO_SELLO * tam;
  const fh = firma ? (fw * firma.proporcion) / relacion : 0, sh = sello ? (sw * sello.proporcion) / relacion : 0;
  const base = 0.93;
  const sx = 0.93 - (sello ? sw : 0);
  return {
    sello: sello ? limitar({ x: sx, y: base - sh, w: sw, h: sh }) : null,
    firma: firma ? limitar({ x: (sello ? sx - 0.01 : 0.93) - fw, y: base - fh, w: fw, h: fh }) : null,
  };
}

// Donde el texto de la página dice «Firma» (la última vez que aparece): la firma encima de esa palabra y el sello a su
// derecha. Si no lo encuentra devuelve null y se usa «abajo a la derecha».
export async function cajasDondeDiceFirma(pagina: PDFPageProxy, firma: Imagen | null, sello: Imagen | null, tam: number): Promise<Colocacion | null> {
  const vista = pagina.getViewport({ scale: 1 });
  const texto = await pagina.getTextContent();
  let ancla: { x: number; y: number; ancho: number } | null = null;
  for (const it of texto.items) {
    if (!("str" in it) || !/firma/i.test(it.str)) continue;
    const [x, y] = vista.convertToViewportPoint(it.transform[4], it.transform[5]);
    const ancho = Math.abs(it.width * (vista.scale ?? 1));
    // Se queda con la más baja de la página (en informes suele ser la del médico, al pie)
    if (!ancla || y > ancla.y) ancla = { x, y, ancho };
  }
  if (!ancla) return null;
  const relacion = vista.height / vista.width;
  const fw = ANCHO_FIRMA * tam, sw = ANCHO_SELLO * tam;
  const fh = firma ? (fw * firma.proporcion) / relacion : 0, sh = sello ? (sw * sello.proporcion) / relacion : 0;
  const cx = (ancla.x + ancla.ancho / 2) / vista.width;
  // La palabra suele ir bajo la raya: la imagen termina un poco por encima del texto
  const pie = ancla.y / vista.height - 0.018;
  const f = firma ? limitar({ x: cx - fw / 2, y: pie - fh, w: fw, h: fh }) : null;
  const s = sello ? limitar({ x: (f ? f.x + f.w + 0.01 : cx - sw / 2), y: pie - sh * 0.85, w: sw, h: sh }) : null;
  return { firma: f, sello: s };
}

const bytesDe = (dataUrl: string) => {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

// Escribe las imágenes en las páginas pedidas. «colocar» da, para cada página (índice desde 0), las cajas en fracciones
// de la página vista; la conversión a puntos PDF respeta el recorte (CropBox) y el giro de cada página.
export async function estamparPdf(
  original: ArrayBuffer,
  imagenes: { firma: string | null; sello: string | null },
  paginas: number[],
  colocar: (indice: number) => Promise<Colocacion>,
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(original, { ignoreEncryption: true });
  const incrustar = async (u: string | null) => (u ? (/^data:image\/jpe?g/i.test(u) ? doc.embedJpg(bytesDe(u)) : doc.embedPng(bytesDe(u))) : null);
  const [firma, sello] = await Promise.all([incrustar(imagenes.firma), incrustar(imagenes.sello)]);
  for (const i of paginas) {
    const p = doc.getPage(i);
    const giro = (((p.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    const caja = p.getCropBox();
    // Tamaño de la página tal como se ve (girada)
    const anchoV = giro % 180 === 0 ? caja.width : caja.height;
    const altoV = giro % 180 === 0 ? caja.height : caja.width;
    // Punto visto (px, py en puntos, origen arriba a la izquierda) → punto del PDF
    const aPdf = (px: number, py: number): [number, number] => {
      switch (giro) {
        case 90: return [caja.x + py, caja.y + px];
        case 180: return [caja.x + caja.width - px, caja.y + py];
        case 270: return [caja.x + caja.width - py, caja.y + caja.height - px];
        default: return [caja.x + px, caja.y + caja.height - py];
      }
    };
    const c = await colocar(i);
    for (const [img, k] of [[firma, c.firma], [sello, c.sello]] as const) {
      if (!img || !k) continue;
      const w = k.w * anchoV, h = k.h * altoV;
      // Ancla = esquina inferior izquierda tal como se ve; la imagen gira con la página para verse derecha
      const [x, y] = aPdf(k.x * anchoV, (k.y + k.h) * altoV);
      p.drawImage(img, { x, y, width: w, height: h, rotate: degrees(giro) });
    }
  }
  return doc.save();
}
