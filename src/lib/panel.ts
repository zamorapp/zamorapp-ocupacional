import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { AGENDA_DEMO, ALERTAS_DEMO, APTITUD_DEMO, type Estado, INDICADORES_DEMO } from "@/lib/demo";
import { datosLegalesFaltantes, listarEmpresas } from "@/lib/empresas";
import { listarCitas, listarSolicitudes } from "@/lib/citas";
import { hoyCaracas, sumarMeses } from "@/lib/fecha";
import { listarEventos } from "@/lib/eventos";
import { plazoDeclaracion, plazoInformeNt02, plazoInvestigacion } from "@/lib/eventos-tipos";
import { empresaActivaId } from "@/lib/empresa-activa";
import { crearClienteServidor } from "@/lib/supabase/server";

// Conteos que calcula la base (función resumen_panel), sin traer a todos los trabajadores
type Resumen = {
  activos: number; en_reposo: number; al_dia: number; vencidos: number; por_vencer: number; sin_evaluar: number; aspirantes: number;
  aptitud: Record<"elegible" | "elegible_con_restricciones" | "no_elegible" | "espera_resultados" | "diferido", number>;
};
async function resumen(): Promise<Resumen | null> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("resumen_panel", { p_empresa: await empresaActivaId() });
  return (data as Resumen | null) ?? null;
}

export type VencimientoEmpresa = { id: string; empresa: string; periodicidad_meses: number; activos: number; vencidos: number; por_vencer: number; sin_evaluar: number; al_dia: number; dias_aviso: number; proximo: string | null };
export type MesAccidentes = { mes: string; periodo: string; hht: number; metodo: string; accidentes: number; con_tiempo_perdido: number; dias_perdidos: number; dias_cargados: number; ifn: number | null; isev: number | null };
export type Accidentabilidad = { meses: MesAccidentes[]; desde: string; hasta: string };

// Vencidos, por vencer y sin evaluación de cada empresa (función vencimientos_empresas, con las reglas de acceso)
async function vencimientos(empresa: string | null): Promise<VencimientoEmpresa[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("vencimientos_empresas");
  const filas = (data ?? []) as VencimientoEmpresa[];
  return empresa ? filas.filter((f) => f.id === empresa) : filas;
}

// Últimos 12 meses (el actual incluido), todas las empresas juntas o la empresa activa; mismo cálculo que el reporte
async function accidentabilidad(empresa: string | null): Promise<Accidentabilidad> {
  const hoy = hoyCaracas();
  const desde = sumarMeses(`${hoy.slice(0, 8)}01`, -11);
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("reporte_indicadores", { p_tipo: "accidentalidad", p_empresa: empresa, p_desde: desde, p_hasta: hoy, p_opciones: { nivel: "consolidado" } });
  return { meses: (data ?? []) as MesAccidentes[], desde, hasta: hoy };
}

export type DatosPanel = {
  indicadores: { titulo: string; valor: string; detalle: string; estado: Estado }[];
  alertas: { texto: string; sujeto: string; plazo: string; estado: Estado; href?: string }[];
  agenda: typeof AGENDA_DEMO;
  aptitud: typeof APTITUD_DEMO;
  vencimientos: VencimientoEmpresa[];
  accidentes: Accidentabilidad | null;
  vacio: boolean;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// conAccidentes: el rol ve la accidentabilidad en el inicio (recepción no la necesita)
export async function datosPanel(conAccidentes = true): Promise<DatosPanel> {
  if (!supabaseConfigurado) {
    return { indicadores: INDICADORES_DEMO, alertas: ALERTAS_DEMO, agenda: AGENDA_DEMO, aptitud: APTITUD_DEMO, vencimientos: [], accidentes: null, vacio: false };
  }

  const activa = await empresaActivaId();
  const [empresas, r, eventos, citas, solicitudes, venc, accidentes] = await Promise.all([
    listarEmpresas(), resumen(), listarEventos({ abiertos: true }), listarCitas(hoyCaracas()), listarSolicitudes(),
    vencimientos(activa), conAccidentes ? accidentabilidad(activa) : Promise.resolve(null),
  ]);
  const n = r ?? { activos: 0, en_reposo: 0, al_dia: 0, vencidos: 0, por_vencer: 0, sin_evaluar: 0, aspirantes: 0, aptitud: { elegible: 0, elegible_con_restricciones: 0, no_elegible: 0, espera_resultados: 0, diferido: 0 } };
  const activos = { length: n.activos };
  const enReposo = n.en_reposo;
  const sinEvaluar = { length: n.sin_evaluar };
  const cobertura = n.activos ? Math.round((n.al_dia / n.activos) * 100) : 0;

  const indicadores: DatosPanel["indicadores"] = [
    { titulo: "Trabajadores activos", valor: String(activos.length), detalle: plural(empresas.length, "empresa cliente", "empresas clientes"), estado: "ok" },
    { titulo: "Exámenes periódicos al día", valor: activos.length ? `${cobertura} %` : "—", detalle: "Meta 95 %", estado: cobertura >= 95 ? "ok" : cobertura >= 80 ? "aviso" : "alerta" },
    { titulo: "Sin evaluación médica", valor: String(sinEvaluar.length), detalle: "Sin aptitud registrada", estado: sinEvaluar.length ? "aviso" : "ok" },
    { titulo: "En reposo", valor: String(enReposo), detalle: "Trabajadores ausentes hoy", estado: enReposo ? "aviso" : "ok" },
  ];

  const alertas: DatosPanel["alertas"] = [];
  if (solicitudes.length) {
    alertas.push({ texto: "Solicitudes de cita de empresas", sujeto: `${solicitudes.length} por confirmar`, plazo: "Responder", estado: "aviso", href: "/atencion" });
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
  const aspirantes = n.aspirantes;
  if (aspirantes) alertas.push({ texto: "Aspirantes esperando evaluación pre-empleo", sujeto: plural(aspirantes, "aspirante", "aspirantes"), plazo: "Pendiente", estado: "aviso", href: "/pacientes" });
  for (const e of empresas.filter((x) => !x.ignorarAlertaLegal)) {
    const faltan = datosLegalesFaltantes(e);
    if (faltan.length) alertas.push({ texto: "Datos legales incompletos", sujeto: `${e.razonSocial}: ${faltan.join(", ")}`, plazo: "Informe trimestral", estado: "aviso", href: "/empresas" });
  }

  const cuenta = (c: keyof Resumen["aptitud"]) => n.aptitud[c] ?? 0;
  const aptitud = [
    { clase: "Elegible", cantidad: cuenta("elegible"), color: "bg-ok" },
    { clase: "Con restricciones", cantidad: cuenta("elegible_con_restricciones"), color: "bg-aviso" },
    { clase: "No elegible", cantidad: cuenta("no_elegible"), color: "bg-alerta" },
    { clase: "Espera resultados", cantidad: cuenta("espera_resultados"), color: "bg-primary/60" },
    { clase: "Diferido", cantidad: cuenta("diferido"), color: "bg-muted-foreground/40" },
  ];

  const ESTADO_CITA: Record<string, string> = { citado: "Citado", en_espera: "En espera", en_consulta: "En consulta", atendido: "Atendido" };
  const agenda = citas
    .filter((c) => ESTADO_CITA[c.estado])
    .map((c) => ({ hora: c.hora ?? "—", paciente: c.paciente, motivo: c.motivo ?? "Sin motivo", empresa: c.empresa, estado: ESTADO_CITA[c.estado] }));

  return { indicadores, alertas, agenda, aptitud, vencimientos: venc, accidentes, vacio: empresas.length === 0 };
}
