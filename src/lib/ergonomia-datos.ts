import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { NIOSH, proponerHallazgos, ROSA, RULA, type ClaveMetodo, type Hallazgo, type Respuestas, type Resultado } from "@/lib/ergonomia";
import { DEB } from "@/lib/ergonomia-deb";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Foto = { ruta: string; nota: string };
export type Evaluacion = {
  id: string;
  empresaId: string;
  empresa: string;
  puestoId: string | null;
  puesto: string;
  tarea: string;
  metodo: ClaveMetodo;
  lado: "derecho" | "izquierdo" | "ambos" | null;
  fecha: string;
  trabajadoresObservados: number | null;
  datos: Respuestas;
  resultado: Partial<Resultado>;
  hallazgos: Hallazgo[];
  fotos: Foto[];
  conclusion: string;
  observaciones: string;
  estado: "borrador" | "cerrada";
  evaluadoPor: string | null;
  cerradaEn: string | null;
};

const COLUMNAS = "id, empresa_id, puesto_id, puesto, tarea, metodo, lado, fecha, trabajadores_observados, datos, resultado, hallazgos, fotos, conclusion, observaciones, estado, evaluado_por, cerrada_en, empresas(razon_social)";

type Fila = Record<string, unknown> & { empresas: { razon_social: string } | null };
const convertir = (f: Fila): Evaluacion => ({
  id: f.id as string,
  empresaId: f.empresa_id as string,
  empresa: f.empresas?.razon_social ?? "",
  puestoId: (f.puesto_id as string | null) ?? null,
  puesto: f.puesto as string,
  tarea: (f.tarea as string | null) ?? "",
  metodo: f.metodo as ClaveMetodo,
  lado: (f.lado as Evaluacion["lado"]) ?? null,
  fecha: f.fecha as string,
  trabajadoresObservados: (f.trabajadores_observados as number | null) ?? null,
  datos: (f.datos as Respuestas) ?? {},
  resultado: (f.resultado as Partial<Resultado>) ?? {},
  hallazgos: Array.isArray(f.hallazgos) ? (f.hallazgos as Hallazgo[]) : [],
  fotos: Array.isArray(f.fotos) ? (f.fotos as Foto[]) : [],
  conclusion: (f.conclusion as string | null) ?? "",
  observaciones: (f.observaciones as string | null) ?? "",
  estado: f.estado as Evaluacion["estado"],
  evaluadoPor: (f.evaluado_por as string | null) ?? null,
  cerradaEn: (f.cerrada_en as string | null) ?? null,
});

// Modo demo: una evaluación RULA de ejemplo (cajera) para conocer la pantalla sin datos reales
export const ID_DEMO = "00000000-0000-4000-8000-00000000e601";
export const ID_DEMO_NIOSH = "00000000-0000-4000-8000-00000000e602";
export const ID_DEMO_DEB = "00000000-0000-4000-8000-00000000e604";
function demoDeb(): Evaluacion {
  // Despacho de un almacén: levantamiento en rojo, transporte y posturas en amarillo, empuje en verde con alertas
  const si = (claves: string) => Object.fromEntries(claves.split(" ").map((k) => [k, 1]));
  const no = (claves: string) => Object.fromEntries(claves.split(" ").map((k) => [k, 0]));
  const datos: Respuestas = {
    ...si("id_lev1 id_lev2 id_lev3 id_tra1 id_emp1 id_emp2 id_emp3 id_rep1 id_pos1 id_pos2"), ...no("id_rep2"),
    ...si("v_lev_c v_lev_d"), ...no("v_lev_a v_lev_b v_lev_e"), ...si("r_lev_j"), ...no("r_lev_a r_lev_b r_lev_c r_lev_d r_lev_e r_lev_f r_lev_g r_lev_h r_lev_i r_lev_k"),
    ...si("v_tra_c"), ...no("v_tra_a r_tra_a r_tra_b"), ...si("a_lt_suelo a_lt_8h"),
    ...si("v_emp_a v_emp_b v_emp_c v_emp_d a_e_ruedas"),
    ...si("v_pe_b v_pe_c v_pe_d v_pe_e v_pe_f v_pe_g v_pe_h v_pe_i v_pe_j v_pe_k v_pd_b v_pd_c v_pd_d v_pd_e v_pd_f"), ...no("v_pe_a v_pd_a"),
  };
  const resultado = DEB.calcular(datos);
  let n = 0;
  return {
    ...demo(), id: ID_DEMO_DEB, puesto: "Despachador de almacén", tarea: "Preparación y carga de pedidos", metodo: "deb", lado: null, trabajadoresObservados: 8,
    datos, resultado, hallazgos: proponerHallazgos(DEB, resultado, [], () => `dd${++n}`),
  };
}
// DEB a medio llenar: para conocer el avance, las preguntas sin responder y el aviso al cerrar
export const ID_DEMO_DEB_EN_CURSO = "00000000-0000-4000-8000-00000000e605";
function demoDebEnCurso(): Evaluacion {
  const datos: Respuestas = { id_lev1: 1, id_lev2: 1, id_lev3: 1, v_lev_a: 1, v_lev_b: 0, id_tra1: 0 };
  return { ...demoDeb(), id: ID_DEMO_DEB_EN_CURSO, puesto: "Operador de línea", tarea: "Empaque de producto terminado", trabajadoresObservados: 14, datos, resultado: DEB.calcular(datos), hallazgos: [] };
}
export const ID_DEMO_ROSA = "00000000-0000-4000-8000-00000000e603";
function demoRosa(): Evaluacion {
  // Secretaria con silla sin ajustes y pantalla baja: segunda opción de cada pregunta
  const datos: Respuestas = {};
  for (const s of ROSA.secciones) for (const p of s.preguntas) datos[p.clave] = (p.opciones[1] ?? p.opciones[0]).valor;
  const resultado = ROSA.calcular(datos);
  let n = 0;
  return {
    ...demo(), id: ID_DEMO_ROSA, puesto: "Secretaria", tarea: "Trabajo en computadora y atención telefónica", metodo: "rosa", lado: null, trabajadoresObservados: 4,
    datos, resultado, hallazgos: proponerHallazgos(ROSA, resultado, [], () => `dr${++n}`),
  };
}
function demoNiosh(): Evaluacion {
  const datos = { carga: 25, h: 45, v: 20, d: 90, a: 45, frecuencia: 2, duracion: 3, agarre: 1 };
  const resultado = NIOSH.calcular(datos);
  let n = 0;
  return {
    ...demo(), id: ID_DEMO_NIOSH, puesto: "Almacenista", tarea: "Carga de sacos de harina al camión", metodo: "niosh", lado: null, trabajadoresObservados: 6,
    datos, resultado, hallazgos: proponerHallazgos(NIOSH, resultado, [], () => `dn${++n}`),
  };
}
function demo(): Evaluacion {
  const datos = { brazo: 2, brazoAbducido: 1, antebrazo: 2, antebrazoCruza: 1, muneca: 2, munecaDesviada: 1, giro: 1, musculoBrazo: 1, cargaBrazo: 0, cuello: 3, cuelloGiro: 0, tronco: 2, troncoGiro: 1, piernas: 1, musculoCuerpo: 1, cargaCuerpo: 0 };
  const resultado = RULA.calcular(datos);
  let n = 0;
  return {
    id: ID_DEMO, empresaId: "demo", empresa: "Alimentos del Centro, C.A.", puestoId: null, puesto: "Cajera", tarea: "Cobro y empaque en caja registradora",
    metodo: "rula", lado: "derecho", fecha: "2026-11-04", trabajadoresObservados: 12, datos, resultado,
    hallazgos: proponerHallazgos(RULA, resultado, [], () => `demo${++n}`), fotos: [],
    conclusion: "", observaciones: "", estado: "borrador", evaluadoPor: null, cerradaEn: null,
  };
}

export async function listarEvaluaciones(empresaId?: string | null): Promise<Evaluacion[]> {
  if (!supabaseConfigurado) return [demoDebEnCurso(), demoDeb(), demo(), demoNiosh(), demoRosa()];
  const supabase = await crearClienteServidor();
  let q = supabase.from("evaluaciones_ergonomicas").select(COLUMNAS).order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(300);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer las evaluaciones ergonómicas: ${error.message}`);
  return ((data ?? []) as unknown as Fila[]).map(convertir);
}

export async function obtenerEvaluacion(id: string): Promise<Evaluacion | null> {
  if (!supabaseConfigurado) return id === ID_DEMO ? demo() : id === ID_DEMO_NIOSH ? demoNiosh() : id === ID_DEMO_ROSA ? demoRosa() : id === ID_DEMO_DEB ? demoDeb() : id === ID_DEMO_DEB_EN_CURSO ? demoDebEnCurso() : null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("evaluaciones_ergonomicas").select(COLUMNAS).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la evaluación: ${error.message}`);
  return data ? convertir(data as unknown as Fila) : null;
}

// Puestos activos de las empresas, para elegir qué evaluar
export async function puestosPorEmpresa(): Promise<Record<string, { id: string; nombre: string; tareas: string }[]>> {
  if (!supabaseConfigurado) return {};
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("puestos").select("id, empresa_id, nombre, tareas").eq("activo", true).order("nombre").limit(5000);
  const r: Record<string, { id: string; nombre: string; tareas: string }[]> = {};
  for (const p of data ?? []) (r[p.empresa_id as string] ??= []).push({ id: p.id as string, nombre: p.nombre as string, tareas: (p.tareas as string | null) ?? "" });
  return r;
}

// La empresa (RR. HH., supervisor, delegado, auditor) no lee la tabla: solo la vista con las cerradas de sus empresas,
// sin datos del método, sin fotos y con los hallazgos de RR. HH. (Cesar, 04-nov)
export async function obtenerEvaluacionEmpresa(id: string): Promise<Evaluacion | null> {
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("evaluaciones_ergonomicas_rrhh")
    .select("id, empresa_id, puesto, tarea, metodo, fecha, trabajadores_observados, nivel, hallazgos, conclusion, evaluado_por, cerrada_en")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la evaluación: ${error.message}`);
  if (!data) return null;
  const f = data as unknown as Fila;
  return {
    ...convertir({ ...f, empresas: null, puesto_id: null, lado: null, datos: {}, fotos: [], observaciones: null, estado: "cerrada" } as Fila),
    resultado: f.nivel ? { nivel: f.nivel as string } : {},
  };
}
