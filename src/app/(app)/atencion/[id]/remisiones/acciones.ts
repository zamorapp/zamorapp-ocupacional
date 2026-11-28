"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function prepararRemision(id: string, consulta: string, prestador: string, examenes: string[]) {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return "Necesitas una sesión clínica para preparar la remisión.";
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("preparar_remision_examenes", {
    p_id: id, p_consulta: consulta, p_prestador: prestador, p_examenes: examenes,
  });
  if (error) return error.message;
  revalidatePath("/atencion/" + consulta + "/remisiones");
  return null;
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
