import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Adjunto } from "@/lib/adjuntos-tipos";

// Resultados adjuntos de un trabajador (solo los ve el personal clínico, por RLS)
export async function listarAdjuntos(trabajadorId: string): Promise<Adjunto[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("adjuntos")
    .select("id, nombre, ruta, tipo_mime, tamano, descripcion, consulta_id, creado_en")
    .eq("trabajador_id", trabajadorId)
    .order("creado_en", { ascending: false });
  return (data ?? []) as Adjunto[];
}
