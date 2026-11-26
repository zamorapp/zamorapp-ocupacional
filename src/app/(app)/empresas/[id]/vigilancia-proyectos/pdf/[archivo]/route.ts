import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CUBETA_VIGILANCIA_PROYECTOS, datosBorradorProyecto, ROLES_VIGILANCIA_PROYECTOS } from "@/lib/vigilancia-proyectos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const noEncontrado = () => new Response("Borrador no encontrado", { status: 404, headers: { "Cache-Control": "private, no-store" } });

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; archivo: string }> }) {
  const { id, archivo } = await params;
  const borrador = datosBorradorProyecto(archivo);
  if (!borrador || !UUID.test(id)) return noEncontrado();
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !ROLES_VIGILANCIA_PROYECTOS.includes(sesion.rol ?? "")) return noEncontrado();
  const { data, error } = await (await crearClienteServidor()).storage.from(CUBETA_VIGILANCIA_PROYECTOS).download(`${sesion.orgId}/${id}/${archivo}`);
  if (error || !data) return noEncontrado();
  const nombre = encodeURIComponent(`Contrato ${borrador.contrato} - Vigilancia T${borrador.trimestre} ${borrador.anio} - Borrador.pdf`);
  return new Response(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${nombre}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
