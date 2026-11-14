"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { revisaBorradores } from "@/lib/agentes/borradores";

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
