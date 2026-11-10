// Atenciones de enfermería: tipos y textos compartidos entre la pantalla, los reportes y la vigilancia.

export type TipoEnfermeria = "signos" | "tratamiento" | "procedimiento" | "cura" | "primeros_auxilios" | "orientacion" | "inspeccion" | "otro";

// En el orden en que se muestran los botones (lo más frecuente primero)
export const TIPOS_ENFERMERIA: { k: TipoEnfermeria; t: string; corto: string; sinTrabajador?: boolean; pideSignos?: boolean; pideTratamiento?: boolean }[] = [
  { k: "signos", t: "Toma de tensión y signos vitales", corto: "Tensión y signos", pideSignos: true },
  { k: "tratamiento", t: "Administración de tratamiento", corto: "Tratamiento", pideSignos: true, pideTratamiento: true },
  { k: "procedimiento", t: "Procedimiento (vendaje, nebulización, inyección…)", corto: "Procedimiento", pideSignos: true, pideTratamiento: true },
  { k: "cura", t: "Cura o curación", corto: "Cura", pideTratamiento: true },
  { k: "primeros_auxilios", t: "Primeros auxilios", corto: "Primeros auxilios", pideSignos: true, pideTratamiento: true },
  { k: "orientacion", t: "Orientación o charla", corto: "Orientación", sinTrabajador: true },
  { k: "inspeccion", t: "Inspección del lugar de trabajo", corto: "Inspección", sinTrabajador: true },
  { k: "otro", t: "Otra atención", corto: "Otra", sinTrabajador: true },
];

export const ETIQUETA_TIPO_ENFERMERIA: Record<string, string> = Object.fromEntries(TIPOS_ENFERMERIA.map((x) => [x.k, x.t]));
export const tipoEnfermeria = (k: string) => TIPOS_ENFERMERIA.find((x) => x.k === k) ?? TIPOS_ENFERMERIA[TIPOS_ENFERMERIA.length - 1];

// Procedimientos frecuentes: un clic los escribe en «¿Qué hiciste?» (se puede completar a mano)
export const PROCEDIMIENTOS_ENFERMERIA = [
  "Vendaje", "Inmovilización", "Nebulización", "Inyección IM", "Inyección EV", "Hidratación EV", "Glicemia capilar",
  "Retiro de puntos", "Lavado ocular", "Compresas frías", "Electrocardiograma",
];

// Signos que se anotan (las claves las valida la base)
export const SIGNOS_ENFERMERIA: { k: "ta" | "fc" | "fr" | "temp" | "glicemia" | "spo2" | "peso"; t: string; unidad: string; ejemplo: string }[] = [
  { k: "ta", t: "Tensión", unidad: "mmHg", ejemplo: "120/80" },
  { k: "fc", t: "Pulso", unidad: "lpm", ejemplo: "72" },
  { k: "temp", t: "Temperatura", unidad: "°C", ejemplo: "36,5" },
  { k: "glicemia", t: "Glicemia", unidad: "mg/dL", ejemplo: "95" },
  { k: "spo2", t: "Saturación", unidad: "%", ejemplo: "98" },
  { k: "fr", t: "Respiración", unidad: "rpm", ejemplo: "16" },
  { k: "peso", t: "Peso", unidad: "kg", ejemplo: "70" },
];

// Tensión alta para resaltarla en la lista (no decide nada: el médico evalúa)
export function tensionAlta(ta: string | null | undefined) {
  const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(String(ta ?? "").trim());
  return Boolean(m && (Number(m[1]) >= 140 || Number(m[2]) >= 90));
}

// Decisiones del médico (organizaciones.ajustes). Las dos empiezan apagadas.
export type AjustesEnfermeria = { enfermeria_unida?: boolean; enfermeria_vigilancia?: boolean };
