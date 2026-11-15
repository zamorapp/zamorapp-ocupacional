// Lateralidad: la base solo acepta estos valores en minúscula (check de trabajadores). La pantalla muestra la etiqueta.
// 30-oct: la ficha mandaba «Diestro» y la base rechazaba la ficha entera (cargo, dependencia y lo demás se perdían).
export const LATERALIDADES = [
  { valor: "diestro", nombre: "Diestro" },
  { valor: "zurdo", nombre: "Zurdo" },
  { valor: "ambidiestro", nombre: "Ambidiestro" },
] as const;

const SINONIMOS: Record<string, string> = {
  diestra: "diestro", derecho: "diestro", derecha: "diestro",
  zurda: "zurdo", izquierdo: "zurdo", izquierda: "zurdo",
  ambidiestra: "ambidiestro", ambidextro: "ambidiestro", ambidextra: "ambidiestro",
};

// El valor que acepta la base, o null si está vacío. Uno que no se reconoce se devuelve tal cual (la acción lo explica).
export function normalizarLateralidad(x: string | null | undefined): string | null {
  const l = (x ?? "").trim().toLowerCase();
  if (!l) return null;
  return SINONIMOS[l] ?? l;
}

export const lateralidadValida = (x: string | null) => x === null || LATERALIDADES.some((l) => l.valor === x);

export const textoLateralidad = (x: string | null | undefined) => {
  const v = normalizarLateralidad(x);
  return LATERALIDADES.find((l) => l.valor === v)?.nombre ?? x ?? null;
};
