// Evaluación de condición: cierre de las consultas de medicina general (motivos «no preventivos»: morbilidad,
// emergencia, control…). No son evaluaciones ocupacionales, así que no llevan elegibilidad para el cargo sino la
// condición del trabajador al salir de la consulta (pedido de Cesar, 16-nov-2026): si puede seguir en su trabajo y si
// puede cumplir sus funciones generales en el puesto. Las opciones son la lista «condicion_trabajador» (Configuración
// › Listas): el grupo de cada opción es la pregunta a la que responde; se elige una por pregunta.
// Se guarda el TEXTO elegido ({grupo: texto, nota}): editar la lista después no cambia lo ya emitido.
// Sin dependencias: servidor y cliente.

export type Condicion = Record<string, string>;
export type OpcionCondicion = { codigo: string | null; nombre: string; grupo: string | null };

/** Preguntas conocidas (la lista puede traer otras: se muestran con su grupo como título) */
export const PREGUNTAS_CONDICION: Record<string, string> = {
  trabajo: "¿Puede seguir en su trabajo?",
  funciones: "¿Puede cumplir sus funciones en el puesto?",
};

/** Respaldo si la organización todavía no tiene la lista (misma redacción que la migración 968) */
export const OPCIONES_CONDICION_BASE: OpcionCondicion[] = [
  { codigo: "trabajo_si", nombre: "Puede continuar en su trabajo", grupo: "trabajo" },
  { codigo: "trabajo_no", nombre: "No puede continuar en su trabajo", grupo: "trabajo" },
  { codigo: "funciones_si", nombre: "Puede cumplir sus funciones generales en el puesto de trabajo", grupo: "funciones" },
  { codigo: "funciones_limitadas", nombre: "Puede cumplir sus funciones con limitaciones temporales", grupo: "funciones" },
  { codigo: "funciones_no", nombre: "No puede cumplir sus funciones generales en el puesto de trabajo", grupo: "funciones" },
];

const tituloGrupo = (g: string) => PREGUNTAS_CONDICION[g] ?? g.charAt(0).toUpperCase() + g.slice(1).replace(/_/g, " ");

/** Opciones agrupadas por pregunta, en el orden de la lista */
export function preguntasCondicion(items: OpcionCondicion[]): { grupo: string; titulo: string; opciones: string[] }[] {
  const fuente = items.length ? items : OPCIONES_CONDICION_BASE;
  const salida: { grupo: string; titulo: string; opciones: string[] }[] = [];
  for (const i of fuente) {
    const grupo = (i.grupo ?? "").trim().toLowerCase() || "condicion";
    if (grupo === "nota") continue; // reservado para el detalle escrito
    let p = salida.find((x) => x.grupo === grupo);
    if (!p) salida.push((p = { grupo, titulo: tituloGrupo(grupo), opciones: [] }));
    if (!p.opciones.includes(i.nombre)) p.opciones.push(i.nombre);
  }
  return salida;
}

/** Elige (o quita, si ya estaba) una opción: una sola por pregunta */
export function alternarCondicion(c: Condicion, grupo: string, texto: string): Condicion {
  const n = { ...c };
  if (n[grupo] === texto) delete n[grupo];
  else n[grupo] = texto;
  return n;
}

/** Solo textos con contenido (lo que se guarda); {} si no hay nada */
export function limpiarCondicion(c: unknown): Condicion {
  if (!c || typeof c !== "object" || Array.isArray(c)) return {};
  const salida: Condicion = {};
  for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) salida[k] = v.trim().slice(0, 600);
  }
  return salida;
}

export const tieneCondicion = (c: Condicion | undefined | null) => Boolean(c && Object.values(c).some((v) => v?.trim()));

/** Frases para los impresos: las respuestas (con punto final) y, al final, el detalle escrito */
export function frasesCondicion(c: Condicion | undefined | null): string[] {
  if (!c) return [];
  const conPunto = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
  const orden = Object.keys(PREGUNTAS_CONDICION);
  const pos = (k: string) => (orden.includes(k) ? orden.indexOf(k) : orden.length);
  const respuestas = Object.entries(c).filter(([k, v]) => k !== "nota" && v.trim())
    .sort(([a], [b]) => pos(a) - pos(b)).map(([, v]) => conPunto(v.trim()));
  return c.nota?.trim() ? [...respuestas, conPunto(c.nota.trim())] : respuestas;
}
