import { crearClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Descarga el documento de respuesta de una solicitud con la sesión de quien lo pide:
// la RLS de la tabla y del bucket deja pasar solo al servicio y a la empresa dueña.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data: s } = await supabase.from("solicitudes").select("documento_ruta, documento_nombre").eq("id", id).maybeSingle();
  if (!s?.documento_ruta) return new Response("No encontrado", { status: 404 });
  const { data: archivo } = await supabase.storage.from("solicitudes").download(s.documento_ruta);
  if (!archivo) return new Response("No encontrado", { status: 404 });
  return new Response(archivo, {
    headers: {
      "Content-Type": archivo.type || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(s.documento_nombre ?? "documento")}`,
      "Cache-Control": "private, no-store",
    },
  });
}
