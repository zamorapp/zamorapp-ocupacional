import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Medicamento } from "@/lib/consultas-tipos";
import type { EstadoIndicacion, IndicacionSuelta, TipoIndicacion } from "@/lib/indicaciones-sueltas";

type Fila = {
  id: string; tipo: TipoIndicacion; fecha: string; tratamiento: Medicamento[] | null; examenes: string[] | null;
  consulta_id: string | null; indicaciones: string; indicado_por: string | null;
  estado: EstadoIndicacion; medico_id: string | null; cumplida_por: string | null; cumplida_en: string | null;
  nota_cumplimiento: string | null; motivo_anulacion: string | null;
};
const COLUMNAS = "id, tipo, fecha, tratamiento, examenes, consulta_id, indicaciones, indicado_por, estado, medico_id, cumplida_por, cumplida_en, nota_cumplimiento, motivo_anulacion";

async function conNombres(filas: Fila[]): Promise<IndicacionSuelta[]> {
  const supabase = await crearClienteServidor();
  const ids = [...new Set(filas.flatMap((f) => [f.medico_id, f.cumplida_por]).filter((x): x is string => !!x))];
  const { data: perfiles } = ids.length ? await supabase.from("perfiles").select("id, nombre_completo").in("id", ids) : { data: [] };
  const nombre = new Map((perfiles ?? []).map((p) => [p.id as string, p.nombre_completo as string]));
  // Fecha de la consulta a la que el médico la adjuntó (si la adjuntó)
  const cids = [...new Set(filas.map((f) => f.consulta_id).filter((x): x is string => !!x))];
  const { data: cons } = cids.length ? await supabase.from("consultas").select("id, fecha").in("id", cids) : { data: [] };
  const fechaConsulta = new Map((cons ?? []).map((c) => [c.id as string, c.fecha as string]));
  return filas.map((f) => ({
    id: f.id, tipo: f.tipo, fecha: f.fecha, tratamiento: Array.isArray(f.tratamiento) ? f.tratamiento : [],
    examenes: Array.isArray(f.examenes) ? f.examenes.filter((x) => typeof x === "string") : [], consultaFecha: f.consulta_id ? fechaConsulta.get(f.consulta_id) ?? null : null,
    indicaciones: f.indicaciones,
    indicadoPor: f.indicado_por, estado: f.estado, medico: f.medico_id ? nombre.get(f.medico_id) ?? null : null,
    cumplidaPor: f.cumplida_por ? nombre.get(f.cumplida_por) ?? null : null, cumplidaEn: f.cumplida_en,
    notaCumplimiento: f.nota_cumplimiento, motivoAnulacion: f.motivo_anulacion,
  }));
}

// Historial del trabajador (las más recientes primero). Solo el personal clínico las lee (RLS).
export async function indicacionesDeTrabajador(trabajadorId: string): Promise<IndicacionSuelta[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("indicaciones").select(COLUMNAS).eq("trabajador_id", trabajadorId)
    .order("fecha", { ascending: false }).order("creada_en", { ascending: false }).limit(60);
  return conNombres((data ?? []) as Fila[]);
}

// Una sola, con lo que necesita la hoja impresa
export async function obtenerIndicacion(id: string) {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("indicaciones").select(`${COLUMNAS}, org_id, trabajador_id`).eq("id", id).maybeSingle();
  if (!data) return null;
  const f = data as Fila & { org_id: string; trabajador_id: string };
  const [ind] = await conNombres([f]);
  return { ...ind, orgId: f.org_id, trabajadorId: f.trabajador_id, medicoId: f.medico_id };
}
