import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUMNAS_ADJUNTO, type Adjunto } from "@/lib/adjuntos-tipos";

// Papelera de 30 días de los archivos clínicos (migración 20261030890000, sobre public.papelera).
// Borrar no quita el archivo del almacenamiento: queda 30 días y se puede restaurar desde la ficha del paciente.

export type EnPapelera = { id: string; adjunto_id: string; nombre: string; consulta_id: string | null; eliminado_en: string; eliminado_por: string | null; vence: string };

export const TEXTO_BORRAR = "Queda 30 días en la papelera de la ficha del paciente y desde ahí se puede restaurar. Después se elimina para siempre.";

/** Manda el archivo a la papelera. Devuelve el id de la entrada (para «Deshacer»). */
export async function borrarAdjunto(supabase: SupabaseClient, a: Adjunto): Promise<string> {
  const { data, error } = await supabase.rpc("eliminar_adjunto", { p_id: a.id });
  if (error) throw new Error(`No se borró «${a.nombre}»: ${error.message}`);
  if (!data) throw new Error(`No se borró «${a.nombre}»: no llegó respuesta. Recarga la página y revisa.`);
  return data as string;
}

/** Devuelve el archivo a su lugar y lo trae tal como quedó (mismo id, mismos exámenes ligados). */
export async function restaurarAdjunto(supabase: SupabaseClient, papeleraId: string, adjuntoId?: string): Promise<Adjunto | null> {
  const { error } = await supabase.rpc("restaurar_papelera", { p_id: papeleraId });
  if (error) throw new Error(`No se restauró: ${error.message}`);
  if (!adjuntoId) return null;
  const { data } = await supabase.from("adjuntos").select(COLUMNAS_ADJUNTO).eq("id", adjuntoId).maybeSingle();
  return (data as unknown as Adjunto) ?? null;
}

export async function papeleraDe(supabase: SupabaseClient, trabajadorId: string): Promise<EnPapelera[]> {
  const { data, error } = await supabase.rpc("adjuntos_en_papelera", { p_trabajador: trabajadorId });
  if (error) throw new Error(`No se pudo leer la papelera: ${error.message}`);
  return (data ?? []) as EnPapelera[];
}

/** Purga en 2 pasos de lo vencido (más de 30 días): primero el archivo guardado, luego la entrada. Sin ruido si falla. */
export async function purgarVencidos(supabase: SupabaseClient): Promise<void> {
  try {
    const { data } = await supabase.rpc("adjuntos_vencidos", { p_limite: 50 });
    const vencidos = (data ?? []) as { id: string; ruta: string }[];
    if (!vencidos.length) return;
    const { error } = await supabase.storage.from("adjuntos").remove(vencidos.map((v) => v.ruta));
    if (error) return; // se reintenta la próxima vez que se abra una ficha
    await supabase.rpc("purgar_adjuntos", { p_ids: vencidos.map((v) => v.id) });
  } catch {
    /* la purga es de mantenimiento: nunca interrumpe la ficha */
  }
}
