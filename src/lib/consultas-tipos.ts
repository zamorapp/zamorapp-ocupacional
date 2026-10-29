// Tipos y utilidades de la consulta, compartidos entre servidor y cliente.
import type { Aptitud } from "@/lib/pacientes";

export type FilaExamen = { clave: string; nombre: string; valor: string; normal: string };
// estado: semáforo del resultado ("" = sin clasificar); manual = el médico lo cambió a mano; unidad y referencia quedan
// copiadas del catálogo al escribir el resultado, para que la historia no cambie si el catálogo cambia.
export type Paraclinico = {
  id: string; nombre: string; grupo: string | null; resultado: string;
  estado?: "" | "normal" | "fuera" | "alterado"; manual?: boolean; unidad?: string; referencia?: string;
};
export type Diagnostico = { cie10: string; descripcion: string; sistema: string; origen: Origen; principal: boolean };
export type Medicamento = { medicina: string; concentracion?: string; presentacion: string; dosis: string; frecuencia: string; duracion: string; via: string; observacion?: string; notaFarmacia?: string };
export type Interconsulta = { especialidad: string; motivo: string };
// resultado: código de la lista «Resultados de reubicación» (efectiva, negada, en trámite); vacío = en trámite
export type Reubicacion = { activa: boolean; tipo: "temporal" | "definitiva"; puestoActual: string; puestoPropuesto: string; desde: string; hasta: string; motivo: string; restricciones: string; resultado: string };
export type InformeLibre = { titulo: string; dirigidoA: string; cuerpo: string };
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
  revision: number; // 1 = original; sube cada vez que se corrige una consulta firmada
  fecha: string;
  tipo: "primera" | "sucesiva" | "derivada";
  motivoId: string | null;
  motivoTexto: string;
  // Especialidad de la consulta externa o especializada (cuadro del informe de vigilancia)
  especialidad: string;
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
  reposo: { activo: boolean; causa: string; ente: string; desde: string; hasta: string; cie10: string; medicoExterno: string; centroIvss: string; validadoIvss: boolean };
  reubicacion: Reubicacion;
  informeLibre: InformeLibre;
  conclusiones: string;
  recomendacionesEmpresa: string;
  recomendacionesTrabajador: string;
  observacionPrivada: string;
  autorizaPaciente: boolean;
  sano: boolean;
  potencialDiscapacidad: boolean;
  discapacidadNota: string;
};

// Mediciones anteriores del trabajador (consultas cerradas o firmadas) para los gráficos de evolución
export type MedicionSignos = { fecha: string; signos: SignosVitales };

// Reposos de otras consultas del trabajador, para avisar si el nuevo se solapa
export type ReposoPrevio = { consultaId: string | null; desde: string; hasta: string; causa: string; ente: string };

// Días en común entre dos rangos de fechas (aaaa-mm-dd), 0 si no se tocan
export function diasSolapados(a: { desde: string; hasta: string }, b: { desde: string; hasta: string }) {
  const ini = Math.max(Date.parse(a.desde), Date.parse(b.desde));
  const fin = Math.min(Date.parse(a.hasta), Date.parse(b.hasta));
  return Number.isFinite(ini) && Number.isFinite(fin) && fin >= ini ? Math.round((fin - ini) / 864e5) + 1 : 0;
}

// "120/80" → [120, 80]
export function partirTa(ta?: string): [number, number] | null {
  const m = String(ta ?? "").match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// Llena los campos {nombre} {cedula}… de un modelo de texto; los que no tienen valor quedan como están para completarlos a mano
export function llenarModelo(texto: string, campos: Record<string, string>) {
  return texto.replace(/\{(\w+)\}/g, (todo, k: string) => (campos[k]?.trim() ? campos[k] : todo));
}

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

// Texto para historia e informes
export function resumenAntecedentes(valor: Antecedente[]) {
  const linea = (a: Antecedente) => [a.nombre, a.observacion].filter(Boolean).join(": ");
  const p = valor.filter((a) => a.grupo !== "familiar" && a.nombre.trim());
  const f = valor.filter((a) => a.grupo === "familiar" && a.nombre.trim());
  return {
    personales: p.length ? p.map(linea).join("; ") : "No refiere antecedentes personales.",
    familiares: f.length ? f.map(linea).join("; ") : "No refiere antecedentes familiares.",
  };
}
