import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { type Medida, type Resultados } from "@/lib/psicosocial";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Grupo = { id: string; nombre: string };
export type EvaluacionPsicosocial = {
  id: string;
  empresaId: string;
  empresa: string;
  titulo: string;
  grupos: Grupo[];
  minimo: number;
  trabajadores: number | null;
  acuerdoFecha: string | null;
  acuerdoNota: string;
  estado: "abierta" | "cerrada";
  inicio: string;
  cerradaEn: string | null;
  conclusiones: string;
  medidas: Medida[];
  creadoPor: string | null;
};

const COLUMNAS = "id, empresa_id, titulo, grupos, minimo_grupo, trabajadores, acuerdo_fecha, acuerdo_nota, estado, inicio, cerrada_en, conclusiones, medidas, creado_por, empresas(razon_social)";
type Fila = Record<string, unknown> & { empresas: { razon_social: string } | null };
const convertir = (f: Fila): EvaluacionPsicosocial => ({
  id: f.id as string,
  empresaId: f.empresa_id as string,
  empresa: f.empresas?.razon_social ?? "",
  titulo: f.titulo as string,
  grupos: Array.isArray(f.grupos) ? (f.grupos as Grupo[]) : [],
  minimo: (f.minimo_grupo as number) ?? 5,
  trabajadores: (f.trabajadores as number | null) ?? null,
  acuerdoFecha: (f.acuerdo_fecha as string | null) ?? null,
  acuerdoNota: (f.acuerdo_nota as string | null) ?? "",
  estado: f.estado as EvaluacionPsicosocial["estado"],
  inicio: f.inicio as string,
  cerradaEn: (f.cerrada_en as string | null) ?? null,
  conclusiones: (f.conclusiones as string | null) ?? "",
  medidas: Array.isArray(f.medidas) ? (f.medidas as Medida[]) : [],
  creadoPor: (f.creado_por as string | null) ?? null,
});

// --- Modo demo: una evaluación de ejemplo con resultados, para conocer la pantalla sin datos reales ---
export const ID_DEMO_PSICO = "00000000-0000-4000-8000-0000000051c0";
const DEMO: EvaluacionPsicosocial = {
  id: ID_DEMO_PSICO, empresaId: "demo", empresa: "Comercial Ejemplo, C.A.", titulo: "Riesgos psicosociales 2026",
  grupos: [{ id: "g1", nombre: "Cajeras y taquilla" }, { id: "g2", nombre: "Almacén y despacho" }, { id: "g3", nombre: "Administración" }, { id: "g4", nombre: "Gerencia" }],
  minimo: 5, trabajadores: 48, acuerdoFecha: "2026-10-02", acuerdoNota: "Comité de Seguridad y Salud Laboral, acta n.º 14: se acuerda aplicar el método y respetar sus condiciones.",
  estado: "cerrada", inicio: "2026-10-06", cerradaEn: "2026-10-31", conclusiones: "",
  medidas: [{ id: "m1", apartado: 1, medida: "Ajustar la plantilla de caja en las horas pico (viernes y quincenas).", responsable: "Gerencia y RR. HH.", plazo: "60 días" }],
  creadoPor: null,
};
const d = (apartado: number, verde: number, amarillo: number, rojo: number, media: number) => ({ apartado, verde, amarillo, rojo, media });
const DEMO_RESULTADOS: Resultados = {
  total: 41, codigos: 48, usados: 41, minimo: 5, suficiente: true, abierta: false, sin_grupo: 0,
  dimensiones: [d(1, 6, 12, 23, 12.4), d(2, 15, 14, 12, 22.1), d(3, 9, 16, 16, 8.7), d(4, 10, 13, 18, 26.0), d(5, 14, 15, 12, 4.9), d(6, 13, 12, 16, 10.6)],
  grupos: [
    { id: "g1", nombre: "Cajeras y taquilla", n: 18, dimensiones: [d(1, 1, 4, 13, 14.6), d(2, 3, 6, 9, 18.2), d(3, 3, 7, 8, 9.4), d(4, 3, 6, 9, 24.3), d(5, 3, 7, 8, 6.8), d(6, 4, 5, 9, 9.5)] },
    { id: "g2", nombre: "Almacén y despacho", n: 14, dimensiones: [d(1, 3, 5, 6, 11.0), d(2, 6, 5, 3, 23.9), d(3, 3, 6, 5, 8.6), d(4, 4, 4, 6, 26.1), d(5, 6, 5, 3, 3.9), d(6, 5, 4, 5, 10.9)] },
    { id: "_otros", nombre: "Otros puestos (grupos pequeños juntos)", n: 9, dimensiones: [d(1, 2, 3, 4, 10.4), d(2, 6, 3, 0, 27.1), d(3, 3, 3, 3, 7.6), d(4, 3, 3, 3, 28.3), d(5, 5, 3, 1, 3.1), d(6, 4, 3, 2, 11.9)] },
  ],
};

export async function listarPsicosociales(empresaId: string | null): Promise<(EvaluacionPsicosocial & { respuestas: number | null })[]> {
  if (!supabaseConfigurado) return [{ ...DEMO, respuestas: DEMO_RESULTADOS.total }];
  const supabase = await crearClienteServidor();
  let q = supabase.from("evaluaciones_psicosociales").select(COLUMNAS).order("inicio", { ascending: false }).limit(200);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data } = await q;
  return ((data ?? []) as unknown as Fila[]).map((f) => ({ ...convertir(f), respuestas: null }));
}

export async function obtenerPsicosocial(id: string): Promise<EvaluacionPsicosocial | null> {
  if (!supabaseConfigurado) return id === ID_DEMO_PSICO ? DEMO : null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("evaluaciones_psicosociales").select(COLUMNAS).eq("id", id).maybeSingle();
  return data ? convertir(data as unknown as Fila) : null;
}

// Para la empresa (RR. HH., delegado…): solo las cerradas, por la vista limitada
export async function obtenerPsicosocialEmpresa(id: string): Promise<EvaluacionPsicosocial | null> {
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("evaluaciones_psicosociales_rrhh")
    .select("id, empresa_id, titulo, metodo, inicio, cerrada_en, trabajadores, acuerdo_fecha, conclusiones, medidas, creado_por, empresas(razon_social)")
    .eq("id", id).maybeSingle();
  if (!data) return null;
  return convertir({ ...(data as unknown as Fila), grupos: [], minimo_grupo: 5, acuerdo_nota: null, estado: "cerrada" });
}

export async function listarPsicosocialesEmpresa(): Promise<{ id: string; titulo: string; empresa: string; inicio: string; cerradaEn: string | null }[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("evaluaciones_psicosociales_rrhh").select("id, titulo, inicio, cerrada_en, empresas(razon_social)").order("cerrada_en", { ascending: false }).limit(10);
  return ((data ?? []) as unknown as (Fila & { titulo: string; inicio: string; cerrada_en: string | null })[])
    .map((f) => ({ id: f.id as string, titulo: f.titulo, empresa: f.empresas?.razon_social ?? "", inicio: f.inicio, cerradaEn: f.cerrada_en }));
}

export async function resultadosPsicosociales(id: string): Promise<Resultados | null> {
  if (!supabaseConfigurado) return id === ID_DEMO_PSICO ? DEMO_RESULTADOS : null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("resultados_psicosociales", { p_evaluacion: id });
  if (error || !data) return null;
  return data as Resultados;
}

// Códigos que aún no se usaron (para imprimir o mandar por WhatsApp). El servicio solamente.
export async function codigosPsicosociales(id: string): Promise<{ libres: string[]; usados: number }> {
  if (!supabaseConfigurado) return { libres: id === ID_DEMO_PSICO ? ["K7Q3M9TX", "P4WZ8HNC", "B2RT6YQE", "M8XK3VGA"] : [], usados: id === ID_DEMO_PSICO ? 41 : 0 };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("codigos_psicosociales").select("codigo, usado").eq("evaluacion_id", id).order("codigo").limit(3000);
  const filas = (data ?? []) as { codigo: string; usado: boolean }[];
  return { libres: filas.filter((f) => !f.usado).map((f) => f.codigo), usados: filas.filter((f) => f.usado).length };
}
