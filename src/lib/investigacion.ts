import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { Evento } from "@/lib/eventos-tipos";
import type { ClaveSeccion, Investigacion } from "@/lib/investigacion-tipos";
import { listaParaclinicos } from "@/lib/paraclinicos";
import { claveRiesgo, GRUPOS, nivelRiesgo, type Valoracion } from "@/lib/puestos-tipos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas, sumarMeses } from "@/lib/fecha";

const fecha = (v: string | null | undefined) => (v ? new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeZone: "UTC" }).format(new Date(v.slice(0, 10))) : "—");
const POR_COMPLETAR = "[por completar]";

export async function obtenerInvestigacion(evento: Pick<Evento, "id" | "trabajadorId">): Promise<Investigacion | null> {
  if (!supabaseConfigurado || !evento.trabajadorId) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("investigaciones").select("*").eq("evento_id", evento.id).maybeSingle();
  if (!data) return { id: null, eventoId: evento.id, trabajadorId: evento.trabajadorId, secciones: {}, participantes: [], estado: "borrador", terminadoEn: null };
  return {
    id: data.id,
    eventoId: data.evento_id,
    trabajadorId: data.trabajador_id,
    secciones: data.secciones ?? {},
    participantes: data.participantes ?? [],
    estado: data.estado,
    terminadoEn: data.terminado_en,
  };
}

type Puesto = { nombre: string; turno: string | null; tareas: string | null; herramientas: string | null; riesgos: Record<string, string[]> | null; evaluacion: Record<string, Valoracion> | null; epp: string | null; recomendaciones: string | null; evaluado_en: string | null };
type Consulta = { id: string; fecha: string; conclusiones: string | null; enfermedad_actual: string | null; paraclinicos: { nombre: string; resultado: string }[] | null; motivo: { nombre: string } | null; diagnosticos: { cie10: string; descripcion: string }[] | null };

// Texto propuesto para cada parte del informe con lo que ya está en la app; el médico lo revisa y completa.
export async function sugerenciasInvestigacion(e: Evento): Promise<Partial<Record<ClaveSeccion, string>>> {
  if (!supabaseConfigurado || !e.trabajadorId) return {};
  const supabase = await crearClienteServidor();
  const hace3 = sumarMeses(e.fechaDiagnostico ?? hoyCaracas(e.fechaHora), -36);
  const hace1 = sumarMeses(e.fechaDiagnostico ?? hoyCaracas(e.fechaHora), -12);
  const grupoCie = e.cie10.trim().slice(0, 3).toUpperCase();

  const [{ data: t }, { data: emp }, { data: empleos }, { data: consultas }, { data: reposos }, { data: morb }] = await Promise.all([
    supabase.from("trabajadores")
      .select("nombres, apellidos, cedula, fecha_nacimiento, sexo, direccion, lateralidad, fecha_ingreso, fecha_egreso, estado, turno, puesto_id, dependencias(nombre), puestos(nombre, turno, tareas, herramientas, riesgos, evaluacion, epp, recomendaciones, evaluado_en)")
      .eq("id", e.trabajadorId).single(),
    supabase.from("empresas").select("servicio_sst_tipo, servicio_sst_fecha_registro, psst_fecha_registro").eq("id", e.empresaId).single(),
    supabase.from("historia_laboral").select("empresa, cargo, duracion, riesgos, epp").eq("trabajador_id", e.trabajadorId).order("creado_en"),
    supabase.from("consultas")
      .select("id, fecha, conclusiones, enfermedad_actual, paraclinicos, motivo:lista_items(nombre), diagnosticos(cie10, descripcion)")
      .eq("trabajador_id", e.trabajadorId).order("fecha").limit(60),
    supabase.from("reposos").select("causa, desde, hasta, dias, cie10").eq("trabajador_id", e.trabajadorId).gte("desde", hace3).order("desde"),
    // Morbilidad específica en la empresa (mismo grupo CIE-10) de los 3 años previos
    grupoCie
      ? supabase.from("diagnosticos").select("cie10, consultas!inner(trabajador_id, empresa_id, fecha, puesto_id)")
          .ilike("cie10", `${grupoCie}%`).eq("consultas.empresa_id", e.empresaId).gte("consultas.fecha", hace3).limit(2000)
      : Promise.resolve({ data: [] }),
  ]);

  const tr = t as unknown as {
    nombres: string; apellidos: string; cedula: string; fecha_nacimiento: string | null; sexo: string | null; direccion: string | null;
    lateralidad: string | null; fecha_ingreso: string | null; fecha_egreso: string | null; estado: string; turno: string | null; puesto_id: string | null;
    dependencias: { nombre: string } | null; puestos: Puesto | null;
  } | null;
  if (!tr) return {};
  const p = tr.puestos;
  const cs = (consultas ?? []) as unknown as Consulta[];
  const diag = [e.cie10, e.diagnostico].filter(Boolean).join(" ");

  const trabajador = [
    `Nombre: ${tr.nombres} ${tr.apellidos}. C.I.: ${tr.cedula}. Fecha de nacimiento: ${fecha(tr.fecha_nacimiento)}. Sexo: ${tr.sexo ?? "—"}.`,
    `Estado civil: ${POR_COMPLETAR}. Grupo étnico: ${POR_COMPLETAR}. Mano dominante: ${tr.lateralidad ?? POR_COMPLETAR}.`,
    `Dirección: ${tr.direccion ?? POR_COMPLETAR}.`,
    `Fecha de ingreso: ${fecha(tr.fecha_ingreso)}${tr.fecha_egreso ? `. Fecha de egreso: ${fecha(tr.fecha_egreso)}` : ""}. Condición actual: ${tr.estado}.`,
    "",
    `Horas extras, vacaciones disfrutadas y exámenes del último año (2.1.2): ${POR_COMPLETAR}.`,
    ...(cs.filter((c) => c.fecha >= hace1).length ? [`Evaluaciones médicas desde el ${fecha(hace1)}: ${cs.filter((c) => c.fecha >= hace1).map((c) => `${fecha(c.fecha)} ${c.motivo?.nombre ?? "consulta"}`).join("; ")}.`] : []),
    `Información escrita sobre los riesgos y formación en prevención y uso de EPP (2.1.3 y 2.1.4): ${POR_COMPLETAR}.`,
    "",
    "Antecedentes laborales (2.1.5):",
    ...((empleos ?? []).length ? (empleos ?? []).map((x) => `- ${x.empresa}${x.cargo ? `, ${x.cargo}` : ""}${x.duracion ? ` (${x.duracion})` : ""}`) : [`- ${POR_COMPLETAR}`]),
    "",
    `Cargo actual (2.1.6): ${p?.nombre ?? POR_COMPLETAR}${tr.dependencias ? `, ${tr.dependencias.nombre}` : ""}${tr.turno || p?.turno ? `, turno ${tr.turno || p?.turno}` : ""}.`,
    ...(p?.tareas ? [`Tareas: ${p.tareas}`] : []),
  ].join("\n");

  const gestion = [
    `Servicio de Seguridad y Salud en el Trabajo: ${emp?.servicio_sst_tipo ?? POR_COMPLETAR}${emp?.servicio_sst_fecha_registro ? `, registrado el ${fecha(emp.servicio_sst_fecha_registro)}` : ""}. Integrantes, horarios y funciones: ${POR_COMPLETAR}.`,
    `Programa de Seguridad y Salud en el Trabajo: ${emp?.psst_fecha_registro ? `registrado el ${fecha(emp.psst_fecha_registro)}` : POR_COMPLETAR}.`,
    `Comité de Seguridad y Salud Laboral (constitución, demandas de los delegados y acciones sobre el puesto): ${POR_COMPLETAR}.`,
    `Inscripción en el IVSS: ${POR_COMPLETAR}.`,
  ].join("\n");

  const riesgos = p ? GRUPOS.flatMap(([g, nombre]) => (p.riesgos?.[g] ?? []).map((a) => {
    const n = nivelRiesgo(p.evaluacion?.[claveRiesgo(g, a)]);
    const ctrl = p.evaluacion?.[claveRiesgo(g, a)]?.control;
    return `- ${nombre}: ${a}${n ? ` (riesgo ${n.texto.toLowerCase()}, ${n.n})` : ""}${ctrl ? `. Control: ${ctrl}` : ""}`;
  })) : [];
  const higienico = [
    `Puesto: ${p?.nombre ?? POR_COMPLETAR}${p?.evaluado_en ? ` (evaluado el ${fecha(p.evaluado_en)})` : ""}.`,
    `Tiempo de exposición (jornada diaria y semanal, horas extras, permisos y reposos): desde el ${fecha(tr.fecha_ingreso)}; ${POR_COMPLETAR}.`,
    ...(p?.herramientas ? [`Medios de trabajo: ${p.herramientas}`] : []),
    "Procesos peligrosos identificados:",
    ...(riesgos.length ? riesgos : [`- ${POR_COMPLETAR}`]),
    `Monitoreos y evaluaciones del ambiente con sus valores de referencia: ${POR_COMPLETAR}.`,
    `Agente etiológico: ${POR_COMPLETAR}.`,
    `Controles en la fuente, en el medio y administrativos: ${POR_COMPLETAR}.`,
    `Equipos de protección personal: ${p?.epp || POR_COMPLETAR}.`,
    ...(p?.recomendaciones ? [`Recomendaciones de la evaluación del puesto: ${p.recomendaciones}`] : []),
  ].join("\n");

  const filas = (morb ?? []) as unknown as { cie10: string; consultas: { trabajador_id: string; puesto_id: string | null } }[];
  const personas = new Set(filas.map((f) => f.consultas.trabajador_id)).size;
  const enPuesto = tr.puesto_id ? new Set(filas.filter((f) => f.consultas.puesto_id === tr.puesto_id).map((f) => f.consultas.trabajador_id)).size : 0;
  const porCausa = new Map<string, number>();
  for (const r of reposos ?? []) porCausa.set(r.causa, (porCausa.get(r.causa) ?? 0) + (r.dias ?? 0));
  const epidemiologico = [
    grupoCie
      ? `Morbilidad específica (${grupoCie}) en la empresa desde el ${fecha(hace3)}: ${filas.length} diagnósticos en ${personas} trabajadores${tr.puesto_id ? `; ${enPuesto} en el mismo puesto` : ""}.`
      : `Morbilidad específica: ${POR_COMPLETAR}.`,
    `Evaluaciones o estudios anteriores de los puestos: ${p?.evaluado_en ? `evaluación del puesto del ${fecha(p.evaluado_en)}` : POR_COMPLETAR}.`,
    `Reposos del trabajador desde el ${fecha(hace3)}: ${(reposos ?? []).length ? [...porCausa].map(([c, d]) => `${c.replace(/_/g, " ")} ${d} días`).join("; ") : "ninguno registrado"}.`,
    `Encuestas o entrevistas anónimas (solo musculoesqueléticas sin morbilidad registrada): ${POR_COMPLETAR}.`,
  ].join("\n");

  const clinico = [
    `Diagnóstico: ${diag || POR_COMPLETAR}${e.fechaDiagnostico ? `, del ${fecha(e.fechaDiagnostico)}` : ""}.`,
    "Evaluaciones médicas en el Servicio:",
    ...(cs.length
      ? cs.map((c) => `- ${fecha(c.fecha)} ${c.motivo?.nombre ?? "Consulta"}${c.diagnosticos?.length ? `: ${c.diagnosticos.map((d) => `${d.cie10} ${d.descripcion}`).join(", ")}` : ""}${c.conclusiones ? `. ${c.conclusiones}` : ""}`)
      : [`- ${POR_COMPLETAR}`]),
    `Signos, síntomas y antecedentes personales: ${POR_COMPLETAR}.`,
  ].join("\n");

  const paras = cs.flatMap((c) => listaParaclinicos(c.paraclinicos).filter((x) => x.resultado?.trim()).map((x) => `- ${fecha(c.fecha)} ${x.nombre}: ${x.resultado}`));
  const paraclinico = paras.length ? paras.join("\n") : `- ${POR_COMPLETAR}`;

  return {
    trabajador,
    gestion,
    higienico,
    epidemiologico,
    clinico,
    paraclinico,
    metodologia: "Análisis de la actividad de trabajo (tareas, actividades y operaciones durante el tiempo de exposición), revisión de la historia médica ocupacional y de la evaluación del puesto, revisión de la morbilidad y los reposos registrados por el Servicio de SST, y entrevista al trabajador y a compañeros del mismo puesto, con participación de los delegados de prevención (NT-02-2008, cap. II, 1.2 y 1.3).",
    conclusiones: `${diag || "La enfermedad"} ${e.enAnexo1 ? "figura en la lista de enfermedades ocupacionales del Anexo 1 de la NT-02-2008" : "no figura en el Anexo 1 de la NT-02-2008"}. Relación entre los procesos peligrosos del puesto y la patología: ${POR_COMPLETAR}.`,
    // Las acciones correctivas del evento se imprimen aparte, con responsable y fecha
    propuestas: [
      `Medidas para el trabajador afectado (reubicación, restricciones, seguimiento): ${POR_COMPLETAR}.`,
      `Medidas en el puesto y para los demás trabajadores expuestos: ${p?.recomendaciones || POR_COMPLETAR}.`,
    ].join("\n"),
  };
}
