import type { Medicamento } from "@/lib/consultas-tipos";

// Datos de cada medicina que exige la Res. MPPS 028 (reformada por la 031 de 2013) para imprimir el récipe.
// Módulo puro (sin servidor): lo usan la impresión, el editor de la consulta y las pruebas.

export const CAMPOS_RECIPE = [
  ["concentracion", "concentración"],
  ["presentacion", "presentación"],
  ["via", "vía"],
  ["dosis", "dosis"],
  ["frecuencia", "frecuencia"],
  ["duracion", "duración"],
] as const;
export type CampoRecipe = (typeof CAMPOS_RECIPE)[number][0];
export const ES_CAMPO_RECIPE = (c: string): c is CampoRecipe => CAMPOS_RECIPE.some(([k]) => k === c);

// Una concentración real: número + unidad (500 mg, 2,5 %, 100/100/1 mg/3 ml, 40 UI, 1 g/5 ml). «1ampolla» no lo es.
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const UNIDAD = String.raw`(?:mcg|µg|ug|mg|g|ml|mL|UI|U|mEq|%)`;
const CONC = new RegExp(String.raw`(?<![\p{L}\d])(${NUM}(?:\s*\/\s*${NUM})*\s*${UNIDAD}(?:\s*\/\s*(?:${NUM}\s*)?(?:ml|mL|g|dosis|gota|gotas))?)(?![\p{L}])`, "iu");

export const esConcentracion = (s: string | null | undefined) => CONC.test((s ?? "").trim());

// «Udox 75mg» → «75mg»; «Complejo B» → null
export function concentracionEnNombre(nombre: string | null | undefined): string | null {
  const m = (nombre ?? "").match(CONC);
  return m ? m[1].trim() : null;
}

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").toLowerCase();

// Concentración que sale en el récipe: la escrita, o la que ya trae el nombre de la medicina
export const concentracionDe = (m: Pick<Medicamento, "medicina" | "concentracion">) =>
  m.concentracion?.trim() || concentracionEnNombre(m.medicina) || "";

// Texto de la línea del récipe sin repetir la concentración si ya va en el nombre («Udox 75mg», no «Udox 75mg 75mg»)
export function nombreConConcentracion(m: Pick<Medicamento, "medicina" | "concentracion">) {
  const c = concentracionDe(m);
  return c && !plano(m.medicina).includes(plano(c)) ? `${m.medicina} ${c}` : m.medicina;
}

export type FaltaMedicina = { indice: number; medicina: string; campos: CampoRecipe[] };

// Qué le falta a cada medicina (el índice es el de la lista completa de la consulta)
export function faltantesMedicinas(tratamiento: Medicamento[]): FaltaMedicina[] {
  const salida: FaltaMedicina[] = [];
  tratamiento.forEach((m, indice) => {
    if (!m.medicina?.trim()) return;
    const campos = CAMPOS_RECIPE.map(([k]) => k).filter((k) => (k === "concentracion" ? !concentracionDe(m) : !String(m[k] ?? "").trim()));
    if (campos.length) salida.push({ indice, medicina: m.medicina, campos });
  });
  return salida;
}

export const textoFalta = (f: FaltaMedicina) =>
  `${f.medicina}: ${f.campos.map((c) => CAMPOS_RECIPE.find(([k]) => k === c)![1]).join(", ")}`;

// Sugerencias del vademécum para completar una medicina: medicinas del catálogo con el mismo nombre (o que lo
// empiezan, «Complejo B» → «Complejo B (B1, B6, B12)»). Si la medicina ya tiene presentación, solo las de esa
// presentación. Solo valores válidos y sin repetir; nunca se aplican solas: el médico elige.
export type ItemVademecum = { nombre: string; texto: string | null };
export function sugerenciasCatalogo(m: Medicamento, catalogo: ItemVademecum[], campo: CampoRecipe): string[] {
  const nombre = plano(m.medicina);
  if (!nombre) return [];
  const leer = (texto: string | null) => {
    const s: Record<string, string> = {};
    for (const l of (texto ?? "").split("\n")) {
      const i = l.indexOf(":");
      if (i > 0) s[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    }
    return s;
  };
  const candidatos = catalogo
    .filter((it) => { const n = plano(it.nombre); return n === nombre || n.startsWith(nombre) || nombre.startsWith(n); })
    .map((it) => ({ ...leer(it.texto), _nombre: it.nombre }) as Record<string, string | undefined> & { _nombre: string });
  const pres = plano(m.presentacion ?? "");
  const conPres = pres && campo !== "presentacion" ? candidatos.filter((c) => plano(c.presentacion ?? "") === pres) : candidatos;
  const valores = (conPres.length ? conPres : candidatos)
    .map((c) => (campo === "concentracion" ? c.concentracion ?? concentracionEnNombre(c._nombre) ?? "" : c[campo] ?? "").trim())
    .filter((v) => v && (campo !== "concentracion" || esConcentracion(v)));
  const vistos = new Set<string>();
  return valores.filter((v) => { const k = plano(v); if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 4);
}
