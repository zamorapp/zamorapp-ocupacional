import { crearClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET" } });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return new Response("No encontrado", { status: 404 });
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("entregar_constancia_rrhh", { p_consulta: id });
  if (error?.code === "offline") return new Response("La descarga requiere internet.", { status: 503 });
  const archivo = (data as { nombre: string; contenido_base64: string }[] | null)?.[0];
  if (!archivo) return new Response("La constancia no está disponible para esta cuenta.", { status: 404 });
  return new Response(Buffer.from(archivo.contenido_base64, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
