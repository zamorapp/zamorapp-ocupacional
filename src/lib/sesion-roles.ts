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

// Roles de la empresa cliente: usan el portal (no el menú del servicio) y deben tener empresa asignada
export const ROLES_EMPRESA: Rol[] = ["gerente_empresa", "trabajador", "supervisor", "delegado_prevencion", "auditor"];
export const esRolEmpresa = (rol: Rol | null | undefined) => Boolean(rol && ROLES_EMPRESA.includes(rol));
// De los roles de empresa, solo RR. HH. (gerente_empresa) pide citas, carga nómina y hace solicitudes (la base exige es_empresa)
export const empresaSoloLectura = (rol: Rol | null | undefined) => esRolEmpresa(rol) && rol !== "gerente_empresa";

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
