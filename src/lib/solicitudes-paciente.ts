// Enlace para que el paciente llene sus datos (/registro/<token>, 7 días, una sola vez). Lo usan el formulario público,
// la bandeja «Por revisar» de Atención médica y sus acciones del servidor. La base repite las reglas
// (migración 20261030895000_solicitudes_paciente.sql).

export const TOKEN_REGISTRO = /^[A-Za-z0-9_-]{40,60}$/;
export const DIAS_ENLACE_PACIENTE = 7;

// Lo que escribe el paciente (la base guarda solo estas claves, ya limpias)
export type DatosPaciente = {
  cedula: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  sexo?: "F" | "M";
  telefono: string;
  correo?: string;
  direccion?: string;
  tipo: "particular" | "empresa";
  empresa?: string;
  cargo?: string;
  motivo_id?: string;
  motivo?: string;
  fecha?: string;
  turno?: "manana" | "tarde";
};

export const TURNOS = { manana: "En la mañana", tarde: "En la tarde" } as const;

export type SolicitudPaciente = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  empresaSugerida: string | null;
  creado: string;
  vence: string;
  recibido: string | null;
  anulado: boolean;
  resultado: "aceptada" | "descartada" | null;
  revisado: string | null;
  datos: DatosPaciente | null;
  trabajadorId: string | null;
};

// Paciente que ya tiene ficha con esa cédula (cualquier letra: V, E o P)
export type Coincidencia = { id: string; nombre: string; empresa: string; estado: string; telefono: string | null; correo: string | null; direccion: string | null };

export const estadoEnlace = (s: Pick<SolicitudPaciente, "anulado" | "recibido" | "vence" | "resultado">, ahora: number) =>
  s.anulado ? "anulado" : s.resultado ?? (s.recibido ? "por revisar" : Date.parse(s.vence) < ahora ? "vencido" : "esperando");

export function mensajePaciente(nombre: string | null, servicio: string) {
  const primero = nombre?.trim().split(/\s+/)[0];
  return `${primero ? `Hola ${primero}, ` : "Hola, "}${servicio} te envía este enlace para que llenes tus datos y pidas tu consulta. Toma 2 minutos (vale ${DIAS_ENLACE_PACIENTE} días):`;
}

// Edad cumplida a una fecha (aaaa-mm-dd), para mostrarla al revisar
export function edad(nacimiento: string, hoy: string) {
  const [a, m, d] = nacimiento.split("-").map(Number);
  const [ha, hm, hd] = hoy.split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

export const soloDigitosCedula = (c: string) => c.replace(/\D/g, "");
