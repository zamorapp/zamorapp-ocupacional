import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { Periodo } from "@/lib/periodos";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Series } from "@/lib/vigilancia-analisis";

type Conteo = { nombre: string; n: number };
export type Causa = { cie10: string; descripcion: string; n: number; pacientes?: number };

export type Reporte = {
  poblacion: {
    total: number; femenino: number; masculino: number; por_tipo: Conteo[];
    discapacidad?: number; vigilancia_ocupacional?: number; vigilancia_no_ocupacional?: number;
  };
  consultas: {
    total: number; pacientes: number; preventivas: number; no_preventivas: number; sanos: number; patologicos?: number;
    por_motivo: (Conteo & { grupo: string | null })[];
    por_tipo: Record<string, number>;
    por_tipo_paciente?: Conteo[];
    por_sexo: { F: number; M: number };
    por_edad: { grupo: string; n: number }[];
    por_dependencia?: (Conteo & { personal: number })[];
  };
  morbilidad: {
    total: number;
    pacientes?: number;
    por_sistema: Conteo[];
    por_origen: Record<string, number>;
    por_tipo_consulta?: Record<string, { n: number; pacientes: number }>;
    primeras_causas: Causa[];
    // Diez primeras causas por corte: tipo, origen, sexo, edad, sistema, actividad, motivo, dependencia
    cortes?: Record<string, Record<string, Causa[]>>;
  };
  referencias?: { total: number; por_especialidad: Conteo[] };
  ausentismo: {
    reposos: number; dias_perdidos: number; dias_periodo: number; dias_computables: number;
    reposos_iniciados?: number; trabajadores_ausentes?: number;
    por_causa: (Conteo & { dias: number })[];
    por_ente: (Conteo & { dias?: number })[];
    primeras_causas?: (Causa & { dias: number })[];
    detalle?: { causa: string; ente: string; cie10: string | null; descripcion: string | null; n: number; dias: number }[];
    por_dependencia?: (Conteo & { dias: number })[];
  };
  enfermedad_ocupacional?: { casos: number; dias: number; casos_anteriores: number; dias_anteriores: number };
  accidentes?: { fecha: string; tipo: string; lugar: string | null; lesion: string | null; parte: string | null; gravedad: string | null; dias: number; estado: string }[];
  aptitud: Record<string, number>;
};

export { resolverPeriodo, type Periodo } from "@/lib/periodos";

export async function obtenerReporte(empresaId: string | null, p: Periodo): Promise<Reporte | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reporte_vigilancia", { p_empresa: empresaId, p_desde: p.desde, p_hasta: p.hasta });
  if (error) throw error;
  return data as Reporte;
}

// Tendencia mensual, pirámide de la población y morbilidad por capítulo CIE-10 (gráficos del informe)
export async function obtenerSeries(empresaId: string | null, p: Pick<Periodo, "desde" | "hasta">): Promise<Series | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("vigilancia_series", { p_empresa: empresaId, p_desde: p.desde, p_hasta: p.hasta });
  if (error) throw error;
  return data as Series;
}

// Promedio de ausentismo diario y % (meta < 2,5 %; pre y postnatal no cuentan)
export function indicadoresAusentismo(r: Reporte) {
  const pad = r.ausentismo.dias_periodo ? r.ausentismo.dias_computables / r.ausentismo.dias_periodo : 0;
  const pct = r.poblacion.total ? (pad * 100) / r.poblacion.total : 0;
  return { pad: Math.round(pad * 100) / 100, pct: Math.round(pct * 100) / 100 };
}

export type Accidentalidad = {
  hht: number;
  meses_con_horas: number;
  hay_estimado: boolean;
  accidentes: number;
  con_tiempo_perdido: number;
  incidentes: number;
  enfermedades: number;
  dias_perdidos: number;
  dias_cargados: number;
  declarados_a_tiempo: number;
  por_declarar: number;
};

export async function obtenerAccidentalidad(empresaId: string | null, p: Periodo): Promise<Accidentalidad | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("indices_accidentalidad", { p_empresa: empresaId, p_desde: p.desde, p_hasta: p.hasta });
  if (error) throw error;
  return data as Accidentalidad;
}

// Índices COVENIN 474 por millón de horas hombre trabajadas; null si no hay horas cargadas
export function indicesCovenin(a: Accidentalidad) {
  const por = (n: number) => (a.hht > 0 ? Math.round(((n * 1_000_000) / a.hht) * 100) / 100 : null);
  const declarables = a.accidentes + a.enfermedades;
  return {
    ifn: por(a.con_tiempo_perdido),
    ifb: por(a.accidentes),
    is: por(a.dias_perdidos + a.dias_cargados),
    tieo: por(a.enfermedades),
    aTiempo: declarables ? Math.round((a.declarados_a_tiempo / declarables) * 100) : null,
  };
}

// Días hábiles (lunes a viernes) entre dos fechas ISO, ambas incluidas
function diasHabiles(desde: string, hasta: string) {
  const d = new Date(desde + "T00:00:00Z");
  const fin = new Date(hasta + "T00:00:00Z");
  let n = 0;
  for (; d <= fin; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6 !== 0) n++;
  return n;
}

// Sin horas cargadas, COVENIN 474 (5.2) permite estimarlas: trabajadores × 8 h × días hábiles, declarando el método
export function completarHorasHombre(a: Accidentalidad, trabajadores: number, p: Periodo): Accidentalidad & { estimado_auto: boolean } {
  if (a.hht > 0 || trabajadores <= 0) return { ...a, estimado_auto: false };
  return { ...a, hht: trabajadores * 8 * diasHabiles(p.desde, p.hasta), hay_estimado: true, estimado_auto: true };
}

// Tasas de enfermedad ocupacional: TAEO = días perdidos por EO × 100 / HHT · TIEO = casos × 1.000.000 / HHT
export function tasasEnfermedadOcupacional(r: Reporte, hht: number) {
  const eo = r.enfermedad_ocupacional;
  if (!eo || hht <= 0) return { taeo: null, tieo: null };
  return { taeo: Math.round(((eo.dias * 100) / hht) * 10000) / 10000, tieo: Math.round(((eo.casos * 1_000_000) / hht) * 100) / 100 };
}

export type InformeVigilancia = {
  id: string | null;
  resumen: string;
  conclusiones: string;
  recomendaciones: string;
  factores_riesgo: string;
  medidas_control: string;
  firmantes: Firmantes;
  // Análisis editado de cada cuadro ({seccion: texto}) y la variante de redacción elegida
  analisis: Record<string, string>;
  variante: number;
  actualizado_en: string | null;
};
export type Persona = { nombre: string; cedula: string };
export type Firmantes = { medico?: Persona; sst?: Persona; delegados?: Persona[]; empleador?: Persona };

// Textos guardados del informe para esa empresa (o el consolidado) y ese período exacto
export async function obtenerInforme(empresaId: string | null, p: Periodo): Promise<InformeVigilancia | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  let q = supabase.from("informes_vigilancia").select("id, resumen, conclusiones, recomendaciones, factores_riesgo, medidas_control, firmantes, analisis, variante, actualizado_en").eq("desde", p.desde).eq("hasta", p.hasta);
  q = empresaId ? q.eq("empresa_id", empresaId) : q.is("empresa_id", null);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    resumen: data.resumen ?? "",
    conclusiones: data.conclusiones ?? "",
    recomendaciones: data.recomendaciones ?? "",
    factores_riesgo: data.factores_riesgo ?? "",
    medidas_control: data.medidas_control ?? "",
    firmantes: (data.firmantes ?? {}) as Firmantes,
    analisis: (data.analisis ?? {}) as Record<string, string>,
    variante: data.variante ?? 0,
    actualizado_en: data.actualizado_en,
  };
}

// Riesgos marcados en los puestos de la empresa: base de "Factores de riesgo" sugeridos
export async function riesgosDeEmpresa(empresaId: string | null): Promise<Record<string, string[]>> {
  if (!supabaseConfigurado || !empresaId) return {};
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("puestos").select("riesgos").eq("empresa_id", empresaId).eq("activo", true);
  const total: Record<string, Set<string>> = {};
  for (const p of data ?? []) {
    for (const [grupo, agentes] of Object.entries((p.riesgos ?? {}) as Record<string, string[]>)) {
      for (const a of agentes ?? []) (total[grupo] ??= new Set()).add(a);
    }
  }
  return Object.fromEntries(Object.entries(total).map(([g, s]) => [g, [...s]]));
}
