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
// Las frases traídas del SAME dicen lo mismo con otras palabras («Uso de EPP» / «1. Uso de los EPP»), con viñetas,
// numeración corrida («1. … 2. …» en un solo párrafo) o erratas. Se comparan por sus palabras con sentido; si cambia
// cualquier número (kg, meses, mg/dl) nunca cuentan como iguales, para no perder una indicación clínica distinta.
const VACIAS = new Set("a al con de del el en la las lo los o para por que se su sus un una y e u".split(" "));

/** Parte un texto en sus puntos: uno por línea o «1. … 2. …» corrido; sin viñetas ni numeración */
export function partirPuntos(texto: string): string[] {
  return texto
    .replace(/\r\n?/g, "\n")
    .split(/\n|(?:^|\s)(?=\d{1,2}(?:\.{1,2}|\))\s)/)
    .map((x) => x.replace(/^\s*(\d{1,2}(?:\.{1,2}|\))|[-•*]+)\s*/, "").trim())
    .filter(Boolean);
}

const palabras = (l: string) => sinTildes(l).replace(/(\d)[.,](\d)/g, "$1_$2").split(/[^a-z0-9_]+/).filter((w) => w && !VACIAS.has(w));
const numeros = (ws: string[]) => ws.filter((w) => /\d/.test(w)).sort().join(" ");

// ¿Difieren en una sola letra (sobra, falta o cambia)?
function unaLetra(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

/** ¿Dos puntos dicen lo mismo? Iguales sin tildes/viñetas/artículos, o casi iguales (≥85 % de sus palabras) y largos */
export function dicenLoMismo(a: string, b: string): boolean {
  const wa = palabras(a), wb = palabras(b);
  if (!wa.length || !wb.length) return false;
  if (numeros(wa) !== numeros(wb)) return false;
  if (wa.join(" ") === wb.join(" ")) return true;
  const A = new Set(wa), B = new Set(wb);
  if (A.size < 5 || B.size < 5) return false;
  // Una errata («incurir») no separa dos frases: palabras largas que difieren en una letra cuentan como la misma
  const igual = (w: string) => B.has(w) || (w.length >= 6 && [...B].some((x) => x.length >= 6 && unaLetra(w, x)));
  let comunes = 0;
  for (const w of A) if (igual(w)) comunes++;
  return comunes / (A.size + B.size - comunes) >= 0.85;
}

/** Los puntos de un texto sin los que repiten a uno anterior (dos frases elegidas que comparten una indicación) */
export function puntosUnicos(texto: string): string[] {
  const vistos: string[] = [];
  for (const p of partirPuntos(texto)) if (!vistos.some((v) => dicenLoMismo(v, p))) vistos.push(p);
  return vistos;
}

/**
 * Quita de `texto` los puntos que ya están en `otro` (misma indicación, aunque cambien numeración, viñetas, tildes,
 * artículos o una errata). Así una recomendación elegida para la empresa y para el trabajador sale una sola vez.
 */
export function sinRepetidas(texto: string | null | undefined, otro: string | null | undefined): string {
  if (!texto?.trim() || !otro?.trim()) return texto ?? "";
  const ya = partirPuntos(otro);
  const repetido = (p: string) => ya.some((o) => dicenLoMismo(o, p));
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n");
  // Un punto por línea: se quitan las líneas repetidas y el resto queda como lo escribió el médico
  if (lineas.every((l) => partirPuntos(l).length <= 1)) {
    const quedan = lineas.filter((l) => !partirPuntos(l).some(repetido));
    return quedan.length === lineas.length ? texto : quedan.join("\n");
  }
  const puntos = partirPuntos(texto);
  const quedan = puntos.filter((p) => !repetido(p));
  return quedan.length === puntos.length ? texto : quedan.join("\n");
}

// «Hernia Umbilical» (nombres del SAME en Mayúscula Cada Palabra) → «Hernia umbilical» al mostrarlos; siglas
// (EPP, AIT, IVSS) quedan. No cambia lo guardado.
export function nombreLegible(nombre: string) {
  const palabras = nombre.trim().split(/\s+/);
  const tipoTitulo = palabras.length > 1 && palabras.filter((w) => /^\p{L}/u.test(w)).every((w) => /^\p{Lu}/u.test(w));
  if (!tipoTitulo) return nombre.trim();
  return palabras.map((w, i) => (i === 0 || (w.length > 1 && w === w.toUpperCase()) ? w : w.toLowerCase())).join(" ");
}
