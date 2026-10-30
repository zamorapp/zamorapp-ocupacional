// Opciones dentro del texto de un perfil: «Escoliosis {dorsal|lumbar} de convexidad {derecha|izquierda}».
// Al aplicar el perfil el médico elige una de cada llave; sin elegir (p. ej. desde una plantilla) va la primera.
const LLAVES = /\{([^{}|\n]+(?:\|[^{}|\n]+)+)\}/g;

export type Tramo = string | string[];

// El texto partido en trozos fijos y grupos de opciones, en orden
export function tramosDePerfil(texto: string): Tramo[] {
  const salida: Tramo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(LLAVES)) {
    if (m.index > desde) salida.push(texto.slice(desde, m.index));
    salida.push(m[1].split("|").map((o) => o.trim()));
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) salida.push(texto.slice(desde));
  return salida;
}

export const tieneOpciones = (texto: string) => tramosDePerfil(texto).some((t) => Array.isArray(t));

// elegidas[i] = opción del grupo i; lo que falte toma la primera
export function completarPerfil(texto: string, elegidas: string[] = []): string {
  let i = 0;
  return tramosDePerfil(texto).map((t) => (Array.isArray(t) ? (elegidas[i++] ?? t[0]) : t)).join("");
}
