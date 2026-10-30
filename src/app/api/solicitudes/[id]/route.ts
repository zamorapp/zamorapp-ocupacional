import { crearClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Descarga el documento de respuesta de una solicitud con la sesión de quien lo pide:
// la vista y el bucket dejan pasar al servicio y, si la respuesta no es solo para el personal de salud, a la empresa dueña.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const [{ data: r }, { data: s }] = await Promise.all([
    supabase.from("solicitudes_respuesta").select("documento_ruta").eq("id", id).maybeSingle(),
    supabase.from("solicitudes").select("documento_nombre").eq("id", id).maybeSingle(),
  ]);
  if (!r?.documento_ruta || !s) return new Response("No encontrado", { status: 404 });
  const { data: archivo } = await supabase.storage.from("solicitudes").download(r.documento_ruta);
  if (!archivo) return new Response("No encontrado", { status: 404 });
  return new Response(archivo, {
    headers: {
      "Content-Type": archivo.type || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(s.documento_nombre ?? "documento")}`,
      "Cache-Control": "private, no-store",
    },
  });
}
