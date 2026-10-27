import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";
import { COLUMNAS_ADJUNTO, type Adjunto } from "@/lib/adjuntos-tipos";

// Resultados adjuntos de un trabajador (solo los ve el personal clínico, por RLS)
export async function listarAdjuntos(trabajadorId: string): Promise<Adjunto[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("adjuntos")
    .select(COLUMNAS_ADJUNTO)
    .eq("trabajador_id", trabajadorId)
    .order("creado_en", { ascending: false });
  return (data ?? []) as unknown as Adjunto[];
}
