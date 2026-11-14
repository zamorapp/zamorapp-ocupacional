import type { Medicamento } from "@/lib/consultas-tipos";

// Indicación de enfermería o récipe SIN consulta (Cesar, 10-nov-2026): no cuenta como consulta ni como morbilidad.
// Módulo puro (sin servidor): tipos y textos que comparten la ficha, la impresión y las pruebas.

export type TipoIndicacion = "enfermeria" | "recipe" | "examenes";
export type EstadoIndicacion = "pendiente" | "cumplida" | "emitida" | "anulada";

export type IndicacionSuelta = {
  id: string;
  tipo: TipoIndicacion;
  fecha: string;
  tratamiento: Medicamento[];
  // Orden de exámenes (14-nov): nombres tal como los escribió el médico
  examenes: string[];
  // El médico decide si va suelta o adjunta a una consulta del paciente (fecha de esa consulta)
  consultaFecha: string | null;
  indicaciones: string;
  indicadoPor: string | null;
  estado: EstadoIndicacion;
  medico: string | null;
  cumplidaPor: string | null;
  cumplidaEn: string | null;
  notaCumplimiento: string | null;
  motivoAnulacion: string | null;
};

export const ETIQUETA_TIPO: Record<TipoIndicacion, string> = { enfermeria: "Orden a enfermería", recipe: "Récipe", examenes: "Orden de exámenes" };
export const ETIQUETA_ESTADO_INDICACION: Record<EstadoIndicacion, string> = {
  pendiente: "Por cumplir", cumplida: "Cumplida", emitida: "Emitido", anulada: "Anulada",
};

export const medicinaVacia = (): Medicamento => ({ medicina: "", concentracion: "", presentacion: "", dosis: "", frecuencia: "", duracion: "", via: "", observacion: "" });

// Línea de la orden a enfermería: «Complejo B 100/100/1 mg/3 ml · 1 ampolla vía intramuscular, dosis única»
export function lineaOrden(m: Medicamento): string {
  const nombre = [m.medicina, m.concentracion].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  const via = (m.via ?? "").trim() ? `vía ${m.via.trim().toLowerCase()}` : "";
  const como = [m.dosis?.trim(), via].filter(Boolean).join(" ");
  const cuando = [m.frecuencia?.trim().toLowerCase(), m.duracion?.trim() ? `por ${m.duracion.trim().toLowerCase()}` : ""].filter(Boolean).join(" ");
  return [nombre, [como, cuando].filter(Boolean).join(", "), m.observacion?.trim()].filter(Boolean).join(" · ");
}

// Lista de exámenes escrita a mano (uno por línea o separados por coma): sin vacíos ni repetidos, máximo 40
export function limpiarExamenes(xs: string[]): string[] {
  const vistos = new Set<string>();
  const sal: string[] = [];
  for (const x of xs.flatMap((v) => (v ?? "").split(/\r?\n/))) {
    const t = x.trim().replace(/\s+/g, " ").slice(0, 150);
    if (!t || vistos.has(t.toLowerCase())) continue;
    vistos.add(t.toLowerCase());
    sal.push(t);
  }
  return sal.slice(0, 40);
}
