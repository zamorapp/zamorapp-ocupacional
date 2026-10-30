"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Vacacion = { id: string; desde: string; regreso: string };
type Resultado = { ok: boolean; mensaje: string };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Vacaciones del trabajador: las anota el servicio o RR. HH. de su empresa (lo exigen las políticas de la tabla y la
// empresa sale del trabajador). Se escribe en la tabla, no por una función: en el escritorio queda en la base local
// sin internet y sube por la bandeja con las mismas reglas.
export async function guardarVacaciones(trabajadorId: string, desde: string, regreso: string): Promise<Resultado> {
  if (!FECHA.test(desde) || !FECHA.test(regreso)) return { ok: false, mensaje: "Escribe las dos fechas." };
  if (regreso <= desde) return { ok: false, mensaje: "El regreso debe ser después del inicio." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("vacaciones").insert({ trabajador_id: trabajadorId, desde, regreso });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "No puedes anotar vacaciones de este trabajador." : error.code === "23514" ? "Las vacaciones no pueden pasar de 120 días." : error.message };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "Vacaciones guardadas." };
}

// Corregir fechas ya anotadas (misma política de la tabla; en el escritorio sube por la bandeja como cualquier cambio)
export async function editarVacaciones(trabajadorId: string, id: string, desde: string, regreso: string): Promise<Resultado> {
  if (!FECHA.test(desde) || !FECHA.test(regreso)) return { ok: false, mensaje: "Escribe las dos fechas." };
  if (regreso <= desde) return { ok: false, mensaje: "El regreso debe ser después del inicio." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("vacaciones").update({ desde, regreso }).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: error.code === "23514" ? "Las vacaciones no pueden pasar de 120 días." : error.message };
  if (!data?.length) return { ok: false, mensaje: "No puedes corregir estas vacaciones." };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "Vacaciones corregidas." };
}

export async function quitarVacaciones(trabajadorId: string, id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("vacaciones").delete().eq("id", id).select("id");
  if (error) return { ok: false, mensaje: error.message };
  if (!data?.length) return { ok: false, mensaje: "No puedes quitar estas vacaciones." };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "" };
}
