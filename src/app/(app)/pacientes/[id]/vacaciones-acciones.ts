"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Vacacion = { id: string; desde: string; regreso: string };
type Resultado = { ok: boolean; mensaje: string };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Vacaciones del trabajador: las anota el servicio o RR. HH. de su empresa (la base lo exige en guardar_vacaciones)
export async function guardarVacaciones(trabajadorId: string, desde: string, regreso: string, id?: string): Promise<Resultado> {
  if (!FECHA.test(desde) || !FECHA.test(regreso)) return { ok: false, mensaje: "Escribe las dos fechas." };
  if (regreso <= desde) return { ok: false, mensaje: "El regreso debe ser después del inicio." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_vacaciones", { p_trabajador: trabajadorId, p_desde: desde, p_regreso: regreso, p_id: id ?? null });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "No puedes anotar vacaciones de este trabajador." : error.code === "23514" ? "Las vacaciones no pueden pasar de 120 días." : error.message };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "Vacaciones guardadas." };
}

export async function quitarVacaciones(trabajadorId: string, id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("quitar_vacaciones", { p_id: id });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "" };
}
