import type { Item } from "@/lib/listas";

// Diagnósticos de declaración obligatoria: dos listas editables (Configuración › Listas) comparadas por CIE-10.
// ocupacional = Anexo 1 de la NT-02-2008 (INPSASEL en 24 h; informe de investigación en 15 días, o 30 fuera de la lista).
// epidemiologica = enfermedades de notificación obligatoria al MPPS (diagnostico_declarable; el reporte la usa igual).

export type ListaDeclaracion = "ocupacional" | "epidemiologica";
export const LISTAS_DECLARACION: Record<ListaDeclaracion, string> = {
  ocupacional: "declaracion_ocupacional",
  epidemiologica: "diagnostico_declarable",
};
export const ETIQUETA_LISTA: Record<ListaDeclaracion, string> = {
  ocupacional: "Ocupacional (NT-02, Anexo 1)",
  epidemiologica: "Epidemiológica (MPPS)",
};

export type Regla = { lista: ListaDeclaracion; codigo: string; nombre: string; grupo: string | null };
export type Coincidencia = Regla & { precision: number };

const limpio = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

// ¿El patrón abarca el código? «M54.5» abarca M54.5x; «A15-A19» es un rango; «!Z56.0» excluye.
// Devuelve qué tan específico fue el acierto (largo del código del patrón) o 0 si no aplica.
export function abarca(patron: string, cie10: string): number {
  const c = limpio(cie10);
  if (!c) return 0;
  let mejor = 0;
  const partes = patron.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  for (const p of partes.filter((x) => x.startsWith("!"))) if (c.startsWith(limpio(p))) return 0;
  for (const p of partes.filter((x) => !x.startsWith("!"))) {
    const [a, b] = p.split("-").map(limpio);
    if (b) {
      if (c.slice(0, a.length) >= a && c.slice(0, b.length) <= b) mejor = Math.max(mejor, a.length);
    } else if (a && c.startsWith(a)) mejor = Math.max(mejor, a.length);
  }
  return mejor;
}

export function reglasDeListas(listas: Record<string, Item[]>): Regla[] {
  return (Object.keys(LISTAS_DECLARACION) as ListaDeclaracion[]).flatMap((lista) =>
    (listas[LISTAS_DECLARACION[lista]] ?? []).filter((i) => i.codigo).map((i) => ({ lista, codigo: i.codigo!, nombre: i.nombre, grupo: i.grupo })),
  );
}

// La regla más específica de cada lista que abarca el código (una por lista)
export function coincidencias(cie10: string, reglas: Regla[]): Coincidencia[] {
  const mejor = new Map<ListaDeclaracion, Coincidencia>();
  for (const r of reglas) {
    const precision = abarca(r.codigo, cie10);
    if (precision && precision > (mejor.get(r.lista)?.precision ?? 0)) mejor.set(r.lista, { ...r, precision });
  }
  return [...mejor.values()];
}

// Días para el informe de investigación NT-02 (Título IV, cap. II, 5.2.3)
export const diasInformeNt02 = (enAnexo1: boolean) => (enAnexo1 ? 15 : 30);
