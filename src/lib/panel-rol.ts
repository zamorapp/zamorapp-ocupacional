import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import type { Paraclinico } from "@/lib/consultas-tipos";
import { contarResultados } from "@/lib/paraclinicos";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Tarea = { titulo: string; valor: number; detalle: string; href: string; urgente?: boolean };
export type Enfoque = { titulo: string; tareas: Tarea[]; acciones: { titulo: string; href: string; icono: "consulta" | "paciente" | "accidente" | "constancia" | "cita" | "cobro" | "reporte" | "usuarios" }[] };

// Lo primero que ve cada rol al entrar. El rol viene de la base (miembros, el mismo que usa mi_rol()).
// Solo se piden conteos (head: true): la base cuenta y no se descarga ninguna fila.
export async function enfoqueDelRol(sesion: Sesion): Promise<Enfoque> {
  const rol = sesion.rol;
  const firma = sesion.clinico && rol !== "enfermeria";

  if (!supabaseConfigurado) {
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

  const supabase = await crearClienteServidor();
  const hoy = hoyCaracas();
  const contar = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const citas = (estado: string) => supabase.from("citas").select("id", { count: "exact", head: true }).eq("fecha", hoy).eq("estado", estado);
  const solicitudes = () => supabase.from("citas").select("id", { count: "exact", head: true }).eq("estado", "solicitada");

  if (sesion.clinico) {
    let porFirmar = supabase.from("consultas").select("id", { count: "exact", head: true }).eq("estado", "cerrada");
    let abiertas = supabase.from("consultas").select("id", { count: "exact", head: true }).eq("estado", "borrador");
    if (rol !== "gerente_medico" && rol !== "administrador") {
      porFirmar = porFirmar.eq("medico_id", sesion.usuarioId);
      abiertas = abiertas.eq("medico_id", sesion.usuarioId);
    }
    // Resultados por recibir: exámenes sin resultado en consultas de los últimos 60 días (las importadas del SAME no cuentan)
    let conExamenes = supabase.from("consultas").select("paraclinicos").is("origen", null).neq("paraclinicos", "[]")
      .gte("fecha", sumarDias(hoyCaracas(), -60)).limit(1000);
    if (rol !== "gerente_medico" && rol !== "administrador") conExamenes = conExamenes.eq("medico_id", sesion.usuarioId);
    const porRecibir = conExamenes.then(({ data }) => (data ?? []).reduce((n, c) => n + contarResultados((c.paraclinicos ?? []) as Paraclinico[]).pendientes, 0));
    const [espera, firmar, enCurso, resultados] = await Promise.all([contar(citas("en_espera")), firma ? contar(porFirmar) : Promise.resolve(0), contar(abiertas), porRecibir]);
    return {
      titulo: "Tu consulta de hoy",
      tareas: [
        { titulo: "En espera ahora", valor: espera, detalle: "Llegaron y esperan consulta", href: "/atencion", urgente: espera > 0 },
        ...(firma ? [{ titulo: "Por firmar", valor: firmar, detalle: "Consultas cerradas sin firma", href: "/atencion" }] : []),
        { titulo: "Consultas abiertas", valor: enCurso, detalle: "Empezadas y sin cerrar", href: "/atencion" },
        { titulo: "Resultados por recibir", valor: resultados, detalle: "Exámenes solicitados sin resultado", href: "/atencion#consultas" },
      ],
      acciones: ACCIONES.clinico,
    };
  }

  if (rol === "recepcion") {
    const [porLlegar, espera, pedidas] = await Promise.all([contar(citas("citado")), contar(citas("en_espera")), contar(solicitudes())]);
    return {
      titulo: "Recepción de hoy",
      tareas: [
        { titulo: "Por llegar", valor: porLlegar, detalle: "Citados para hoy", href: "/atencion" },
        { titulo: "En espera", valor: espera, detalle: "Ya llegaron", href: "/atencion", urgente: espera > 0 },
        { titulo: "Solicitudes del portal", valor: pedidas, detalle: "Por confirmar", href: "/atencion", urgente: pedidas > 0 },
      ],
      acciones: ACCIONES.recepcion,
    };
  }

  if (rol === "coordinador_sst") {
    const [eventos, pedidas] = await Promise.all([
      contar(supabase.from("eventos").select("id", { count: "exact", head: true }).neq("estado", "cerrado")),
      contar(solicitudes()),
    ]);
    return {
      titulo: "Seguridad y salud",
      tareas: [
        { titulo: "Eventos abiertos", valor: eventos, detalle: "Accidentes e incidentes sin cerrar", href: "/accidentes", urgente: eventos > 0 },
        { titulo: "Solicitudes del portal", valor: pedidas, detalle: "Citas por confirmar", href: "/atencion" },
      ],
      acciones: ACCIONES.sst,
    };
  }

  // Administración, auditoría y demás roles internos: cobros y operación general
  const [porCobrar, pedidas] = await Promise.all([
    contar(supabase.from("cobros").select("id", { count: "exact", head: true }).eq("estado", "emitida")),
    contar(solicitudes()),
  ]);
  return {
    titulo: "Operación",
    tareas: [
      { titulo: "Notas por cobrar", valor: porCobrar, detalle: "Emitidas sin pagar", href: "/facturacion", urgente: porCobrar > 0 },
      { titulo: "Solicitudes del portal", valor: pedidas, detalle: "Citas por confirmar", href: "/atencion" },
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
