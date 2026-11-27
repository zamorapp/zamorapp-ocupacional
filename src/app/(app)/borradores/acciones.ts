"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { revisaBorradores } from "@/lib/agentes/borradores";
import { revisaCambiosCitas } from "@/lib/agentes/cambios-citas";

const idValido = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function avisosCambioCita(id: string): Promise<string[] | null> {
  const sesion = await obtenerSesion();
  if (!revisaCambiosCitas(sesion) || !idValido.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data: propuesta, error } = await supabase.from("agentes_cambios_citas")
    .select("cita_id, fecha_nueva, hora_nueva")
    .eq("id", id).eq("estado", "pendiente").eq("operacion", "reprogramar").maybeSingle();
  if (error || !propuesta?.fecha_nueva) return null;
  const { data, error: falloAgenda } = await supabase.rpc("choques_agenda", {
    p_fecha: propuesta.fecha_nueva, p_hora: propuesta.hora_nueva, p_excluir: propuesta.cita_id,
  });
  return falloAgenda ? null : (data as string[] | null) ?? [];
}

export async function decidirCambioCita(id: string, aprobar: boolean): Promise<{ ok: boolean; mensaje: string }> {
  const sesion = await obtenerSesion();
  if (!revisaCambiosCitas(sesion)) return { ok: false, mensaje: "El cambio lo revisa quien creó la llave." };
  if (typeof aprobar !== "boolean" || !idValido.test(id)) {
    return { ok: false, mensaje: "Propuesta no válida." };
  }
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("decidir_cambio_cita_agente", { p_id: id, p_aprobar: aprobar });
  if (error?.code === "ZA409") return { ok: false, mensaje: "La cita cambió. Descarta la propuesta y pide otra." };
  if (error?.code === "ZA410") return { ok: false, mensaje: "La fecha propuesta ya pasó. Descarta la propuesta y pide otra." };
  if (error?.code === "42501") return { ok: false, mensaje: "La propuesta ya se revisó o no está disponible para tu cuenta." };
  if (error) return { ok: false, mensaje: "No se pudo guardar la decisión. Comprueba la conexión y vuelve a intentar." };
  if (aprobar) revalidatePath("/", "layout");
  else { revalidatePath("/borradores"); revalidatePath("/panel"); }
  return { ok: true, mensaje: data === "reprogramar" ? "Cita reprogramada." : data === "cancelar" ? "Cita cancelada." : "Propuesta descartada." };
}

export async function aprobarConstanciaBorrador(id: string): Promise<{ ok: true; ruta: string } | { ok: false; mensaje: string }> {
  const sesion = await obtenerSesion();
  if (!revisaBorradores(sesion)) return { ok: false, mensaje: "La constancia la aprueba el médico responsable." };
  if (!idValido.test(id)) return { ok: false, mensaje: "Borrador no válido." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("agentes_borradores").update({ estado: "emitido" })
    .eq("id", id).eq("org_id", sesion.orgId!).eq("tipo", "constancia").eq("estado", "por_revisar")
    .select("id, consulta_id").maybeSingle();
  if (error?.code === "ZA409") return { ok: false, mensaje: "La consulta cambió. Pide otro borrador." };
  if (error) return { ok: false, mensaje: "No se pudo aprobar la constancia. Intenta de nuevo." };
  if (!data?.consulta_id) return { ok: false, mensaje: "El borrador ya fue revisado o no está disponible para tu cuenta." };
  revalidatePath("/borradores");
  revalidatePath("/panel");
  return { ok: true, ruta: `/imprimir/constancia/${data.consulta_id}?borrador=${data.id}` };
}

// El médico descarta lo que preparó el agente: no se imprime ni se envía; se borra solo a los 30 días
export async function descartarBorrador(id: string): Promise<{ ok: boolean; mensaje: string }> {
  const sesion = await obtenerSesion();
  if (!revisaBorradores(sesion)) return { ok: false, mensaje: "Los borradores los revisa el médico." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, mensaje: "Borrador no válido." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("agentes_borradores").update({ estado: "descartado" })
    .eq("id", id).eq("estado", "por_revisar").select("id").maybeSingle();
  if (error) return { ok: false, mensaje: "No se pudo descartar. Intenta de nuevo." };
  if (!data) return { ok: false, mensaje: "Ya estaba revisado." };
  revalidatePath("/borradores");
  return { ok: true, mensaje: "Descartado." };
}
