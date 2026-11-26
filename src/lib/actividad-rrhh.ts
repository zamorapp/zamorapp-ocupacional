import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

type TipoPortal = "ingreso" | "documento_entregado" | "relacion_entregada";

export async function registrarActividadRRHH(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  tipo: TipoPortal,
  objeto: string,
  mes?: string,
) {
  try {
    const { error } = await supabase.rpc("registrar_actividad_rrhh", {
      p_tipo: tipo, p_objeto: objeto, p_mes: mes ?? null,
    });
    if (error && error.code !== "offline") console.error("Actividad de RR. HH.:", error.code);
  } catch {
    console.error("No se pudo registrar la actividad de RR. HH.");
  }
}
