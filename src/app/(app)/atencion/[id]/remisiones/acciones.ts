"use server";

import { revalidatePath } from "next/cache";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { enviarCorreoRemision, esSolicitudCorreoRemision, type SolicitudCorreoRemision } from "@/lib/remisiones-correo";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function prepararRemision(id: string, consulta: string, prestador: string, examenes: string[], prestadorId?: string) {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return "Necesitas una sesión clínica para preparar la remisión.";
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc(prestadorId ? "preparar_remision_directorio" : "preparar_remision_examenes", {
    p_id: id, p_consulta: consulta, p_prestador: prestadorId ?? prestador, p_examenes: examenes,
  });
  if (error) return error.message;
  revalidatePath("/atencion/" + consulta + "/remisiones");
  return null;
}

export async function enviarOrden(solicitud: SolicitudCorreoRemision) {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico || !esSolicitudCorreoRemision(solicitud)) {
    return { mensaje: "Necesitas una sesión clínica y una orden válida.", status: 403 };
  }
  const supabase = await crearClienteServidor();
  try {
    if (!ESCRITORIO) return await enviarCorreoRemision(supabase, solicitud);
    const { data } = await supabase.auth.getSession();
    const r = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/zamorapp/correo-prestador", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(70_000),
      headers: { authorization: "Bearer " + (data.session?.access_token ?? ""), "content-type": "application/json" },
      body: JSON.stringify(solicitud),
    });
    const { mensaje } = await r.json();
    return { mensaje: String(mensaje), status: r.status };
  } finally {
    revalidatePath("/atencion/" + solicitud.consulta + "/remisiones");
  }
}

export async function anotarRemision(id: string, consulta: string, recibidos: string[] | null) {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return "Necesitas una sesión clínica para registrar el movimiento.";
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anotar_remision_examenes", { p_remision: id, p_recibidos: recibidos });
  if (error) return error.message;
  revalidatePath("/atencion/" + consulta + "/remisiones");
  return null;
}
