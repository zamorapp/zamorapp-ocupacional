"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

type R = { ok: boolean; mensaje: string; resultado?: Record<string, number> };

function explicar(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "Solo el administrador puede hacer la limpieza.";
  if (error.code === "PGRST202") return "Falta aplicar la actualización de la base (limpieza).";
  return error.message;
}

async function permitido(): Promise<string | null> {
  const s = await obtenerSesion();
  if (s.demo || !s.orgId) return "En modo demo no se limpia nada.";
  if (s.rol !== "administrador") return "Solo el administrador puede hacer la limpieza.";
  return null;
}

export async function limpiarAhora(): Promise<R> {
  const no = await permitido();
  if (no) return { ok: false, mensaje: no };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("limpieza_ejecutar" as never);
  if (error) return { ok: false, mensaje: explicar(error) };
  revalidatePath("/configuracion/limpieza");
  return { ok: true, mensaje: "Limpieza hecha.", resultado: (data ?? {}) as Record<string, number> };
}

export async function cambiarPlazo(clave: string, dias: number): Promise<R> {
  const no = await permitido();
  if (no) return { ok: false, mensaje: no };
  if (!/^[a-z_]{3,40}$/.test(clave) || !Number.isInteger(dias)) return { ok: false, mensaje: "Plazo no válido." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("limpieza_cambiar_plazo" as never, { p_clave: clave, p_dias: dias } as never);
  if (error) return { ok: false, mensaje: explicar(error) };
  revalidatePath("/configuracion/limpieza");
  return { ok: true, mensaje: "Plazo guardado." };
}
