import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { claveAvisos, pushConfigurado } from "@/lib/push";
import { clienteAnonimo } from "@/lib/supabase/anonimo";
import { limpiarLlave } from "@/lib/llaves";

// PDF aplanado del enlace del paciente (Cesar, 06-nov: «sí firma en enlace»). Las hojas firmadas salen con la imagen
// de la firma y el sello, pero esas imágenes NUNCA llegan al navegador del paciente:
//   1. El paciente toca «Descargar PDF» → GET /api/pdf?registro=<token>&tipo=…
//   2. Ese servidor abre la misma hoja (/registro/<token>/documento/<tipo>) en su Chromium, con una cabecera secreta.
//   3. Solo con esa cabecera la página pide las imágenes a la base (firma_registro_pdf, con la clave del servidor) y las
//      pinta; el PDF que baja el paciente ya las trae incrustadas. Sin la cabecera la hoja sale como siempre, sin imágenes.
// La cabecera sale de la llave privada de los avisos (solo en Vercel), con otra etiqueta que la clave de la base.
export const CABECERA_PDF = "x-zamorapp-pdf-registro";

export const pdfRegistroDisponible = () => pushConfigurado();

const secretoPdf = () => createHmac("sha256", limpiarLlave(process.env.VAPID_PRIVADA)).update("zamorapp-pdf-registro").digest("hex");

// ¿La pide el Chromium del propio servidor? (comparación en tiempo constante)
export function esChromiumDelServidor(valor: string | null): boolean {
  if (!valor || !pdfRegistroDisponible()) return false;
  const a = Buffer.from(valor), b = Buffer.from(secretoPdf());
  return a.length === b.length && timingSafeEqual(a, b);
}

export const cabeceraPdf = () => ({ [CABECERA_PDF]: secretoPdf() });

export type ImagenesFirma = { firma: string | null; sello: string | null };

// Firma y sello del médico que creó el enlace «Firmados a mi nombre». null si no corresponde (enlace vencido, sin firma,
// descarga cerrada o la organización no tiene la clave del servidor anotada).
export async function imagenesFirmaRegistro(token: string): Promise<ImagenesFirma | null> {
  const supabase = clienteAnonimo();
  if (!supabase || !pdfRegistroDisponible()) return null;
  const { data, error } = await supabase.rpc("firma_registro_pdf", { p_clave: claveAvisos(), p_token: token });
  if (error || !data) return null;
  const d = data as Partial<ImagenesFirma>;
  const imagen = (v: unknown) => (typeof v === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(v) ? v : null);
  const r = { firma: imagen(d.firma), sello: imagen(d.sello) };
  return r.firma || r.sello ? r : null;
}

// Turno para armar un PDF (máximo 20 por enlace: cada uno lanza un Chromium). false = sin turno → 429.
export async function reservarPdfRegistro(token: string): Promise<boolean> {
  const supabase = clienteAnonimo();
  if (!supabase || !pdfRegistroDisponible()) return false;
  const { data, error } = await supabase.rpc("reservar_pdf_registro", { p_clave: claveAvisos(), p_token: token });
  return !error && data === true;
}
