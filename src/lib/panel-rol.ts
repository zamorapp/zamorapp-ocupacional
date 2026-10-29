import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { Sesion } from "@/lib/sesion";

export type Tarea = { titulo: string; valor: number; detalle: string; href: string; urgente?: boolean };
export type Enfoque = { titulo: string; tareas: Tarea[]; acciones: { titulo: string; href: string; icono: "consulta" | "paciente" | "accidente" | "constancia" | "cita" | "cobro" | "reporte" | "usuarios" }[] };

export type Tareas = { citados: number; en_espera: number; solicitadas: number; eventos_abiertos: number; por_cobrar: number; por_firmar?: number; abiertas?: number; por_recibir?: number };

const ACCIONES_DE = (sesion: Pick<Sesion, "rol" | "clinico">) =>
  sesion.clinico ? ACCIONES.clinico : sesion.rol === "recepcion" ? ACCIONES.recepcion : sesion.rol === "coordinador_sst" ? ACCIONES.sst : ACCIONES.admin;

// Accesos rápidos: solo dependen del rol, salen al instante sin esperar a la base
export const accionesDelRol = (sesion: Pick<Sesion, "rol" | "clinico">) => ACCIONES_DE(sesion);

// El médico ve solo sus consultas por firmar y abiertas; el gerente médico y el administrador, todas
export const soloMias = (sesion: Pick<Sesion, "rol">) => sesion.rol !== "gerente_medico" && sesion.rol !== "administrador";

// Lo primero que ve cada rol al entrar. Los conteos llegan todos juntos de la base (inicio_conteos).
export function enfoqueDelRol(sesion: Sesion, t: Tareas | null): Enfoque {
  const rol = sesion.rol;
  const firma = sesion.clinico && rol !== "enfermeria";

  if (!supabaseConfigurado || !t) {
    return {
      titulo: "Tu día",
      tareas: [
        { titulo: "En espera ahora", valor: 2, detalle: "Llegaron y esperan consulta", href: "/atencion", urgente: true },
        { titulo: "Por firmar", valor: 3, detalle: "Consultas cerradas sin firma", href: "/atencion" },
        { titulo: "Solicitudes del portal", valor: 1, detalle: "Citas pedidas por empresas", href: "/atencion" },
      ],
      acciones: ACCIONES.clinico,
    };
  }

  if (sesion.clinico) {
    return {
      titulo: "Tu consulta de hoy",
      tareas: [
        { titulo: "En espera ahora", valor: t.en_espera, detalle: "Llegaron y esperan consulta", href: "/atencion", urgente: t.en_espera > 0 },
        ...(firma ? [{ titulo: "Por firmar", valor: t.por_firmar ?? 0, detalle: "Consultas cerradas sin firma", href: "/atencion" }] : []),
        { titulo: "Consultas abiertas", valor: t.abiertas ?? 0, detalle: "Empezadas y sin cerrar", href: "/atencion" },
        { titulo: "Resultados por recibir", valor: t.por_recibir ?? 0, detalle: "Exámenes solicitados sin resultado", href: "/atencion#consultas" },
      ],
      acciones: ACCIONES.clinico,
    };
  }

  if (rol === "recepcion") {
    return {
      titulo: "Recepción de hoy",
      tareas: [
        { titulo: "Por llegar", valor: t.citados, detalle: "Citados para hoy", href: "/atencion" },
        { titulo: "En espera", valor: t.en_espera, detalle: "Ya llegaron", href: "/atencion", urgente: t.en_espera > 0 },
        { titulo: "Solicitudes del portal", valor: t.solicitadas, detalle: "Por confirmar", href: "/atencion", urgente: t.solicitadas > 0 },
      ],
      acciones: ACCIONES.recepcion,
    };
  }

  if (rol === "coordinador_sst") {
    return {
      titulo: "Seguridad y salud",
      tareas: [
        { titulo: "Eventos abiertos", valor: t.eventos_abiertos, detalle: "Accidentes e incidentes sin cerrar", href: "/accidentes", urgente: t.eventos_abiertos > 0 },
        { titulo: "Solicitudes del portal", valor: t.solicitadas, detalle: "Citas por confirmar", href: "/atencion" },
      ],
      acciones: ACCIONES.sst,
    };
  }

  // Administración, auditoría y demás roles internos: cobros y operación general
  return {
    titulo: "Operación",
    tareas: [
      { titulo: "Notas por cobrar", valor: t.por_cobrar, detalle: "Emitidas sin pagar", href: "/facturacion", urgente: t.por_cobrar > 0 },
      { titulo: "Solicitudes del portal", valor: t.solicitadas, detalle: "Citas por confirmar", href: "/atencion" },
    ],
    acciones: ACCIONES.admin,
  };
}

// Exámenes vencidos o por vencer: tarea de quienes agendan (recepción, SST y operación). El personal de salud ya tiene cuatro.
export function conVencimientos(enfoque: Enfoque, rol: Sesion["rol"], clinico: boolean, vencidos: number, porVencer: number): Enfoque {
  if (clinico || !rol || rol === "gerente_empresa") return enfoque;
  const tarea: Tarea = {
    titulo: "Exámenes por programar",
    valor: vencidos + porVencer,
    detalle: vencidos ? `${vencidos} vencidos y ${porVencer} por vencer` : "Por vencer: agenda sus citas",
    href: "/reportes/vencimientos",
    urgente: vencidos > 0,
  };
  return { ...enfoque, tareas: [...enfoque.tareas, tarea] };
}

const ACCIONES: Record<string, Enfoque["acciones"]> = {
  clinico: [
    { titulo: "Nueva consulta", href: "/atencion", icono: "consulta" },
    { titulo: "Nuevo paciente", href: "/pacientes", icono: "paciente" },
    { titulo: "Reportar accidente", href: "/accidentes", icono: "accidente" },
    { titulo: "Documentos emitidos", href: "/documentos", icono: "constancia" },
  ],
  recepcion: [
    { titulo: "Agendar cita", href: "/atencion", icono: "cita" },
    { titulo: "Nuevo paciente", href: "/pacientes", icono: "paciente" },
    { titulo: "Citas por lote", href: "/atencion/citas-lote", icono: "cita" },
    { titulo: "Importar nómina", href: "/pacientes/importar", icono: "paciente" },
  ],
  sst: [
    { titulo: "Reportar accidente", href: "/accidentes", icono: "accidente" },
    { titulo: "Informe trimestral", href: "/reportes", icono: "reporte" },
    { titulo: "Empresas y puestos", href: "/empresas", icono: "paciente" },
    { titulo: "Agendar cita", href: "/atencion", icono: "cita" },
  ],
  admin: [
    { titulo: "Nueva nota de cobro", href: "/facturacion/nuevo", icono: "cobro" },
    { titulo: "Reportes", href: "/reportes", icono: "reporte" },
    { titulo: "Usuarios y roles", href: "/configuracion/usuarios", icono: "usuarios" },
    { titulo: "Nuevo paciente", href: "/pacientes", icono: "paciente" },
  ],
};
