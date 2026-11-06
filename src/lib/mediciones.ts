// Goniometría y espirometría con valores: evaluaciones OPCIONALES que se piden como un paraclínico más
// (Cesar, 06-nov: «se pueden hacer como no»). Si se piden y no se llenan quedan como cualquier resultado
// pendiente (aviso que no bloquea); si no se piden, no existen. Los valores viajan dentro del paraclínico
// (consultas.paraclinicos[].medicion), así que no hay columna nueva ni cambio en la réplica del escritorio.
// El resumen (texto + semáforo) se calcula aquí y es lo que sale en los impresos; el detalle solo en el informe médico.
import type { Paraclinico } from "@/lib/consultas-tipos";
import { claseDe } from "@/lib/estudios";

export type Lado = "D" | "I" | "U"; // derecho, izquierdo, único (columna: flexión/extensión)
export type FilaGonio = { clave: string; lado: Lado; grados: number; normal: number };
export type ValoresEspiro = {
  fvc: number | null; fvcPct: number | null;
  fev1: number | null; fev1Pct: number | null;
  relacion: number | null; // FEV1/FVC en %
  pef: number | null;
};
export type Medicion =
  | { tipo: "goniometria"; filas: FilaGonio[]; nota?: string }
  | { tipo: "espirometria"; valores: ValoresEspiro; nota?: string };
export type TipoMedicion = Medicion["tipo"];
export type Estado = "" | "normal" | "fuera" | "alterado";

// ── Goniometría ──────────────────────────────────────────────
// Valores normales de referencia: AAOS (American Academy of Orthopaedic Surgeons, «Joint Motion: Method of
// Measuring and Recording»), tal como los recoge Norkin y White, «Medición del movimiento articular».
// «deficit»: extensión de codo y rodilla, donde lo normal es 0° y se anota cuánto falta para extender.
export type Movimiento = { clave: string; nombre: string; normal: number; lados: boolean; deficit?: boolean };
export type Articulacion = { clave: string; nombre: string; movimientos: Movimiento[] };

const m = (clave: string, nombre: string, normal: number, lados = true, deficit = false): Movimiento => ({ clave, nombre, normal, lados, deficit });
export const ARTICULACIONES: Articulacion[] = [
  { clave: "hombro", nombre: "Hombro", movimientos: [m("hombro.flex", "Flexión", 180), m("hombro.ext", "Extensión", 60), m("hombro.abd", "Abducción", 180), m("hombro.ri", "Rotación interna", 70), m("hombro.re", "Rotación externa", 90)] },
  { clave: "codo", nombre: "Codo y antebrazo", movimientos: [m("codo.flex", "Flexión", 150), m("codo.ext", "Falta para extender", 0, true, true), m("codo.pro", "Pronación", 80), m("codo.sup", "Supinación", 80)] },
  { clave: "muneca", nombre: "Muñeca", movimientos: [m("muneca.flex", "Flexión", 80), m("muneca.ext", "Extensión", 70), m("muneca.rad", "Desviación radial", 20), m("muneca.cub", "Desviación cubital", 30)] },
  { clave: "cadera", nombre: "Cadera", movimientos: [m("cadera.flex", "Flexión", 120), m("cadera.ext", "Extensión", 30), m("cadera.abd", "Abducción", 45), m("cadera.add", "Aducción", 30), m("cadera.ri", "Rotación interna", 45), m("cadera.re", "Rotación externa", 45)] },
  { clave: "rodilla", nombre: "Rodilla", movimientos: [m("rodilla.flex", "Flexión", 135), m("rodilla.ext", "Falta para extender", 0, true, true)] },
  { clave: "tobillo", nombre: "Tobillo y pie", movimientos: [m("tobillo.dor", "Dorsiflexión", 20), m("tobillo.pla", "Flexión plantar", 50), m("tobillo.inv", "Inversión", 35), m("tobillo.eve", "Eversión", 15)] },
  { clave: "cervical", nombre: "Columna cervical", movimientos: [m("cervical.flex", "Flexión", 45, false), m("cervical.ext", "Extensión", 45, false), m("cervical.lat", "Inclinación lateral", 45), m("cervical.rot", "Rotación", 60)] },
  { clave: "lumbar", nombre: "Columna dorsolumbar", movimientos: [m("lumbar.flex", "Flexión", 80, false), m("lumbar.ext", "Extensión", 25, false), m("lumbar.lat", "Inclinación lateral", 35), m("lumbar.rot", "Rotación", 45)] },
];
export const FUENTE_GONIOMETRIA = "Valores normales AAOS (Norkin y White). Normal ≥ 90 % del valor de referencia; limitación leve 70–89 %; limitación marcada < 70 %. En la extensión de codo y rodilla: hasta 5° normal, 6–15° leve, más de 15° marcada.";

const MOV = new Map(ARTICULACIONES.flatMap((a) => a.movimientos.map((mv) => [mv.clave, { ...mv, articulacion: a.nombre }] as const)));
const ORDEN = new Map([...MOV.keys()].map((k, i) => [k, i]));
/** Filas en el orden de la tabla (hombro → columna; derecho antes que izquierdo). */
export const ordenarFilas = (filas: FilaGonio[]) => [...filas].sort((a, b) => (ORDEN.get(a.clave) ?? 999) - (ORDEN.get(b.clave) ?? 999) || a.lado.localeCompare(b.lado));
export const movimiento = (clave: string) => MOV.get(clave);

/** Estado de una fila: % del normal (o grados que faltan para extender). */
export function estadoFila(f: FilaGonio): { estado: Exclude<Estado, "">; pct: number | null } {
  const mv = MOV.get(f.clave);
  if (mv?.deficit) return { estado: f.grados <= 5 ? "normal" : f.grados <= 15 ? "fuera" : "alterado", pct: null };
  if (!f.normal) return { estado: "normal", pct: null };
  const pct = Math.round((f.grados / f.normal) * 100);
  return { estado: pct >= 90 ? "normal" : pct >= 70 ? "fuera" : "alterado", pct };
}

const LADO: Record<Lado, string> = { D: "der.", I: "izq.", U: "" };
const peor = (a: Estado, b: Estado): Estado => (a === "alterado" || b === "alterado" ? "alterado" : a === "fuera" || b === "fuera" ? "fuera" : a || b);

function resumenGonio(filas: FilaGonio[]): { estado: Estado; texto: string } {
  if (!filas.length) return { estado: "", texto: "" };
  let estado: Estado = "normal";
  const limitadas: string[] = [];
  for (const f of ordenarFilas(filas)) {
    const e = estadoFila(f);
    estado = peor(estado, e.estado);
    if (e.estado === "normal") continue;
    const mv = MOV.get(f.clave);
    if (!mv) continue;
    const valor = mv.deficit ? `le faltan ${f.grados}° para extender` : `${f.grados}° de ${f.normal}°`;
    limitadas.push(`${mv.articulacion.toLowerCase()} ${LADO[f.lado]} ${mv.deficit ? "" : mv.nombre.toLowerCase()} ${valor}`.replace(/\s+/g, " "));
  }
  if (!limitadas.length) return { estado, texto: `Arcos de movimiento conservados (${filas.length} ${filas.length === 1 ? "medido" : "medidos"}).` };
  const titulo = estado === "alterado" ? "Limitación marcada" : "Limitación leve";
  return { estado, texto: `${titulo}: ${limitadas.join("; ")}.` };
}

// ── Espirometría ─────────────────────────────────────────────
// Patrón: obstructivo si FEV1/FVC < 70 %; restrictivo probable si la relación es normal y la FVC < 80 % del previsto;
// mixto si ambas. Gravedad por FEV1 % del previsto (ATS/ERS 2005: > 70 leve, 60–69 moderada, 50–59 moderadamente
// grave, 35–49 grave, < 35 muy grave). Si el espirómetro da su propia interpretación (LIN, puntuación z), manda esa:
// se escribe en la nota y el color se cambia a mano.
export const FUENTE_ESPIROMETRIA = "Criterio ATS/ERS 2005: obstrucción si FEV1/FVC < 70 %; restricción probable si la FVC < 80 % del previsto con relación normal; gravedad según el FEV1 % del previsto. Si el informe del espirómetro (LIN o puntuación z) dice otra cosa, manda el informe.";

export function relacionCalculada(v: Pick<ValoresEspiro, "fvc" | "fev1">) {
  return v.fvc && v.fev1 ? Math.round((v.fev1 / v.fvc) * 1000) / 10 : null;
}

export function interpretarEspiro(v: ValoresEspiro): { estado: Estado; patron: string; gravedad: string } {
  const rel = v.relacion ?? relacionCalculada(v);
  if (rel === null && v.fvcPct === null && v.fev1Pct === null) return { estado: "", patron: "", gravedad: "" };
  const obstruccion = rel !== null && rel < 70;
  const restriccion = v.fvcPct !== null && v.fvcPct < 80;
  if (!obstruccion && !restriccion && (v.fev1Pct === null || v.fev1Pct >= 80)) return { estado: "normal", patron: "Espirometría normal", gravedad: "" };
  const patron = obstruccion && restriccion ? "Patrón mixto" : obstruccion ? "Patrón obstructivo" : restriccion ? "Patrón restrictivo probable" : "FEV1 disminuido con relación normal";
  const f = v.fev1Pct;
  const gravedad = f === null ? "" : f >= 70 ? "leve" : f >= 60 ? "moderado" : f >= 50 ? "moderadamente grave" : f >= 35 ? "grave" : "muy grave";
  const estado: Estado = f === null || f >= 70 ? "fuera" : "alterado";
  return { estado, patron, gravedad };
}

const n1 = (x: number | null, d = 2) => (x === null ? "" : String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ","));

function resumenEspiro(v: ValoresEspiro): { estado: Estado; texto: string } {
  const i = interpretarEspiro(v);
  if (!i.estado) return { estado: "", texto: "" };
  const rel = v.relacion ?? relacionCalculada(v);
  const datos = [
    v.fvc !== null && `FVC ${n1(v.fvc)} L${v.fvcPct !== null ? ` (${n1(v.fvcPct, 0)} %)` : ""}`,
    v.fev1 !== null && `FEV1 ${n1(v.fev1)} L${v.fev1Pct !== null ? ` (${n1(v.fev1Pct, 0)} %)` : ""}`,
    rel !== null && `FEV1/FVC ${n1(rel, 0)} %`,
    v.pef !== null && `PEF ${n1(v.pef)} L/s`,
  ].filter(Boolean).join(" · ");
  return { estado: i.estado, texto: `${i.patron}${i.gravedad ? ` ${i.gravedad}` : ""}${datos ? `. ${datos}` : ""}.` };
}

// ── Común ────────────────────────────────────────────────────
export function resumenMedicion(med: Medicion): { estado: Estado; texto: string } {
  const r = med.tipo === "goniometria" ? resumenGonio(med.filas) : resumenEspiro(med.valores);
  const nota = med.nota?.trim();
  const texto = [r.texto, nota].filter(Boolean).join(" ");
  return { estado: r.estado, texto: texto.slice(0, 500) };
}

export const medicionVacia = (med: Medicion | undefined) =>
  !med || (med.tipo === "goniometria" ? med.filas.length === 0 : Object.values(med.valores).every((x) => x === null)) && !med.nota?.trim();

/** ¿Este examen se registra con valores? Por la clase del catálogo o, si es libre, por su nombre. */
export function tipoMedicion(p: Pick<Paraclinico, "id" | "nombre" | "grupo">, catalogo: { id: string; nombre: string; grupo?: string | null; datos?: Record<string, unknown> | null }[]): TipoMedicion | null {
  const item = catalogo.find((c) => c.id === p.id) ?? { nombre: p.nombre, grupo: p.grupo };
  const c = claseDe(item);
  return c === "goniometria" || c === "espirometria" ? c : null;
}

export const NOMBRE_MEDICION: Record<TipoMedicion, string> = { goniometria: "Goniometría", espirometria: "Espirometría" };

/** Examen para agregar: el del catálogo si existe, si no uno libre (no hace falta crearlo en Configuración). */
export function examenParaAgregar(tipo: TipoMedicion, catalogo: { id: string; nombre: string; grupo?: string | null; datos?: Record<string, unknown> | null }[]): Paraclinico {
  const item = catalogo.find((c) => claseDe(c) === tipo);
  return item ? { id: item.id, nombre: item.nombre, grupo: item.grupo ?? null, resultado: "" } : { id: `libre-${tipo}`, nombre: NOMBRE_MEDICION[tipo], grupo: "Estudios funcionales", resultado: "" };
}

const num = (x: unknown, max: number) => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

/** Limpia lo que llega de la base o del formulario (datos viejos o a mano no rompen la pantalla). */
export function normalizarMedicion(x: unknown): Medicion | undefined {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>;
  const nota = typeof o.nota === "string" ? o.nota.slice(0, 300) : undefined;
  if (o.tipo === "goniometria" && Array.isArray(o.filas)) {
    const filas: FilaGonio[] = [];
    for (const f of o.filas.slice(0, 120) as Record<string, unknown>[]) {
      const mv = typeof f?.clave === "string" ? MOV.get(f.clave) : undefined;
      const grados = num(f?.grados, 360);
      if (!mv || grados === null) continue;
      const lado: Lado = mv.lados ? (f.lado === "I" ? "I" : "D") : "U";
      if (filas.some((x) => x.clave === mv.clave && x.lado === lado)) continue;
      filas.push({ clave: mv.clave, lado, grados, normal: mv.deficit ? 0 : num(f.normal, 360) || mv.normal });
    }
    return { tipo: "goniometria", filas, nota };
  }
  if (o.tipo === "espirometria" && o.valores && typeof o.valores === "object") {
    const v = o.valores as Record<string, unknown>;
    return { tipo: "espirometria", nota, valores: { fvc: num(v.fvc, 12), fvcPct: num(v.fvcPct, 250), fev1: num(v.fev1, 12), fev1Pct: num(v.fev1Pct, 250), relacion: num(v.relacion, 100), pef: num(v.pef, 25) } };
  }
  return undefined;
}
