import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";
import { MAPA_VACIO, type EvaluacionRiesgos, type FilaRiesgo, type Mapa, type PuestoEvaluado } from "@/lib/riesgos-puesto";

const COLUMNAS = "id, empresa_id, titulo, tipo, fecha, motivo, participantes, acta, puestos, filas, mapa, conclusion, observaciones, estado, evaluado_por, cerrada_en, aplicada_en, empresas(razon_social)";

type Fila = Record<string, unknown> & { empresas?: { razon_social: string } | null };
const mapaDe = (m: unknown): Mapa => {
  const x = (m ?? {}) as Partial<Mapa>;
  return { plano: typeof x.plano === "string" ? x.plano : null, marcas: Array.isArray(x.marcas) ? x.marcas : [], areas: Array.isArray(x.areas) ? x.areas : [] };
};
const convertir = (f: Fila): EvaluacionRiesgos => ({
  id: f.id as string,
  empresaId: f.empresa_id as string,
  empresa: f.empresas?.razon_social ?? "",
  titulo: f.titulo as string,
  tipo: f.tipo === "oficina" ? "oficina" : "general",
  fecha: f.fecha as string,
  motivo: (f.motivo as string | null) ?? "",
  participantes: (f.participantes as string | null) ?? "",
  acta: (f.acta as string | null) ?? "",
  puestos: Array.isArray(f.puestos) ? (f.puestos as PuestoEvaluado[]) : [],
  filas: Array.isArray(f.filas) ? (f.filas as FilaRiesgo[]) : [],
  mapa: mapaDe(f.mapa),
  conclusion: (f.conclusion as string | null) ?? "",
  observaciones: (f.observaciones as string | null) ?? "",
  estado: (f.estado as EvaluacionRiesgos["estado"]) ?? "cerrada",
  evaluadoPor: (f.evaluado_por as string | null) ?? null,
  cerradaEn: (f.cerrada_en as string | null) ?? null,
  aplicadaEn: (f.aplicada_en as string | null) ?? null,
});

// Modo demo: un almacén con sus puestos, riesgos valorados y un croquis con símbolos, para conocer la pantalla
export const ID_DEMO_RIESGOS = "00000000-0000-4000-8000-00000000e701";
export function demoRiesgos(): EvaluacionRiesgos {
  const f = (id: string, puesto: string, area: string, grupo: FilaRiesgo["grupo"], agente: string, fuente: string, efecto: string, expuestos: number, p: number, s: number, controles: string, medida: string, tipoMedida: FilaRiesgo["tipoMedida"], responsable: FilaRiesgo["responsable"], plazo = ""): FilaRiesgo =>
    ({ id, puestoId: null, puesto, area, tarea: "", grupo, agente, fuente, efecto, expuestos, p, s, controles, medida, tipoMedida, responsable, plazo });
  const filas = [
    f("r1", "Montacarguista", "Patio de carga", "mecanico", "Vehículos y montacargas en movimiento", "Montacargas y camiones en el mismo pasillo", "Atropellamiento, fracturas", 4, 4, 5, "Chaleco reflectivo", "Separar con rayado y barandas el paso peatonal del de montacargas", "ingenieria", "ingenieria", "Inmediato"),
    f("r2", "Montacarguista", "Patio de carga", "fisico", "Ruido", "Motor del montacargas y compresor", "Hipoacusia", 4, 3, 3, "Tapones", "Medir ruido (dosimetría) y encerrar el compresor", "ingenieria", "sst"),
    f("r3", "Despachador", "Almacén", "disergonomico", "Levantamiento manual de cargas", "Sacos de 25 kg desde el piso", "Lumbalgia, hernia discal", 8, 4, 4, "Faja lumbar", "Paletas a la altura de la cintura y carretilla para sacos", "ingenieria", "operaciones"),
    f("r4", "Despachador", "Almacén", "mecanico", "Almacenamiento o apilamiento inadecuado", "Estantes sin anclar", "Golpes, aplastamiento", 8, 2, 5, "", "Anclar estantes y señalar la carga máxima", "ingenieria", "ingenieria"),
    f("r5", "Auxiliar de limpieza", "Baños y comedor", "quimico", "Productos de limpieza y desinfección", "Cloro y desengrasante mezclados", "Irritación respiratoria y de piel", 2, 3, 3, "Guantes", "Hojas de seguridad visibles y prohibir mezclas; lentes y mascarilla", "administrativa", "sst"),
    f("r6", "Auxiliar de limpieza", "Baños y comedor", "biologico", "Fluidos corporales", "Limpieza de baños", "Infecciones", 2, 2, 3, "Guantes", "Vacuna antitetánica y hepatitis B", "administrativa", "sst"),
    f("r7", "Analista administrativo", "Oficinas", "psicosocial", "Ritmo acelerado o presión de tiempo", "Cierre de mes y metas", "Estrés, trastornos del sueño", 6, 3, 2, "", "Aplicar el cuestionario psicosocial y planificar los cierres", "administrativa", "rrhh"),
    f("r8", "Analista administrativo", "Oficinas", "disergonomico", "Uso de pantallas", "Sillas sin ajuste", "Cervicalgia, fatiga visual", 6, 3, 2, "", "Sillas regulables y pausas activas", "ingenieria", "rrhh"),
  ];
  return {
    id: ID_DEMO_RIESGOS, empresaId: "demo", empresa: "Alimentos del Centro, C.A.", titulo: "Planta principal · identificación inicial", tipo: "general",
    fecha: "2026-11-06", motivo: "Inicio del Programa de Seguridad y Salud en el Trabajo", participantes: "Comité de Seguridad y Salud Laboral; delegados de prevención Ana Pérez y Luis Rojas",
    acta: "Acta del Comité n.º 7, 06/11/2026", filas,
    puestos: [
      { clave: "t:montacarguista", puestoId: null, puesto: "Montacarguista", area: "Patio de carga", expuestos: 4 },
      { clave: "t:despachador", puestoId: null, puesto: "Despachador", area: "Almacén", expuestos: 8 },
      { clave: "t:auxiliar de limpieza", puestoId: null, puesto: "Auxiliar de limpieza", area: "Baños y comedor", expuestos: 2 },
      { clave: "t:analista administrativo", puestoId: null, puesto: "Analista administrativo", area: "Oficinas", expuestos: 6 },
    ],
    mapa: {
      plano: null,
      areas: [
        { id: "a1", x: 22, y: 12, texto: "PATIO DE CARGA" }, { id: "a2", x: 68, y: 12, texto: "ALMACÉN" },
        { id: "a3", x: 22, y: 62, texto: "BAÑOS Y COMEDOR" }, { id: "a4", x: 68, y: 62, texto: "OFICINAS" },
      ],
      marcas: [
        { id: "m1", x: 14, y: 30, filaId: "r1" }, { id: "m2", x: 30, y: 34, filaId: "r2" }, { id: "m3", x: 60, y: 30, filaId: "r3" },
        { id: "m4", x: 78, y: 34, filaId: "r4" }, { id: "m5", x: 15, y: 80, filaId: "r5" }, { id: "m6", x: 30, y: 80, filaId: "r6" },
        { id: "m7", x: 62, y: 80, filaId: "r7" }, { id: "m8", x: 78, y: 80, filaId: "r8" },
      ],
    },
    conclusion: "", observaciones: "", estado: "borrador", evaluadoPor: null, cerradaEn: null, aplicadaEn: null,
  };
}

export async function listarEvaluacionesRiesgos(empresaId?: string | null): Promise<EvaluacionRiesgos[]> {
  if (!supabaseConfigurado) return [demoRiesgos()];
  const supabase = await crearClienteServidor();
  let q = supabase.from("evaluaciones_riesgos").select(COLUMNAS).order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(300);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer las evaluaciones de riesgos: ${error.message}`);
  return ((data ?? []) as unknown as Fila[]).map(convertir);
}

export async function obtenerEvaluacionRiesgos(id: string): Promise<EvaluacionRiesgos | null> {
  if (!supabaseConfigurado) return id === ID_DEMO_RIESGOS ? demoRiesgos() : null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("evaluaciones_riesgos").select(COLUMNAS).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la evaluación: ${error.message}`);
  return data ? convertir(data as unknown as Fila) : null;
}

// La empresa (RR. HH., supervisor, delegado, auditor) lee solo la vista: cerradas de sus empresas, sin observaciones
export async function obtenerEvaluacionRiesgosEmpresa(id: string): Promise<EvaluacionRiesgos | null> {
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("evaluaciones_riesgos_rrhh")
    .select("id, empresa_id, titulo, tipo, fecha, motivo, participantes, acta, puestos, filas, mapa, conclusion, evaluado_por, cerrada_en")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la evaluación: ${error.message}`);
  return data ? convertir({ ...(data as Fila), estado: "cerrada", observaciones: null, aplicada_en: null }) : null;
}

// Portal de la empresa: las últimas cerradas de sus empresas, para descargar el informe y el mapa
export async function listarRiesgosEmpresa(): Promise<{ id: string; titulo: string; empresa: string; fecha: string; cerradaEn: string | null }[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("evaluaciones_riesgos_rrhh").select("id, titulo, fecha, cerrada_en, empresas(razon_social)").order("cerrada_en", { ascending: false }).limit(10);
  return ((data ?? []) as unknown as (Fila & { titulo: string; fecha: string; cerrada_en: string | null })[])
    .map((f) => ({ id: f.id as string, titulo: f.titulo, empresa: f.empresas?.razon_social ?? "", fecha: f.fecha, cerradaEn: f.cerrada_en }));
}

export { MAPA_VACIO };

// Preguntas de muestra para el modo demo (en la nube vienen de Configuración › Listas)
export const PREGUNTAS_DEMO = [
 {
  "id": "demo-fisico-1",
  "nombre": "¿Trabaja al aire libre bajo el sol directo, sobre todo entre las 10 y las 16 horas?",
  "grupo": "fisico",
  "texto": "Agente: Radiación no ionizante (sol, soldadura)\nDaño: Quemaduras, golpe de calor, cáncer de piel, daño ocular\nMedida: Toldos o sombra, horario rotativo, ropa manga larga, sombrero, lentes UV y protector solar\nFuente: OMS, Índice UV solar mundial (2002)"
 },
 {
  "id": "demo-fisico-2",
  "nombre": "¿Hay calor intenso en el puesto (sol, hornos, calderas, techos de zinc, cocina)?",
  "grupo": "fisico",
  "texto": "Agente: Calor\nDaño: Golpe de calor, agotamiento, deshidratación, calambres\nMedida: Medir el índice TGBH y comparar con COVENIN 2254; ventilación, pausas en sombra, aclimatación\nFuente: COVENIN 2254:1995 Calor y frío, límites de exposición"
 },
 {
  "id": "demo-quimico-1",
  "nombre": "¿Hay polvo en el aire (cemento, harina, madera, granos, tierra, sílice)?",
  "grupo": "quimico",
  "texto": "Agente: Polvos\nDaño: Asma, neumoconiosis, silicosis, alergias\nMedida: Humedecer, extracción localizada, mascarilla con filtro adecuado y espirometría\nFuente: COVENIN 2253:2001 Concentraciones ambientales permisibles"
 },
 {
  "id": "demo-quimico-2",
  "nombre": "¿Manipulan sustancias químicas (solventes, pinturas, ácidos, álcalis, plaguicidas)?",
  "grupo": "quimico",
  "texto": "Agente: Solventes\nDaño: Intoxicación, dermatitis, quemaduras químicas\nMedida: Hojas de seguridad visibles, sustitución por productos menos tóxicos, guantes y lentes\nFuente: COVENIN 2253:2001 Concentraciones ambientales permisibles"
 },
 {
  "id": "demo-biologico-1",
  "nombre": "¿Hay contacto con sangre, fluidos corporales o material cortopunzante usado?",
  "grupo": "biologico",
  "texto": "Agente: Fluidos corporales\nDaño: Hepatitis B y C, VIH, infecciones\nMedida: Recipientes rígidos para cortopunzantes, guantes, vacuna de hepatitis B y protocolo de accidente\nFuente: NT-04-2023 art. 18 (agentes biológicos)"
 },
 {
  "id": "demo-biologico-2",
  "nombre": "¿Se limpian baños, cloacas o se manejan desechos y basura?",
  "grupo": "biologico",
  "texto": "Agente: Desechos orgánicos\nDaño: Infecciones gastrointestinales, leptospirosis, tétanos\nMedida: Guantes, botas, lavado de manos, vacuna antitetánica\nFuente: NT-04-2023 art. 18 (agentes biológicos)"
 },
 {
  "id": "demo-mecanico-1",
  "nombre": "¿Se trabaja a más de 1,8 m de altura (escaleras, techos, andamios)?",
  "grupo": "mecanico",
  "texto": "Agente: Caídas de altura\nDaño: Fracturas, trauma craneal, muerte\nMedida: Permiso de trabajo, arnés con línea de vida, barandas y andamios certificados\nFuente: LOPCYMAT art. 59; OSHA 1926.501 (referencia 1,8 m)"
 },
 {
  "id": "demo-mecanico-2",
  "nombre": "¿Hay pisos resbaladizos, desniveles, huecos u obstáculos en el paso?",
  "grupo": "mecanico",
  "texto": "Agente: Caídas al mismo nivel\nDaño: Esguinces, fracturas, contusiones\nMedida: Orden y limpieza, señalizar desniveles, calzado antirresbalante\nFuente: COVENIN 187:2003 Señales de seguridad"
 },
 {
  "id": "demo-disergonomico-1",
  "nombre": "¿Levantan o cargan pesos de más de 25 kg (hombres) o 15 kg (mujeres), o cargas pesadas muchas veces al día?",
  "grupo": "disergonomico",
  "texto": "Agente: Levantamiento manual de cargas\nDaño: Lumbalgia, hernia discal\nMedida: Ayudas mecánicas, cargas más livianas, evaluar con NIOSH o DEB\nFuente: LOPCYMAT art. 59; ISO 11228-1"
 },
 {
  "id": "demo-disergonomico-2",
  "nombre": "¿Empujan o arrastran carretillas, carros o cargas pesadas?",
  "grupo": "disergonomico",
  "texto": "Agente: Empuje y arrastre\nDaño: Lumbalgia, lesiones de hombro\nMedida: Ruedas en buen estado, pisos lisos, evaluar con KIM\nFuente: ISO 11228-2"
 },
 {
  "id": "demo-psicosocial-1",
  "nombre": "¿Hay metas o tiempos muy apretados que obligan a trabajar a prisa?",
  "grupo": "psicosocial",
  "texto": "Agente: Ritmo acelerado o presión de tiempo\nDaño: Estrés, ansiedad, accidentes\nMedida: Planificar cargas, metas realistas, aplicar el cuestionario psicosocial\nFuente: LOPCYMAT art. 59; CoPsoQ-istas21"
 },
 {
  "id": "demo-psicosocial-2",
  "nombre": "¿Trabajan de noche, en turnos rotativos o jornadas de más de 8 horas?",
  "grupo": "psicosocial",
  "texto": "Agente: Turnos nocturnos o rotativos\nDaño: Trastornos del sueño, gastritis, accidentes\nMedida: Rotación hacia adelante, descansos, vigilancia médica de trabajadores nocturnos\nFuente: LOPCYMAT art. 59"
 }
];
