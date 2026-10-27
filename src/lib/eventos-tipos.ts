// Accidentes, incidentes y enfermedades ocupacionales: tipos y plazos legales (servidor y cliente).
import type { Cargo, Incapacidad, Testigo } from "@/lib/covenin474";

export type TipoEvento = "accidente" | "incidente" | "enfermedad";
export type EstadoEvento = "abierto" | "declarado" | "investigando" | "cerrado";
export type Accion = { descripcion: string; responsable: string; fecha: string; estado: "pendiente" | "en_proceso" | "cumplida" };

export type Evento = {
  id: string;
  numero: number;
  empresaId: string;
  empresa: string;
  trabajadorId: string | null;
  trabajador: string | null;
  cedula: string | null;
  tipo: TipoEvento;
  subtipo: string | null;
  fechaHora: string;
  lugar: string;
  descripcion: string;
  testigos: string;
  parteCuerpo: string;
  naturalezaLesion: string;
  agente: string;
  forma: string;
  gravedad: string;
  conTiempoPerdido: boolean;
  diasPerdidos: number;
  diasCargados: number;
  fechaAviso: string | null;
  fechaDeclaracion: string | null;
  numeroDeclaracion: string;
  cie10: string;
  diagnostico: string;
  fechaDiagnostico: string | null;
  enAnexo1: boolean;
  fechaInformeNt02: string | null;
  estadoCertificacion: string;
  causasInmediatas: string;
  causasBasicas: string;
  acciones: Accion[];
  estado: EstadoEvento;
  // Planilla de notificación (COVENIN 474, Anexo D)
  turno: "" | "diurno" | "nocturno" | "mixto";
  actividadMomento: string;
  motivoActividad: string;
  lesiones: string;
  testigosDetalle: Testigo[];
  actoInseguro: string;
  condicionInsegura: string;
  incapacidad: Incapacidad | null;
  cargos: Cargo[];
  observaciones: string;
  creadoEn: string;
};

export const ETIQUETA_TIPO: Record<TipoEvento, string> = {
  accidente: "Accidente de trabajo",
  incidente: "Incidente",
  enfermedad: "Enfermedad ocupacional",
};

export const ETIQUETA_ESTADO_EVENTO: Record<EstadoEvento, string> = {
  abierto: "Abierto",
  declarado: "Declarado",
  investigando: "En investigación",
  cerrado: "Cerrado",
};

const HORA = 3600e3;

export type Plazo = { texto: string; estado: "ok" | "aviso" | "alerta"; vence: Date | null; cumplido: boolean };

function describir(vence: Date, ahora: Date, que: string): Plazo {
  const resta = vence.getTime() - ahora.getTime();
  if (resta < 0) {
    const h = Math.floor(-resta / HORA);
    return { texto: `${que} vencida hace ${h >= 48 ? `${Math.floor(h / 24)} días` : `${h} h`}`, estado: "alerta", vence, cumplido: false };
  }
  const h = Math.floor(resta / HORA);
  const m = Math.floor((resta % HORA) / 60e3);
  const texto = h >= 48 ? `${que} vence en ${Math.floor(h / 24)} días` : `${que} vence en ${h} h ${m} min`;
  // Aviso a partir de las 12 h transcurridas (quedan menos de 12 h)
  return { texto, estado: h < 12 ? "alerta" : "aviso", vence, cumplido: false };
}

// Declaración ante el INPSASEL: 24 h desde el accidente o desde el diagnóstico (LOPCYMAT art. 73)
export function plazoDeclaracion(e: Pick<Evento, "tipo" | "fechaHora" | "fechaDiagnostico" | "fechaDeclaracion">, ahora = new Date()): Plazo | null {
  if (e.tipo === "incidente") return null;
  if (e.fechaDeclaracion) return { texto: "Declarado", estado: "ok", vence: null, cumplido: true };
  const base = e.tipo === "enfermedad" ? e.fechaDiagnostico : e.fechaHora;
  if (!base) return { texto: "Falta la fecha del diagnóstico", estado: "aviso", vence: null, cumplido: false };
  return describir(new Date(new Date(base).getTime() + 24 * HORA), ahora, "Declaración");
}

// Informe de investigación NT-02-2008: 15 días (enfermedad del Anexo 1) o 30 días (fuera de la lista)
export function plazoInformeNt02(e: Pick<Evento, "tipo" | "fechaDiagnostico" | "enAnexo1" | "fechaInformeNt02">, ahora = new Date()): Plazo | null {
  if (e.tipo !== "enfermedad" || !e.fechaDiagnostico) return null;
  if (e.fechaInformeNt02) return { texto: "Informe NT-02 entregado", estado: "ok", vence: null, cumplido: true };
  const dias = e.enAnexo1 ? 15 : 30;
  return describir(new Date(new Date(e.fechaDiagnostico).getTime() + dias * 24 * HORA), ahora, `Informe NT-02 (${dias} días)`);
}

// Investigación del accidente: aviso si a los 7 días no tiene causas registradas (configurable más adelante)
export const DIAS_INVESTIGACION = 7;
export function plazoInvestigacion(e: Pick<Evento, "tipo" | "fechaHora" | "causasInmediatas" | "causasBasicas" | "estado">, ahora = new Date()): Plazo | null {
  if (e.tipo === "enfermedad" || e.estado === "cerrado") return null;
  // Los eventos de hace más de 60 días (históricos o importados) no generan aviso
  if (ahora.getTime() - new Date(e.fechaHora).getTime() > 60 * 24 * HORA) return null;
  if (e.causasInmediatas.trim() || e.causasBasicas.trim()) return { texto: "Investigación registrada", estado: "ok", vence: null, cumplido: true };
  return describir(new Date(new Date(e.fechaHora).getTime() + DIAS_INVESTIGACION * 24 * HORA), ahora, "Investigación del accidente");
}

export const fechaHoraVE = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso))
    : "—";
