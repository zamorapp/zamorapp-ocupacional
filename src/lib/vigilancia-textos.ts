// Textos sugeridos del informe trimestral de vigilancia epidemiológica. El médico los revisa y edita
// antes de imprimir; aquí solo se redacta un borrador a partir de los indicadores del período.
import { ETIQUETA_ORIGEN, type Origen } from "@/lib/consultas-tipos";
import { GRUPOS, type GrupoRiesgo } from "@/lib/puestos-tipos";
import type { Reporte } from "@/lib/reportes";

// Cortes de las "diez primeras causas" y nombres de sus claves
export const CORTES: [string, string][] = [
  ["tipo", "Tipo de consulta"],
  ["origen", "Origen"],
  ["sexo", "Sexo"],
  ["edad", "Grupo etario"],
  ["actividad", "Actividad"],
  ["sistema", "Aparato o sistema"],
  ["motivo", "Motivo de consulta"],
  ["dependencia", "Dependencia"],
];

export const ETIQUETA_CLAVE: Record<string, string> = {
  primera: "De primera", sucesiva: "Sucesiva", derivada: "Derivada",
  comun: "Enfermedad común", ocupacional: "Enfermedad ocupacional", accidente_comun: "Accidente común", accidente_laboral: "Accidente laboral",
  F: "Femenino", M: "Masculino", preventiva: "Preventiva", no_preventiva: "No preventiva",
};

export type DatosTexto = {
  r: Reporte;
  pct: number;                         // % de ausentismo
  accidentes: number;                  // accidentes de trabajo del período
  conTiempoPerdido: number;
  enfermedades: number;                // enfermedades ocupacionales declaradas en el período
  riesgos: Record<string, string[]>;   // agentes marcados en los puestos de la empresa
  causas: Record<string, string>;      // código → nombre de la causa de reposo
  aptitudes: Record<string, string>;   // código → nombre de la clasificación de aptitud
};

export type TextosInforme = { resumen: string; conclusiones: string; recomendaciones_medicas: string; recomendaciones: string; factores_riesgo: string; medidas_control: string };

const num = (n: number) => n.toLocaleString("es-VE");
const pct = (n: number, total: number) => (total ? `${num(Math.round((n * 1000) / total) / 10)} %` : "0 %");
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function resumenSugerido({ r, pct: a, causas }: DatosTexto) {
  const f: string[] = [];
  f.push(`Se atendieron ${r.consultas.total} consultas a ${r.consultas.pacientes} trabajadores (${r.consultas.preventivas} preventivas y ${r.consultas.no_preventivas} no preventivas), de una población de ${r.poblacion.total} trabajadores efectivos.`);
  const c = r.morbilidad.primeras_causas[0];
  f.push(c ? `La primera causa de morbilidad fue ${c.descripcion.toLowerCase()} (${c.cie10}) con ${c.n} ${c.n === 1 ? "caso" : "casos"}.` : "No se registraron diagnósticos de morbilidad en el período.");
  const ocup = (r.morbilidad.por_origen.ocupacional ?? 0) + (r.morbilidad.por_origen.accidente_laboral ?? 0);
  f.push(ocup ? `Se registraron ${ocup} diagnósticos de presunto origen ocupacional que requieren seguimiento.` : "Sin diagnósticos de origen ocupacional.");
  if (r.ausentismo.reposos) {
    const p = r.ausentismo.por_causa[0];
    f.push(`Ausentismo de ${num(a)} % (${r.ausentismo.dias_perdidos} días en ${r.ausentismo.reposos} reposos), ${a < 2.5 ? "dentro" : "por encima"} de la meta de 2,5 %.` + (p ? ` Principal causa: ${(causas[p.nombre] ?? p.nombre).toLowerCase()}.` : ""));
  } else {
    f.push("Sin reposos médicos en el período.");
  }
  return f.map((x) => `• ${x}`).join("\n");
}

export function conclusionesSugeridas({ r, pct: a, accidentes, conTiempoPerdido, enfermedades, aptitudes }: DatosTexto) {
  const p: string[] = [];
  const pob = r.poblacion.total;
  p.push(`1. Cobertura: el servicio médico evaluó a ${r.consultas.pacientes} de ${pob} trabajadores efectivos (${pct(r.consultas.pacientes, pob)} de la población). ${r.consultas.preventivas >= r.consultas.no_preventivas ? "Predominó la actividad preventiva" : "Predominó la consulta asistencial (no preventiva)"} con ${r.consultas.preventivas} evaluaciones preventivas y ${r.consultas.no_preventivas} no preventivas.`);
  const sist = r.morbilidad.por_sistema.slice(0, 3);
  if (r.morbilidad.total) {
    p.push(`2. Morbilidad: se registraron ${r.morbilidad.total} diagnósticos en ${r.morbilidad.pacientes ?? "—"} trabajadores (prevalencia de ${pct(r.morbilidad.pacientes ?? 0, pob)}). Los aparatos y sistemas más afectados fueron ${sist.map((s) => `${s.nombre.toLowerCase()} (${pct(s.n, r.morbilidad.total)})`).join(", ")}.` +
      (r.morbilidad.primeras_causas[0] ? ` La primera causa fue ${r.morbilidad.primeras_causas[0].descripcion.toLowerCase()} (${r.morbilidad.primeras_causas[0].cie10}).` : ""));
    const origenes = Object.entries(r.morbilidad.por_origen).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${(ETIQUETA_ORIGEN[k as Origen] ?? k).toLowerCase()} ${pct(n, r.morbilidad.total)}`);
    p.push(`3. Origen: ${origenes.join(", ")}. ${(r.morbilidad.por_origen.ocupacional ?? 0) > 0 ? "Los casos de presunto origen ocupacional deben investigarse y, si se confirman, declararse ante el INPSASEL (NT-02-2008)." : "No hubo morbilidad atribuible al trabajo en el período."}`);
  } else {
    p.push("2. Morbilidad: no se registraron diagnósticos en el período; la población evaluada se encontró clínicamente sana.");
  }
  p.push(`${r.morbilidad.total ? 4 : 3}. Ausentismo: ${r.ausentismo.reposos ? `${r.ausentismo.dias_perdidos} días perdidos en ${r.ausentismo.reposos} reposos; el porcentaje de ausentismo fue ${num(a)} %, ${a < 2.5 ? "dentro de la meta internacional (< 2,5 %)" : "por encima de la meta internacional de 2,5 %, lo que exige un plan de control"}.` : "no hubo reposos médicos en el período."}`);
  const n = r.morbilidad.total ? 5 : 4;
  p.push(`${n}. Accidentalidad: ${accidentes ? `${accidentes} accidentes de trabajo (${conTiempoPerdido} con tiempo perdido).` : "sin accidentes de trabajo registrados."} ${enfermedades ? `${enfermedades} enfermedades ocupacionales declaradas.` : "Sin enfermedades ocupacionales declaradas."}`);
  const apt = Object.entries(r.aptitud);
  if (apt.length) {
    const total = apt.reduce((s, [, x]) => s + x, 0);
    p.push(`${n + 1}. Aptitud: de ${total} evaluaciones con aptitud emitida, ${apt.map(([k, x]) => `${(aptitudes[k] ?? k).toLowerCase()} ${x}`).join(", ")}.`);
  }
  p.push(`${n + (apt.length ? 2 : 1)}. Desde el punto de vista médico y ocupacional, ${a >= 2.5 || accidentes || (r.morbilidad.por_origen.ocupacional ?? 0) ? "se identifican condiciones que requieren intervención prioritaria según las recomendaciones de este informe." : "la población se mantiene en condiciones de salud compatibles con su actividad laboral; se recomienda sostener las medidas preventivas vigentes."}`);
  return p.join("\n");
}

// Según el aparato o sistema afectado (palabra clave sin tildes): [médico-ocupacional, seguridad y salud en el trabajo]
const POR_SISTEMA: [RegExp, string, string][] = [
  [/osteo|muscul|locomot|columna/, "Vigilancia médica musculoesquelética: evaluación osteomuscular dirigida en los periódicos, seguimiento de lumbalgias y cervicalgias recurrentes y referencia oportuna a fisiatría.", "Evaluación ergonómica de los puestos, ayudas mecánicas para cargas, ajuste del mobiliario, pausas activas y capacitación en levantamiento y manejo de cargas."],
  [/respirat/, "Vigilancia respiratoria: espirometría en los expuestos a polvos o vapores, control de infecciones respiratorias recurrentes y vacunación contra la influenza.", "Control de agentes respiratorios en la fuente (ventilación y extracción) y protección respiratoria certificada según el agente."],
  [/auditiv|orl|oido/, "Programa de conservación auditiva: audiometría de base y anual a los expuestos, con referencia a otorrinolaringología ante cambios del umbral.", "Medición de ruido, aislamiento de las fuentes y protección auditiva obligatoria en áreas sobre 85 dB(A)."],
  [/oftalm|visual|ojo/, "Evaluación de agudeza visual en los periódicos y referencia a oftalmología de los casos alterados.", "Lentes de seguridad según el riesgo, iluminación adecuada y pausas visuales en trabajo con pantallas."],
  [/dermat|piel/, "Seguimiento de dermatosis y pruebas de contacto en los casos recurrentes vinculados a productos del trabajo.", "Guantes adecuados al producto, hojas de seguridad (HDS) disponibles y cremas barrera."],
  [/cardio|circulat|metabol|endocr/, "Programa de riesgo cardiometabólico: control de tensión arterial, glicemia, lípidos y peso; consejería en alimentación y actividad física.", "Menú saludable en el comedor y facilidades para la actividad física; atención a la carga de turnos nocturnos."],
  [/gastro|digest/, "Seguimiento de enfermedades digestivas y educación en higiene de alimentos.", "Inspección del comedor, agua potable garantizada y facilidades para el lavado de manos."],
  [/mental|psiq|neurol|sueno/, "Tamizaje de estrés y trastornos del sueño en los periódicos y apoyo psicológico a quien lo requiera.", "Evaluación de riesgos psicosociales: organización del trabajo, turnos, cargas y canales de comunicación."],
  [/infecc|hemat|inmun/, "Esquema de vacunación al día (tétanos, hepatitis B, influenza) y control de enfermedades infecciosas.", "Saneamiento ambiental, manejo de desechos y control de vectores."],
  [/genitour|excret|renal/, "Control de infecciones urinarias recurrentes y examen de orina en los periódicos.", "Hidratación y acceso a sanitarios durante la jornada, sobre todo en trabajo con calor."],
];
const porSistema = (r: Reporte, i: 1 | 2) => {
  const l: string[] = [];
  for (const s of r.morbilidad.por_sistema.slice(0, 4)) {
    const hit = POR_SISTEMA.find(([re]) => re.test(sinTildes(s.nombre)));
    if (hit && !l.includes(hit[i])) l.push(hit[i]);
  }
  return l;
};
const numerada = (l: string[]) => l.map((x, i) => `${i + 1}. ${x}`).join("\n");

// Lo que hace el servicio médico: vigilancia, evaluaciones, casos, reintegros
export function recomendacionesMedicasSugeridas({ r, pct: a, enfermedades }: DatosTexto) {
  const lista = porSistema(r, 1);
  if ((r.morbilidad.por_origen.ocupacional ?? 0) > 0 || enfermedades) lista.push("Estudiar los casos de presunto origen ocupacional, declararlos ante el INPSASEL en los plazos de la NT-02-2008 y mantenerlos en vigilancia médica.");
  if (r.consultas.pacientes < r.poblacion.total) lista.push(`Completar las evaluaciones periódicas pendientes (${r.poblacion.total - r.consultas.pacientes} trabajadores sin evaluar en el período).`);
  if (a >= 2.5) lista.push("Seguimiento médico del ausentismo: control de reposos prolongados, conformación de reposos externos y evaluación postreposo antes del reintegro.");
  if ((r.aptitud.elegible_con_restricciones ?? 0) > 0) lista.push("Vigilar el cumplimiento de las restricciones médicas emitidas y reevaluar a los trabajadores con restricción temporal al vencer su plazo.");
  if (r.consultas.no_preventivas > r.consultas.preventivas) lista.push("Reforzar la actividad preventiva: predominó la consulta asistencial sobre las evaluaciones y controles.");
  lista.push("Mantener la educación para la salud según las primeras causas de morbilidad del período.");
  return numerada(lista);
}

// Lo que hace la empresa con su Servicio de SST y el Comité: controles, EPP, investigación, seguimiento
export function recomendacionesSugeridas({ r, pct: a, accidentes }: DatosTexto) {
  const lista = porSistema(r, 2);
  if (accidentes) lista.push("Investigar cada accidente (causas inmediatas y básicas), declararlo en 24 horas y cerrar las acciones correctivas con su responsable y fecha.");
  if (a >= 2.5) lista.push("Plan de control del ausentismo con RR. HH.: identificar las áreas con más días perdidos y sus condiciones de trabajo.");
  if ((r.aptitud.elegible_con_restricciones ?? 0) > 0) lista.push("Adecuar los puestos o reubicar a los trabajadores con restricciones médicas.");
  lista.push("Mantener la dotación y el uso supervisado de los equipos de protección personal según el riesgo de cada puesto.");
  lista.push("Presentar este informe al Comité de Seguridad y Salud Laboral y hacer seguimiento a las recomendaciones en el próximo trimestre.");
  return numerada(lista);
}

const EFECTOS: Record<GrupoRiesgo, string> = {
  fisico: "hipoacusia, estrés térmico, lesiones por vibración o radiación",
  quimico: "dermatitis, irritación de vías respiratorias, intoxicaciones",
  biologico: "enfermedades infecciosas y parasitarias",
  mecanico: "traumatismos, heridas, fracturas y atrapamientos",
  disergonomico: "trastornos musculoesqueléticos (lumbalgia, cervicalgia, tendinitis)",
  psicosocial: "estrés laboral, trastornos del sueño y del ánimo",
};

const MEDIDAS: Record<GrupoRiesgo, [string, string, string]> = {
  fisico: ["Aislar o encerrar las fuentes de ruido y calor; mantenimiento preventivo de equipos.", "Ventilación e hidratación; señalización de áreas de ruido.", "Protección auditiva; audiometrías; pausas de recuperación térmica."],
  quimico: ["Sustituir productos peligrosos; sistemas cerrados.", "Extracción localizada y ventilación; almacenamiento seguro con HDS.", "Guantes, mascarillas y lentes adecuados; capacitación en manejo de sustancias."],
  biologico: ["Control de fuentes de contaminación y desechos.", "Limpieza y desinfección; control de vectores.", "Vacunación; lavado de manos; EPP biológico."],
  mecanico: ["Resguardos en máquinas; bloqueo y etiquetado.", "Orden y limpieza; demarcación de áreas y pasillos.", "Calzado y guantes de seguridad; permisos de trabajo."],
  disergonomico: ["Rediseño de tareas y ayudas mecánicas para cargas.", "Mobiliario y alturas de trabajo ajustables.", "Pausas activas; capacitación en posturas y levantamiento."],
  psicosocial: ["Organización del trabajo, cargas y turnos razonables.", "Clima laboral; canales de comunicación.", "Programas de manejo del estrés y apoyo psicológico."],
};

const gruposMarcados = (riesgos: Record<string, string[]>) => GRUPOS.filter(([g]) => (riesgos[g] ?? []).length > 0);

export function factoresSugeridos({ riesgos }: DatosTexto) {
  const marcados = gruposMarcados(riesgos);
  if (!marcados.length) {
    return "Describe aquí los factores de riesgo y procesos peligrosos de la empresa (o márcalos en Empresas › Puestos para que se sugieran solos) y sus principales efectos en la salud.";
  }
  return marcados.map(([g, nombre]) => `• ${nombre}: ${riesgos[g].join(", ")}. Efectos principales: ${EFECTOS[g]}.`).join("\n");
}

export function medidasSugeridas({ riesgos }: DatosTexto) {
  const marcados = gruposMarcados(riesgos);
  const grupos = marcados.length ? marcados : GRUPOS.filter(([g]) => g === "disergonomico" || g === "mecanico");
  const col = (i: 0 | 1 | 2) => grupos.map(([g, n]) => `  – ${n}: ${MEDIDAS[g][i]}`).join("\n");
  return `En la fuente:\n${col(0)}\nEn el ambiente:\n${col(1)}\nEn los trabajadores y las trabajadoras:\n${col(2)}`;
}

export function textosSugeridos(d: DatosTexto): TextosInforme {
  return {
    resumen: resumenSugerido(d),
    conclusiones: conclusionesSugeridas(d),
    recomendaciones_medicas: recomendacionesMedicasSugeridas(d),
    recomendaciones: recomendacionesSugeridas(d),
    factores_riesgo: factoresSugeridos(d),
    medidas_control: medidasSugeridas(d),
  };
}
