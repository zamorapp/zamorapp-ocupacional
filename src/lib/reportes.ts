import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { limpiarFirmantes, type Firmantes } from "@/lib/firmantes";
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
    // Causas del grupo «permiso» (paternidad, lactancia…): aparte, no cuentan como ausentismo
    permisos?: (Conteo & { dias: number })[];
    por_ente: (Conteo & { dias?: number })[];
    primeras_causas?: (Causa & { dias: number })[];
    detalle?: { causa: string; ente: string; cie10: string | null; descripcion: string | null; n: number; dias: number }[];
    por_dependencia?: (Conteo & { dias: number })[];
  };
  enfermedad_ocupacional?: { casos: number; dias: number; casos_anteriores: number; dias_anteriores: number };
  accidentes?: { fecha: string; tipo: string; lugar: string | null; lesion: string | null; parte: string | null; gravedad: string | null; dias: number; estado: string }[];
  aptitud: Record<string, number>;
  // Especialidad de las consultas externas o especializadas (diez primeras)
  especialidades_externas?: Conteo[];
  reubicaciones?: { total: number; por_resultado: Conteo[]; por_tipo: Record<string, number> };
  // Población usada: solo efectivos (tipos de paciente marcados) o todos (Configuración › Organización)
  criterio?: { solo_efectivos: boolean; tipos: string[] };
};

export { resolverPeriodo, type Periodo } from "@/lib/periodos";

export async function obtenerReporte(empresaId: string | null, p: Periodo): Promise<Reporte | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reporte_vigilancia", { p_empresa: empresaId, p_desde: p.desde, p_hasta: p.hasta });
  if (error) throw error;
  const r = data as Reporte;
  await nombresCie10(r, supabase);
  return r;
}

// Diagnósticos registrados sin nombre (vacío, igual al código o abreviado, p. ej. migrados del SAME):
// se muestran con el nombre del catálogo CIE-10, para que ningún cuadro salga con códigos crudos
async function nombresCie10(r: Reporte, supabase: Awaited<ReturnType<typeof crearClienteServidor>>) {
  const listas: { cie10: string | null; descripcion: string | null }[][] = [
    r.morbilidad.primeras_causas,
    ...Object.values(r.morbilidad.cortes ?? {}).flatMap((g) => Object.values(g)),
    r.ausentismo.primeras_causas ?? [],
    r.ausentismo.detalle ?? [],
  ];
  const pobre = (c: { cie10: string | null; descripcion: string | null }) => c.cie10 && (!c.descripcion || c.descripcion.trim().length < 4 || c.descripcion.trim().toUpperCase() === c.cie10.toUpperCase());
  const codigos = [...new Set(listas.flat().filter(pobre).map((c) => c.cie10!))];
  if (!codigos.length) return;
  const { data } = await supabase.from("cie10").select("codigo, descripcion").in("codigo", codigos.slice(0, 500));
  const nombre = new Map((data ?? []).map((x) => [x.codigo as string, x.descripcion as string]));
  for (const c of listas.flat()) if (pobre(c) && nombre.has(c.cie10!)) c.descripcion = nombre.get(c.cie10!)!;
}

// Tendencia mensual, pirámide de la población y morbilidad por capítulo CIE-10 (gráficos del informe)
export async function obtenerSeries(empresaId: string | null, p: Pick<Periodo, "desde" | "hasta">): Promise<Series | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("vigilancia_series", { p_empresa: empresaId, p_desde: p.desde, p_hasta: p.hasta });
  // Los gráficos son un complemento: si la función falla (o falta la migración en una copia vieja del escritorio)
  // Reportes abre igual con los cuadros y el análisis, sin los gráficos
  if (error) {
    console.error("vigilancia_series:", error.message);
    return null;
  }
  return data as Series;
}

// Promedio de ausentismo diario y % (meta < 2,5 %; pre y postnatal y los permisos no cuentan)
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

// Cómo se obtienen las horas hombre (Configuración › Organización › Informe de vigilancia):
// «same» (por defecto, como el SAME): HHE = trabajadores × 5,5 h × días del período, aunque haya horas cargadas.
// «nomina»: las horas cargadas por mes; sin horas, COVENIN 474 (5.2) permite estimarlas con trabajadores × 8 h × días hábiles.
export type CriterioHoras = "same" | "nomina";
export type MetodoHoras = "same" | "nomina" | "covenin";

const diasPeriodo = (p: Pick<Periodo, "desde" | "hasta">) => Math.round((Date.parse(p.hasta) - Date.parse(p.desde)) / 86_400_000) + 1;

export function completarHorasHombre(a: Accidentalidad, trabajadores: number, p: Periodo, criterio: CriterioHoras = "same"): Accidentalidad & { estimado_auto: boolean; metodo: MetodoHoras } {
  if (criterio === "same") return { ...a, hht: Math.round(trabajadores * 5.5 * diasPeriodo(p) * 100) / 100, hay_estimado: true, estimado_auto: false, metodo: "same" };
  if (a.hht > 0 || trabajadores <= 0) return { ...a, estimado_auto: false, metodo: a.hay_estimado ? "covenin" : "nomina" };
  return { ...a, hht: trabajadores * 8 * diasHabiles(p.desde, p.hasta), hay_estimado: true, estimado_auto: true, metodo: "covenin" };
}

// Texto del método de las horas hombre, para la pantalla y el informe
export function textoMetodoHoras(m: MetodoHoras) {
  return m === "same" ? "HHE = trabajadores × 5,5 h × días del período (fórmula del SAME)."
    : m === "covenin" ? "Estimadas: trabajadores × 8 h × días hábiles (COVENIN 474, 5.2)."
    : "Según nómina.";
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
  recomendaciones_medicas: string;
  recomendaciones: string;
  factores_riesgo: string;
  medidas_control: string;
  firmantes: Firmantes;
  // Análisis editado de cada cuadro ({seccion: texto}) y la variante de redacción elegida
  analisis: Record<string, string>;
  variante: number;
  actualizado_en: string | null;
};
export type { Firmantes, Persona } from "@/lib/firmantes";

// Firmantes y datos de portada del último informe guardado de esa empresa: los delegados y representantes
// cambian poco, así que el informe nuevo arranca con ellos (sin la fecha de emisión). Si el período ya
// tiene su informe, lo guardado en él manda (editor e impreso lo ponen encima)
export async function firmantesAnteriores(empresaId: string | null): Promise<Firmantes | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  let q = supabase.from("informes_vigilancia").select("firmantes").order("actualizado_en", { ascending: false }).limit(1);
  q = empresaId ? q.eq("empresa_id", empresaId) : q.is("empresa_id", null);
  const { data } = await q.maybeSingle();
  if (!data?.firmantes) return null;
  const f = limpiarFirmantes(data.firmantes);
  delete f.fecha_emision;
  return f;
}

// Textos guardados del informe para esa empresa (o el consolidado) y ese período exacto
export async function obtenerInforme(empresaId: string | null, p: Periodo): Promise<InformeVigilancia | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  let q = supabase.from("informes_vigilancia").select("id, resumen, conclusiones, recomendaciones_medicas, recomendaciones, factores_riesgo, medidas_control, firmantes, analisis, variante, actualizado_en").eq("desde", p.desde).eq("hasta", p.hasta);
  q = empresaId ? q.eq("empresa_id", empresaId) : q.is("empresa_id", null);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    resumen: data.resumen ?? "",
    conclusiones: data.conclusiones ?? "",
    recomendaciones_medicas: data.recomendaciones_medicas ?? "",
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
