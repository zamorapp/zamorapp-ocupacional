import "server-only";
import { cache } from "react";
import { supabaseConfigurado } from "@/lib/config";
import { AGENDA_DEMO, ALERTAS_DEMO, APTITUD_DEMO, type Estado, INDICADORES_DEMO } from "@/lib/demo";
import { datosLegalesFaltantes, listarEmpresas } from "@/lib/empresas";
import { listarCitas } from "@/lib/citas";
import { hoyCaracas, sumarMeses } from "@/lib/fecha";
import { listarEventos } from "@/lib/eventos";
import { plazoDeclaracion, plazoInformeNt02, plazoInvestigacion } from "@/lib/eventos-tipos";
import { empresaActivaId } from "@/lib/empresa-activa";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerSesion, type Sesion } from "@/lib/sesion";
import { conVencimientos, enfoqueDelRol, soloMias, type Enfoque, type Tareas } from "@/lib/panel-rol";

// Conteos que calcula la base (función resumen_panel), sin traer a todos los trabajadores
type Resumen = {
  activos: number; en_reposo: number; al_dia: number; vencidos: number; por_vencer: number; sin_evaluar: number; aspirantes: number;
  aptitud: Record<"elegible" | "elegible_con_restricciones" | "no_elegible" | "espera_resultados" | "diferido", number>;
};
const RESUMEN_VACIO: Resumen = { activos: 0, en_reposo: 0, al_dia: 0, vencidos: 0, por_vencer: 0, sin_evaluar: 0, aspirantes: 0, aptitud: { elegible: 0, elegible_con_restricciones: 0, no_elegible: 0, espera_resultados: 0, diferido: 0 } };

// TODOS los conteos del Inicio en un solo viaje a la base (inicio_conteos). cache(): cada sección de la
// página lo pide por separado y se comparte la misma respuesta.
export const conteosInicio = cache(async (): Promise<{ resumen: Resumen; vencimientos: VencimientoEmpresa[]; tareas: Tareas } | null> => {
  if (!supabaseConfigurado) return null;
  const [sesion, activa, supabase] = await Promise.all([obtenerSesion(), empresaActivaId(), crearClienteServidor()]);
  const { data } = await supabase.rpc("inicio_conteos", { p_empresa: activa, p_solo_mias: soloMias(sesion), p_clinico: sesion.clinico });
  if (!data) return null;
  const d = data as { resumen: Resumen | null; vencimientos: VencimientoEmpresa[] | null; tareas: Tareas };
  return { resumen: d.resumen ?? RESUMEN_VACIO, vencimientos: d.vencimientos ?? [], tareas: d.tareas };
});

export type VencimientoEmpresa = { id: string; empresa: string; periodicidad_meses: number; activos: number; vencidos: number; por_vencer: number; sin_evaluar: number; al_dia: number; dias_aviso: number; proximo: string | null };
export type MesAccidentes = { mes: string; periodo: string; hht: number; metodo: string; accidentes: number; con_tiempo_perdido: number; dias_perdidos: number; dias_cargados: number; ifn: number | null; isev: number | null };
export type Accidentabilidad = { meses: MesAccidentes[]; desde: string; hasta: string };

// Últimos 12 meses (el actual incluido), todas las empresas juntas o la empresa activa; mismo cálculo que el reporte
export async function accidentabilidadInicio(): Promise<Accidentabilidad | null> {
  if (!supabaseConfigurado) return null;
  const empresa = await empresaActivaId();
  return accidentabilidad(empresa);
}
async function accidentabilidad(empresa: string | null): Promise<Accidentabilidad> {
  const hoy = hoyCaracas();
  const desde = sumarMeses(`${hoy.slice(0, 8)}01`, -11);
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("reporte_indicadores", { p_tipo: "accidentalidad", p_empresa: empresa, p_desde: desde, p_hasta: hoy, p_opciones: { nivel: "consolidado" } });
  return { meses: (data ?? []) as MesAccidentes[], desde, hasta: hoy };
}

export type Indicador = { titulo: string; valor: string; detalle: string; estado: Estado };
export type Alerta = { texto: string; sujeto: string; plazo: string; estado: Estado; href?: string };
export type FilaAptitud = (typeof APTITUD_DEMO)[number];

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Empresas con el aviso de vencimientos apagado (Configuración de la empresa) no avisan en Inicio; los reportes y
// el tablero de vencimientos siguen mostrándolas
async function vencimientosConAviso(venc: VencimientoEmpresa[]): Promise<VencimientoEmpresa[]> {
  const apagadas = new Set((await listarEmpresas()).filter((e) => e.avisosApagados.includes("vencimientos")).map((e) => e.id));
  return apagadas.size ? venc.filter((v) => !apagadas.has(v.id)) : venc;
}

// Pendientes del rol (con los exámenes por programar de RR. HH., SST y administración)
export async function tareasInicio(sesion: Sesion): Promise<Enfoque> {
  const c = await conteosInicio();
  const venc = await vencimientosConAviso(c?.vencimientos ?? []);
  const suma = (k: "vencidos" | "por_vencer") => venc.reduce((s, v) => s + v[k], 0);
  return conVencimientos(enfoqueDelRol(sesion, c?.tareas ?? null), sesion.rol, sesion.clinico, suma("vencidos"), suma("por_vencer"));
}

export async function indicadoresInicio(): Promise<Indicador[]> {
  if (!supabaseConfigurado) return INDICADORES_DEMO;
  const [c, empresas] = await Promise.all([conteosInicio(), listarEmpresas()]);
  const n = c?.resumen ?? RESUMEN_VACIO;
  const cobertura = n.activos ? Math.round((n.al_dia / n.activos) * 100) : 0;
  return [
    { titulo: "Trabajadores activos", valor: String(n.activos), detalle: plural(empresas.length, "empresa cliente", "empresas clientes"), estado: "ok" },
    { titulo: "Exámenes periódicos al día", valor: n.activos ? `${cobertura} %` : "—", detalle: "Meta 95 %", estado: cobertura >= 95 ? "ok" : cobertura >= 80 ? "aviso" : "alerta" },
    { titulo: "Sin evaluación médica", valor: String(n.sin_evaluar), detalle: "Sin aptitud registrada", estado: n.sin_evaluar ? "aviso" : "ok" },
    { titulo: "En reposo", valor: String(n.en_reposo), detalle: "Trabajadores ausentes hoy", estado: n.en_reposo ? "aviso" : "ok" },
  ];
}

export async function alertasInicio(): Promise<Alerta[]> {
  if (!supabaseConfigurado) return ALERTAS_DEMO;
  const [c, empresas, eventos] = await Promise.all([conteosInicio(), listarEmpresas(), listarEventos({ abiertos: true })]);
  const venc = await vencimientosConAviso(c?.vencimientos ?? []);
  const solicitudes = c?.tareas.solicitadas ?? 0;
  const alertas: Alerta[] = [];
  if (solicitudes) {
    alertas.push({ texto: "Solicitudes de cita de empresas", sujeto: `${solicitudes} por confirmar`, plazo: "Responder", estado: "aviso", href: "/atencion" });
  }
  // Plazos legales de accidentes y enfermedades: primero, porque vencen en horas
  for (const ev of eventos) {
    for (const p of [plazoDeclaracion(ev), plazoInformeNt02(ev), plazoInvestigacion(ev)]) {
      if (p && !p.cumplido) {
        const que = p.texto.split(" vence")[0].split(" vencida")[0];
        alertas.push({ texto: que.startsWith("Investigación") ? `${que} sin causas registradas` : `${que} ante el INPSASEL`, sujeto: `${ev.trabajador ?? "Evento"} · ${ev.empresa}`, plazo: p.texto, estado: p.estado, href: `/accidentes/${ev.id}` });
      }
    }
  }
  // Vencimientos por empresa: cada aviso abre el reporte de esa empresa, listo para programar las citas
  const MAX_EMPRESAS = 5;
  const conVencidos = venc.filter((v) => v.vencidos > 0);
  const conPorVencer = venc.filter((v) => v.por_vencer > 0);
  for (const v of conVencidos.slice(0, MAX_EMPRESAS)) {
    alertas.push({ texto: "Exámenes periódicos vencidos", sujeto: `${v.empresa}: ${plural(v.vencidos, "trabajador", "trabajadores")}`, plazo: "Programar citas", estado: "alerta", href: `/reportes/vencimientos?empresa=${v.id}` });
  }
  for (const v of conPorVencer.slice(0, MAX_EMPRESAS)) {
    alertas.push({ texto: `Exámenes que vencen en ${v.dias_aviso} días`, sujeto: `${v.empresa}: ${plural(v.por_vencer, "trabajador", "trabajadores")}`, plazo: "Programar", estado: "aviso", href: `/reportes/vencimientos?empresa=${v.id}` });
  }
  const resto = new Set([...conVencidos.slice(MAX_EMPRESAS), ...conPorVencer.slice(MAX_EMPRESAS)].map((v) => v.id)).size;
  if (resto) alertas.push({ texto: "Más empresas con exámenes vencidos o por vencer", sujeto: plural(resto, "empresa", "empresas"), plazo: "Ver todas", estado: "aviso", href: "/reportes/vencimientos" });
  const aspirantes = c?.resumen.aspirantes ?? 0;
  if (aspirantes) alertas.push({ texto: "Aspirantes esperando evaluación pre-empleo", sujeto: plural(aspirantes, "aspirante", "aspirantes"), plazo: "Pendiente", estado: "aviso", href: "/pacientes" });
  for (const e of empresas.filter((x) => !x.ignorarAlertaLegal)) {
    const faltan = datosLegalesFaltantes(e);
    if (faltan.length) alertas.push({ texto: "Datos legales incompletos", sujeto: `${e.razonSocial}: ${faltan.join(", ")}`, plazo: "Informe trimestral", estado: "aviso", href: "/empresas" });
  }
  return alertas;
}

export async function aptitudInicio(): Promise<FilaAptitud[]> {
  if (!supabaseConfigurado) return APTITUD_DEMO;
  const n = (await conteosInicio())?.resumen ?? RESUMEN_VACIO;
  const cuenta = (c: keyof Resumen["aptitud"]) => n.aptitud[c] ?? 0;
  return [
    { clase: "Elegible", cantidad: cuenta("elegible"), color: "bg-ok" },
    { clase: "Con restricciones", cantidad: cuenta("elegible_con_restricciones"), color: "bg-aviso" },
    { clase: "No elegible", cantidad: cuenta("no_elegible"), color: "bg-alerta" },
    { clase: "Espera resultados", cantidad: cuenta("espera_resultados"), color: "bg-primary/60" },
    { clase: "Diferido", cantidad: cuenta("diferido"), color: "bg-muted-foreground/40" },
  ];
}

export async function vencimientosInicio(): Promise<VencimientoEmpresa[]> {
  return (await conteosInicio())?.vencimientos ?? [];
}

const ESTADO_CITA: Record<string, string> = { citado: "Citado", en_espera: "En espera", en_consulta: "En consulta", atendido: "Atendido" };
export async function agendaInicio(): Promise<typeof AGENDA_DEMO> {
  if (!supabaseConfigurado) return AGENDA_DEMO;
  const citas = await listarCitas(hoyCaracas());
  return citas
    .filter((c) => ESTADO_CITA[c.estado])
    .map((c) => ({ hora: c.hora ?? "—", paciente: c.paciente, motivo: c.motivo ?? "Sin motivo", empresa: c.empresa, estado: ESTADO_CITA[c.estado] }));
}

// Sin empresas todavía: la guía de primeros pasos
export async function panelVacio(): Promise<boolean> {
  return supabaseConfigurado && (await listarEmpresas()).length === 0;
}
