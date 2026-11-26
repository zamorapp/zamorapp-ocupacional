import { crearClienteServidor } from "@/lib/supabase/server";
import { registrarActividadRRHH } from "@/lib/actividad-rrhh";
import { after } from "next/server";

export const dynamic = "force-dynamic";

// Descarga el documento de respuesta de una solicitud con la sesión de quien lo pide:
// la vista y el bucket dejan pasar al servicio y, si la respuesta no es solo para el personal de salud, a la empresa dueña.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const descarga = req.method === "GET" && new URL(req.url).searchParams.get("descargar") === "1";
  const disposicion = descarga ? "attachment" : "inline";
  const anotar = () => { if (descarga) after(() => registrarActividadRRHH(supabase, "documento_entregado", id)); };
  const { data: r } = await supabase.from("solicitudes_respuesta").select("documento_ruta, documento_nombre").eq("id", id).maybeSingle();
  if (!r) return new Response("No encontrado", { status: 404 });
  if (!r.documento_ruta) {
    // Respondida sola con la constancia de aptitud firmada: la base la entrega con las mismas reglas de la solicitud
    const { data } = await supabase.rpc("constancia_de_solicitud", { p_solicitud: id });
    const c = (data as { nombre: string; contenido_base64: string }[] | null)?.[0];
    if (!c) return new Response("La constancia ya no está disponible: haz una nueva solicitud.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    anotar();
    return new Response(Buffer.from(c.contenido_base64, "base64"), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposicion}; filename*=UTF-8''${encodeURIComponent(c.nombre)}`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const { data: archivo } = await supabase.storage.from("solicitudes").download(r.documento_ruta);
  if (!archivo) return new Response("No encontrado", { status: 404 });
  anotar();
  return new Response(archivo, {
    headers: {
      "Content-Type": archivo.type || "application/octet-stream",
      "Content-Disposition": `${disposicion}; filename*=UTF-8''${encodeURIComponent(r.documento_nombre ?? "documento")}`,
      "Cache-Control": "private, no-store",
    },
  });
}
