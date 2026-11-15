// Prepara un archivo antes de subirlo a «adjuntos»: PDF tal cual; las fotos se vuelven a dibujar en un lienzo,
// lo que borra el EXIF (ubicación GPS, equipo, fecha) y las achica a 2400 px como máximo.
// Solo salen PDF, JPG o PNG: es lo único que acepta la base.
import { COLUMNAS_ADJUNTO, MAX_ADJUNTO, type Adjunto } from "@/lib/adjuntos-tipos";
import type { crearClienteNavegador } from "@/lib/supabase/client";

const LADO_MAX = 2400;

export async function prepararArchivo(archivo: File): Promise<File> {
  if (archivo.type === "application/pdf") {
    if (archivo.size > MAX_ADJUNTO) throw new Error(`${archivo.name} pesa más de 10 MB.`);
    return archivo;
  }
  if (!archivo.type.startsWith("image/")) throw new Error(`${archivo.name}: solo se aceptan PDF o fotos.`);
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${archivo.name}: este equipo no puede leer ese formato. Guárdala como JPG o PDF.`);
  }
  const escala = Math.min(1, LADO_MAX / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  const ctx = lienzo.getContext("2d")!;
  // Escaneos en PNG quedan en PNG (texto nítido); el resto, JPG
  const png = archivo.type === "image/png";
  if (!png) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, lienzo.width, lienzo.height); }
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();
  const tipo = png ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, tipo, 0.85));
  if (!blob) throw new Error(`No se pudo procesar ${archivo.name}.`);
  if (blob.size > MAX_ADJUNTO) throw new Error(`${archivo.name} pesa más de 10 MB aun comprimida.`);
  const base = archivo.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${base}.${png ? "png" : "jpg"}`, { type: tipo });
}

// Sube el archivo ya preparado al bucket privado y lo registra. Devuelve la fila o lanza el error.
export async function subirAdjunto(
  supabase: ReturnType<typeof crearClienteNavegador>,
  datos: { orgId: string; trabajadorId: string; consultaId?: string | null; examenes?: string[]; descripcion?: string },
  original: File,
) {
  const archivo = await prepararArchivo(original);
  const limpio = archivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
  const ruta = `${datos.orgId}/${datos.trabajadorId}/${crypto.randomUUID()}-${limpio}`;
  const { error: e1 } = await supabase.storage.from("adjuntos").upload(ruta, archivo, { contentType: archivo.type });
  if (e1) throw new Error(`No se pudo subir ${original.name}: ${e1.message}`);
  const { data, error: e2 } = await supabase
    .from("adjuntos")
    .insert({ org_id: datos.orgId, trabajador_id: datos.trabajadorId, consulta_id: datos.consultaId ?? null, nombre: archivo.name, ruta, tipo_mime: archivo.type, tamano: archivo.size, examenes: datos.examenes ?? [], ...(datos.descripcion ? { descripcion: datos.descripcion } : {}) })
    .select(COLUMNAS_ADJUNTO)
    .single();
  if (e2) {
    await supabase.storage.from("adjuntos").remove([ruta]);
    throw new Error(`No se pudo registrar ${original.name}: ${e2.message}`);
  }
  return data as unknown as Adjunto;
}
