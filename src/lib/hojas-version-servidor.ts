import "server-only";
import { leerCambios, escribirCambios, type Cambios } from "@/lib/cambios-hoja";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Versiones } from "@/lib/hojas-version";

type Supa = Pick<SupabaseClient, "from">;

// Versiones propias de la organización (lista «hoja_paciente»). Pasan por leerCambios: mismos topes que ?c=
export async function versionesHojas(supabase: Supa): Promise<Versiones> {
  const { data } = await supabase.from("lista_items").select("codigo, datos").eq("lista", "hoja_paciente").eq("activo", true);
  return limpiarVersiones(Object.fromEntries(((data ?? []) as { codigo: string; datos: { cambios?: Cambios } | null }[]).map((i) => [i.codigo, i.datos?.cambios ?? {}])));
}

export const limpiarVersiones = (v: Record<string, unknown> | null | undefined): Versiones =>
  Object.fromEntries(Object.entries(v ?? {}).map(([k, c]) => [k, leerCambios(escribirCambios((c && typeof c === "object" ? c : {}) as Cambios))]));
