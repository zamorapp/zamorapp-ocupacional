import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";

// Programas de vigilancia por empresa (public.vigilancia_programas, 20261030960000): riesgo, a quién cubre, exámenes
// con su frecuencia y metas. Son configuración: se editan en la ficha de la empresa y el agente solo los propone.

export type ExamenPrograma = { nombre: string; cada_meses?: number | null };
export type MetaPrograma = { indicador: string; meta?: string | null };
export type Programa = {
  id: string;
  empresa_id: string;
  nombre: string;
  proyecto: string | null;
  riesgo: string | null;
  condiciones: string | null;
  dependencia_ids: string[];
  puesto_ids: string[];
  examenes: ExamenPrograma[];
  metas: MetaPrograma[];
  activo: boolean;
};
export type Cumplimiento = { poblacion: number; evaluados: number; examenes: { nombre: string; cada_meses: number | null; hechos: number }[] };

const COLUMNAS = "id, empresa_id, nombre, proyecto, riesgo, condiciones, dependencia_ids, puesto_ids, examenes, metas, activo";

export async function programasDeEmpresa(empresaId: string, soloActivos = false): Promise<Programa[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  let q = supabase.from("vigilancia_programas" as never).select(COLUMNAS).eq("empresa_id", empresaId).order("activo", { ascending: false }).order("nombre");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) {
    console.error("vigilancia_programas:", error.message);
    return [];
  }
  return (data ?? []) as unknown as Programa[];
}

// Programas activos con su cobertura en el período (para la pantalla de Reportes y el informe impreso)
export async function programasConCumplimiento(empresaId: string | null, desde: string, hasta: string): Promise<(Programa & { cumplimiento: Cumplimiento | null })[]> {
  if (!empresaId) return [];
  const programas = await programasDeEmpresa(empresaId, true);
  if (!programas.length) return [];
  const supabase = await crearClienteServidor();
  return Promise.all(programas.map(async (p) => {
    const { data } = await supabase.rpc("vigilancia_programa_cumplimiento" as never, { p_programa: p.id, p_desde: desde, p_hasta: hasta } as never);
    return { ...p, cumplimiento: (data ?? null) as Cumplimiento | null };
  }));
}

export const porciento = (n: number, de: number) => (de > 0 ? Math.round((n * 1000) / de) / 10 : null);
