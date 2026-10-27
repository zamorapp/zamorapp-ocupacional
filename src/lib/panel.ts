import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { AGENDA_DEMO, ALERTAS_DEMO, APTITUD_DEMO, type Estado, INDICADORES_DEMO } from "@/lib/demo";
import { datosLegalesFaltantes, listarEmpresas } from "@/lib/empresas";
import { hoyVE, listarCitas, listarSolicitudes } from "@/lib/citas";
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

export type DatosPanel = {
  indicadores: { titulo: string; valor: string; detalle: string; estado: Estado }[];
  alertas: { texto: string; sujeto: string; plazo: string; estado: Estado; href?: string }[];
  agenda: typeof AGENDA_DEMO;
  aptitud: typeof APTITUD_DEMO;
  vacio: boolean;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export async function datosPanel(): Promise<DatosPanel> {
  if (!supabaseConfigurado) {
    return { indicadores: INDICADORES_DEMO, alertas: ALERTAS_DEMO, agenda: AGENDA_DEMO, aptitud: APTITUD_DEMO, vacio: false };
  }

  const [empresas, r, eventos, citas, solicitudes] = await Promise.all([listarEmpresas(), resumen(), listarEventos({ abiertos: true }), listarCitas(hoyVE()), listarSolicitudes()]);
  const n = r ?? { activos: 0, en_reposo: 0, al_dia: 0, vencidos: 0, por_vencer: 0, sin_evaluar: 0, aspirantes: 0, aptitud: { elegible: 0, elegible_con_restricciones: 0, no_elegible: 0, espera_resultados: 0, diferido: 0 } };
  const activos = { length: n.activos };
  const enReposo = n.en_reposo;
  const vencidos = { length: n.vencidos };
  const porVencer = { length: n.por_vencer };
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
  if (vencidos.length) alertas.push({ texto: "Exámenes periódicos vencidos", sujeto: plural(vencidos.length, "trabajador", "trabajadores"), plazo: "Vencidos", estado: "alerta", href: "/pacientes" });
  if (porVencer.length) alertas.push({ texto: "Exámenes que vencen en 30 días", sujeto: plural(porVencer.length, "trabajador", "trabajadores"), plazo: "Programar", estado: "aviso", href: "/pacientes" });
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

  return { indicadores, alertas, agenda, aptitud, vacio: empresas.length === 0 };
}
