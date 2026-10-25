// Tipos y utilidades de la consulta, compartidos entre servidor y cliente.
import type { Aptitud } from "@/lib/pacientes";

export type FilaExamen = { clave: string; nombre: string; valor: string; normal: string };
export type Paraclinico = { id: string; nombre: string; grupo: string | null; resultado: string };
export type Diagnostico = { cie10: string; descripcion: string; sistema: string; origen: Origen; principal: boolean };
export type Medicamento = { medicina: string; presentacion: string; dosis: string; frecuencia: string; duracion: string; via: string };
export type Interconsulta = { especialidad: string; motivo: string };
export type Habito = { clave: string; nombre: string; valor: string };
export type Antecedente = { id: string; nombre: string; grupo: string | null; observacion: string };

export type Origen = "comun" | "ocupacional" | "accidente_comun" | "accidente_laboral";
export type EstadoConsulta = "borrador" | "cerrada" | "firmada";

export const ETIQUETA_ORIGEN: Record<Origen, string> = {
  comun: "Enfermedad común",
  ocupacional: "Enfermedad ocupacional",
  accidente_comun: "Accidente común",
  accidente_laboral: "Accidente laboral",
};

export const ETIQUETA_ESTADO_CONSULTA: Record<EstadoConsulta, string> = {
  borrador: "En curso",
  cerrada: "Cerrada",
  firmada: "Firmada",
};

export type SignosVitales = {
  ta?: string;
  fc?: string;
  fr?: string;
  temp?: string;
  sat?: string;
  peso?: string;
  talla?: string;
};

export type DatosConsulta = {
  id: string;
  estado: EstadoConsulta;
  fecha: string;
  tipo: "primera" | "sucesiva" | "derivada";
  motivoId: string | null;
  motivoTexto: string;
  enfermedadActual: string;
  antecedentes: Antecedente[];
  habitos: Habito[];
  signos: SignosVitales;
  examenFuncional: FilaExamen[];
  examenFisico: FilaExamen[];
  paraclinicos: Paraclinico[];
  diagnosticos: Diagnostico[];
  aptitud: { clasificacion: Aptitud | ""; observacion: string; limitaciones: string[]; vigenteHasta: string };
  tratamiento: Medicamento[];
  indicaciones: string;
  interconsultas: Interconsulta[];
  reposo: { activo: boolean; causa: string; ente: string; desde: string; hasta: string; cie10: string };
  conclusiones: string;
  recomendacionesEmpresa: string;
  recomendacionesTrabajador: string;
  observacionPrivada: string;
  autorizaPaciente: boolean;
  sano: boolean;
};

export function imc(peso?: string, talla?: string) {
  const p = Number(String(peso ?? "").replace(",", "."));
  let t = Number(String(talla ?? "").replace(",", "."));
  if (!p || !t) return null;
  if (t > 3) t = t / 100; // talla en cm
  const v = p / (t * t);
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

export function clasificarImc(v: number | null) {
  if (v === null) return null;
  if (v < 18.5) return { texto: "Bajo peso", alerta: true };
  if (v < 25) return { texto: "Normal", alerta: false };
  if (v < 30) return { texto: "Sobrepeso", alerta: true };
  return { texto: "Obesidad", alerta: true };
}

// Tensión arterial elevada si sistólica ≥ 140 o diastólica ≥ 90
export function taAlterada(ta?: string) {
  const m = String(ta ?? "").match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return m ? Number(m[1]) >= 140 || Number(m[2]) >= 90 : false;
}
