// Categorías de las recomendaciones (empresa y trabajador) para encontrarlas por botones desplegables en la consulta
// (pedido de Cesar, 03-nov). La elegida en Configuración (lista_items.datos.categoria) manda; si no tiene, se deduce
// del nombre y del texto (así quedan clasificadas también las traídas del SAME y las que se agreguen después).
// Sin dependencias: servidor y cliente.

export const CATEGORIAS_RECOMENDACION = [
  ["evaluacion", "Por tipo de evaluación"],
  ["prevencion", "Prevención en el puesto y EPP"],
  ["partes_blandas", "Hernias y pared abdominal"],
  ["columna", "Columna vertebral"],
  ["miembro_superior", "Hombro y miembro superior"],
  ["miembro_inferior", "Rodilla y miembro inferior"],
  ["cardiovascular", "Hipertensión y corazón"],
  ["metabolico", "Diabetes, lípidos y peso"],
  ["salud_mental", "Ansiedad, depresión y estrés"],
  ["auditivo", "Audición y ruido"],
  ["visual", "Ojos y visión"],
  ["respiratorio", "Respiratorio"],
  ["laboratorio", "Sangre, orina y riñón"],
  ["maternidad", "Embarazo y lactancia"],
  ["reposo", "Reposo, restricciones y accidentes"],
  ["habitos", "Hábitos saludables"],
  ["otras", "Otras"],
] as const;

export type CategoriaRecomendacion = (typeof CATEGORIAS_RECOMENDACION)[number][0];
const CODIGOS = new Set<string>(CATEGORIAS_RECOMENDACION.map(([c]) => c));
export const nombreCategoria = (c: string) => CATEGORIAS_RECOMENDACION.find(([k]) => k === c)?.[1] ?? "Otras";
export const esCategoria = (c: unknown): c is CategoriaRecomendacion => typeof c === "string" && CODIGOS.has(c);

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Orden de revisión: lo más específico primero (una «hernia discal» es de columna, no de pared abdominal)
const REGLAS: [CategoriaRecomendacion, RegExp][] = [
  ["columna", /hernia discal|discopat|lumbalg|lumbar|cervical|dorsalg|escolios|columna|intervertebral|desnivel pelv|ciatic/],
  ["partes_blandas", /hernia|anillo (umbilical|inguinal)|defecto de pared|pared abdominal|eventraci|varicocele|hidrocele|lipoma|partes blandas/],
  ["miembro_superior", /hombro|manguito|epicondil|tunel carpiano|carpo|muneca|codo|miembros? superior|tendinitis|de quervain/],
  ["miembro_inferior", /rodilla|tobillo|menisco|cadera|miembros? inferior|varices|insuficiencia venosa|fascitis|pie plano/],
  ["salud_mental", /ansiedad|depresi|estres|psicosocial|psicolog|psiquiat|insomnio|salud mental/],
  ["laboratorio", /leucocit|leucopen|plaquet|trombocit|hematuri|proteinuri|oxaluri|orina|urinari|cetonuri|uratos|renal|glucosuri|anemia|hemoglobina/],
  ["metabolico", /diabet|glicemi|glucem|hiperglic|colesterol|triglic|dislipid|lipid|sobrepeso|obesidad|acido urico|hiperuric|metabolic/],
  ["cardiovascular", /hipertens|tension arterial|cardio|corazon|arritmi/],
  ["auditivo", /hipoacus|acustic|auditiv|audiometr|ruido|oido/],
  ["visual", /pterigi|visual|vision|ocular|oftalm|lentes|conjuntiv/],
  ["respiratorio", /pulmon|respirat|asma|espirometr|bronqu|viral|neumoconi/],
  ["laboratorio", /leucocit|plaquet|trombocit|hematuri|proteinuri|oxaluri|orina|urinari|cetonuri|uratos|renal|glucosuri|anemia|hemoglobina/],
  ["maternidad", /prenatal|postnatal|post natal|embaraz|lactanc|maternidad/],
  ["reposo", /reposo|reintegro|accidente|restriccion|limitacion|reubicaci/],
  ["prevencion", /\bepp\b|proteccion personal|induccion|notificacion de riesgos|pausas activas|manejo de cargas|ergonom|seguridad laboral/],
  ["habitos", /hidrataci|alimentaci|dieta|ejercicio|actividad fisica|tabaco|tabaquic|alcohol|higiene postural/],
  ["evaluacion", /apto|aptitud|egreso|ingreso|pre ?empleo|vacacional|periodic|inicio a funciones|paraclinic|especialista|condiciones especiales/],
];

type ItemConCategoria = { nombre: string; texto?: string | null; grupo?: string | null; datos?: Record<string, unknown> | null };

/** La categoría del item: la elegida en Configuración; si no, la deducida por su nombre (y, si no alcanza, su texto) */
export function categoriaDe(i: ItemConCategoria): CategoriaRecomendacion {
  const elegida = i.datos?.categoria;
  if (esCategoria(elegida)) return elegida;
  const nombre = sinTildes(i.nombre);
  for (const [c, re] of REGLAS) if (re.test(nombre)) return c;
  const texto = sinTildes(i.texto ?? "");
  for (const [c, re] of REGLAS) if (c !== "evaluacion" && re.test(texto)) return c;
  // Con motivos (PRE, PER…) y sin tema clínico: va con su tipo de evaluación
  return (i.grupo ?? "").trim() ? "evaluacion" : "otras";
}

/** Las categorías con al menos un item, en el orden fijo, con sus items */
export function agruparPorCategoria<T extends ItemConCategoria>(items: T[]): { categoria: CategoriaRecomendacion; nombre: string; items: T[] }[] {
  const mapa = new Map<CategoriaRecomendacion, T[]>();
  for (const i of items) {
    const c = categoriaDe(i);
    mapa.set(c, [...(mapa.get(c) ?? []), i]);
  }
  return CATEGORIAS_RECOMENDACION.filter(([c]) => mapa.has(c)).map(([c, n]) => ({ categoria: c, nombre: n, items: mapa.get(c)! }));
}

// ── Recomendaciones repetidas entre la empresa y el trabajador (un mismo documento) ──
const clave = (l: string) => sinTildes(l).replace(/^\s*(\d{1,2}[.)]|[-•*])\s*/, "").replace(/[.;:,\s]+$/, "").replace(/\s+/g, " ").trim();

/**
 * Quita de `texto` las líneas que ya están en `otro` (misma frase, sin contar numeración, tildes, mayúsculas ni el
 * punto final). Así una recomendación elegida para la empresa y para el trabajador sale una sola vez en el documento.
 */
export function sinRepetidas(texto: string | null | undefined, otro: string | null | undefined): string {
  if (!texto?.trim() || !otro?.trim()) return texto ?? "";
  const ya = new Set(otro.replace(/\r\n?/g, "\n").split("\n").map(clave).filter(Boolean));
  return texto.replace(/\r\n?/g, "\n").split("\n").filter((l) => !ya.has(clave(l))).join("\n");
}
