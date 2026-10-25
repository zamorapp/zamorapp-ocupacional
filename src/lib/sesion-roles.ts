// Roles: compartido entre servidor y cliente.

export type Rol =
  | "administrador"
  | "gerente_medico"
  | "medico"
  | "enfermeria"
  | "recepcion"
  | "coordinador_sst"
  | "gerente_empresa"
  | "supervisor"
  | "delegado_prevencion"
  | "trabajador"
  | "auditor";

export const ETIQUETA_ROL: Record<Rol, string> = {
  administrador: "Administrador",
  gerente_medico: "Gerente médico",
  medico: "Médico",
  enfermeria: "Enfermería",
  recepcion: "Recepción",
  coordinador_sst: "Coordinador SST",
  gerente_empresa: "Gerente de empresa",
  supervisor: "Supervisor",
  delegado_prevencion: "Delegado de prevención",
  trabajador: "Trabajador",
  auditor: "Auditor",
};
