// Solicitudes extras de la empresa (informes, copias, constancias…) desde el portal o registradas por el servicio
export type EstadoSolicitud = "pendiente" | "en_proceso" | "respondida" | "rechazada";

export type Solicitud = {
  id: string;
  empresaId: string;
  empresa: string;
  tipo: string;
  trabajadorId: string | null;
  trabajador: string | null;
  cedula: string | null;
  detalle: string;
  estado: EstadoSolicitud;
  respuesta: string | null;
  documento: string | null; // nombre del archivo de respuesta
  creadoEn: string;
  actualizadoEn: string | null;
};

export const ETIQUETA_SOLICITUD: Record<EstadoSolicitud, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-aviso/20 text-aviso-texto" },
  en_proceso: { texto: "En proceso", clase: "bg-primary/15 text-primary" },
  respondida: { texto: "Respondida", clase: "bg-ok/15 text-ok-texto" },
  rechazada: { texto: "Rechazada", clase: "bg-muted text-muted-foreground" },
};
