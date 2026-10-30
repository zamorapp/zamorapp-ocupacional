import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { AlertaClinica, ParaclinicoPedido } from "@/lib/alertas-tipos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas } from "@/lib/fecha";

type Fila = {
  id: string; texto: string; paraclinicos: ParaclinicoPedido[] | null; revisar_antes: string | null; estado: AlertaClinica["estado"];
  respuesta: string | null; creada_en: string; creada_por: string | null; consulta_id: string | null; revisada_en_consulta: string | null; automatica: boolean;
};

// Pendientes del trabajador y, si se pasa la consulta, también las que se dejaron o se revisaron en ella.
// Solo el personal clínico las lee (RLS): para RR. HH. la lista sale vacía.
export async function alertasDeTrabajador(trabajadorId: string, consultaId?: string): Promise<AlertaClinica[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  let q = supabase.from("alertas_clinicas")
    .select("id, texto, paraclinicos, revisar_antes, estado, respuesta, creada_en, creada_por, consulta_id, revisada_en_consulta, automatica")
    .eq("trabajador_id", trabajadorId);
  q = consultaId ? q.or(`estado.eq.pendiente,consulta_id.eq.${consultaId},revisada_en_consulta.eq.${consultaId}`) : q.eq("estado", "pendiente");
  const { data } = await q.order("creada_en").limit(30);
  const filas = (data ?? []) as Fila[];
  const ids = [...new Set(filas.map((f) => f.creada_por).filter((x): x is string => !!x))];
  const { data: perfiles } = ids.length ? await supabase.from("perfiles").select("id, nombre_completo").in("id", ids) : { data: [] };
  const nombre = new Map((perfiles ?? []).map((p) => [p.id as string, p.nombre_completo as string]));
  return filas.map((f) => ({
    id: f.id, texto: f.texto, paraclinicos: Array.isArray(f.paraclinicos) ? f.paraclinicos : [], revisarAntes: f.revisar_antes, estado: f.estado,
    respuesta: f.respuesta, creadaEl: hoyCaracas(f.creada_en), autor: f.creada_por ? nombre.get(f.creada_por) ?? null : null,
    consultaId: f.consulta_id, revisadaEnConsulta: f.revisada_en_consulta, automatica: f.automatica,
  }));
}

// Para marcar con la campanita en la cola de Atención y en la lista de pacientes
export async function trabajadoresConAlerta(ids: string[]): Promise<Set<string>> {
  if (!supabaseConfigurado || !ids.length) return new Set();
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("alertas_clinicas").select("trabajador_id").eq("estado", "pendiente").in("trabajador_id", ids.slice(0, 300));
  return new Set((data ?? []).map((r) => r.trabajador_id as string));
}
