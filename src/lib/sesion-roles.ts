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

// Accidentes (misma lista que la regla eventos_editar de la base): quién completa, declara e investiga un evento.
// RR. HH. solo reporta accidentes e incidentes de su empresa (eventos_reportar_rrhh, Cesar 13-nov-2026).
export const ROLES_EDITAN_EVENTOS: Rol[] = ["administrador", "gerente_medico", "medico", "enfermeria", "coordinador_sst", "supervisor", "delegado_prevencion"];
export const puedeReportarEvento = (rol: Rol | null | undefined) => Boolean(rol && (ROLES_EDITAN_EVENTOS.includes(rol) || rol === "gerente_empresa"));

// Invitación por enlace (migración 966): el enlace lleva el rol. Nunca administrador ni trabajador (el trabajador tiene su
// enlace de paciente). Empresa: obligatoria para los roles de empresa y enfermería (la enfermera de una empresa ve solo esa),
// opcional para el médico (sin empresa ve todas) y ninguna para los demás del servicio. Misma regla que la base.
export const ROLES_INVITABLES: Rol[] = ["gerente_empresa", "enfermeria", "medico", "gerente_medico", "recepcion", "coordinador_sst", "supervisor", "delegado_prevencion", "auditor"];
export type EmpresaInvitacion = "obligatoria" | "opcional" | "ninguna";
export const empresaDeInvitacion = (rol: Rol): EmpresaInvitacion =>
  esRolEmpresa(rol) || rol === "enfermeria" ? "obligatoria" : rol === "medico" ? "opcional" : "ninguna";
// Cómo se nombra el rol al invitar (RR. HH. es «Gerente de empresa» en la base)
export const nombreRolInvitado = (rol: Rol) => (rol === "gerente_empresa" ? "RR. HH." : ETIQUETA_ROL[rol]);

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
