// Qué limpia cada regla, en palabras de Cesar. Las claves son las de public.limpieza_plazos.
export type Regla = { clave: string; dias: number; minimo: number; maximo: number; cantidad: number; bytes: number | null };
export type EstadoLimpieza = {
  reglas: Regla[];
  pdf_trabajador: { cantidad: number; bytes: number | null } | null;
  base_mb: number;
  local: boolean;
  ultima: Corrida | null;
  historial?: Corrida[];
};
export type Corrida = { en: string; automatica: boolean; resultado: Record<string, number> };

// Elementos borrados en una corrida (sin las claves repetidas de antes: pdf_enlaces_vencidos, etc.)
export function borrados(r: Record<string, number>): number {
  return Object.entries(r ?? {}).filter(([k]) => k in TEXTOS || k === "pdf_trabajador").reduce((s, [, v]) => s + (Number(v) || 0), 0);
}

export const TEXTOS: Record<string, { titulo: string; que: string; plazo: (d: number) => string }> = {
  pdf_enlaces: {
    titulo: "PDF de enlaces enviados",
    que: "La copia del PDF que se guarda para que la empresa o el trabajador lo descargue desde el enlace. El registro del envío se queda.",
    plazo: (d) => (d === 0 ? "apenas el enlace vence o se anula" : `${d} días después de que el enlace vence o se anula`),
  },
  enlaces_paciente: {
    titulo: "Enlaces de registro sin llenar",
    que: "Enlaces que el paciente nunca llenó y ya vencieron o anulaste. No tienen datos de nadie.",
    plazo: (d) => `${d} días después de vencer o anularse`,
  },
  enlaces_historial: {
    titulo: "Enlaces al paciente ya terminados",
    que: "Enlaces que el paciente llenó y ya terminaron (caducados, descartados o aceptados con el plazo de resultados cumplido). Su ficha, su cita y los resultados que subió se quedan.",
    plazo: (d) => `${d} días después de terminar`,
  },
  constancias_enviadas: {
    titulo: "Constancias del correo diario",
    que: "La copia del PDF que ya salió en el correo diario a RR. HH. La constancia se puede volver a imprimir cuando quieras.",
    plazo: (d) => `${d} días después de enviada`,
  },
  notificaciones_leidas: {
    titulo: "Avisos de la campana ya leídos",
    que: "Los avisos que ya abriste en la campana (los que no has leído se quedan).",
    plazo: (d) => `${d} días después del aviso`,
  },
  aperturas_enlaces: {
    titulo: "Registro de aperturas de enlaces",
    que: "La hora y el navegador de cada vez que alguien abrió un enlace.",
    plazo: (d) => `${d} días después de abierto`,
  },
  invitaciones: {
    titulo: "Invitaciones de RR. HH. sin usar",
    que: "Invitaciones que nadie aceptó y ya vencieron o revocaste.",
    plazo: (d) => `${d} días después de vencer o revocarse`,
  },
  pases_respaldo: {
    titulo: "Pases del respaldo de archivos",
    que: "Llaves de un solo uso que la PC pide para respaldar los archivos (valen 10 minutos).",
    plazo: (d) => `${d} día${d === 1 ? "" : "s"} después de creadas`,
  },
  registros_respaldo: {
    titulo: "Historial de respaldos",
    que: "Los renglones de «se respaldó tal día». Los archivos de respaldo de la PC y de Google Drive no se tocan.",
    plazo: (d) => `${d} días`,
  },
  agentes_registro: {
    titulo: "Registro de la puerta para agentes",
    que: "Las líneas de «tal agente hizo tal cosa». Las llaves apagadas o vencidas se borran antes: al día siguiente si nunca se usaron, a los 7 días si se usaron. Lo que el agente creó (empresas, presupuestos, citas) no se toca.",
    plazo: (d) => `${d} días`,
  },
};

export const NUNCA = [
  "Historias, consultas, diagnósticos, aptitudes y reposos",
  "Trabajadores, empresas y cargos",
  "Firmas, sellos y documentos de la historia",
  "Auditoría (quién vio o cambió qué)",
  "Papelera (solo tú la vacías)",
  "Registro de envíos: qué se mandó, a quién y cuándo",
  "Respaldos de la PC y de Google Drive",
];

export function peso(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
