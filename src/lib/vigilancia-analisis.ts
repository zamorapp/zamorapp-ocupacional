// Análisis del informe de vigilancia: un párrafo por cuadro y una conclusión final, redactados con los datos del período.
// La redacción cambia entre informes (empresa, período y variante eligen las frases), para que no parezcan plantillas.
// Puro: corre en el servidor (informe impreso) y en el navegador (botón «Otra redacción» del editor).

import type { Reporte } from "@/lib/reportes";
import { analisisAnexo, analisisCuadros, analisisIntegral, type Historico } from "@/lib/vigilancia-integral";
import { contraer, personas, dx, etq, humano, mayus, mesLargo, minus, n0, n1, n2, nombrable, p, pc, plural, sinRegistros, sinTildes, unir } from "@/lib/vigilancia-redaccion";

export type Series = {
  por_mes: { mes: string; consultas: number; preventivas: number; diagnosticos: number; dias_reposo: number }[];
  piramide: { grupo: string; F: number; M: number; n: number }[];
  capitulos: { nombre: string; n: number }[];
};

export type Comparacion = { etiqueta: string; s: Series } | null;

export type DatosAnalisis = {
  empresa: string | null;
  etiqueta: string;
  desde: string;
  hasta: string;
  r: Reporte;
  s: Series;
  anterior: Comparacion;
  anioAnterior: Comparacion;
  pct: number;
  pad: number;
  acc: { accidentes: number; conTiempoPerdido: number; diasPerdidos: number; ifn: number | null; is: number | null; aTiempo: number | null; porDeclarar: number; ifb?: number | null; hht?: number } | null;
  causas: Record<string, string>;
  aptitudes: Record<string, string>;
  /** Código → nombre del ente emisor de reposos */
  entes?: Record<string, string>;
  /** Totales de los períodos anteriores, del más viejo al más reciente (tendencia) */
  historial?: Historico[];
};

export const SECCIONES_ANALISIS = [
  ["poblacion", "Población"],
  ["uso", "Uso del servicio médico"],
  ["evaluaciones", "Evaluaciones ocupacionales por motivo"],
  ["dependencias", "Uso del servicio por dependencia"],
  ["morbilidad", "Morbilidad"],
  ["causas", "Primeras causas de morbilidad"],
  ["ausentismo", "Ausentismo"],
  ["reposos", "Reposos por causa, ente emisor y permisos"],
  ["accidentes", "Accidentes y enfermedades ocupacionales"],
  ["referencias", "Referencias"],
  ["aptitud", "Aptitud"],
  ["vigilancia_clinica", "Vigilancia clínica"],
  ["demografia", "Consultas por tipo de paciente, sexo y edad"],
  ["indices_ausentismo", "Índices de ausentismo"],
  ["causas_reposo", "Diez primeras causas de reposo"],
  ["indices_accidentes", "Índices de accidentalidad y enfermedad ocupacional"],
  ["externas", "Especialidades por consulta externa"],
  ["reubicaciones", "Reubicaciones"],
  ["art34", "Resumen del artículo 34"],
  ["anexo_tipo", "Anexo · causas por tipo de consulta"],
  ["anexo_origen", "Anexo · causas por origen"],
  ["anexo_sexo", "Anexo · causas por sexo"],
  ["anexo_edad", "Anexo · causas por grupo etario"],
  ["anexo_actividad", "Anexo · causas por actividad"],
  ["anexo_sistema", "Anexo · causas por aparato o sistema"],
  ["anexo_motivo", "Anexo · causas por motivo de consulta"],
  ["anexo_dependencia", "Anexo · causas por dependencia"],
  ["anexo_reposo_accidente_comun", "Anexo · reposos por accidente común"],
  ["anexo_reposo_accidente_laboral", "Anexo · reposos por accidente laboral"],
  ["anexo_reposo_enfermedad_comun", "Anexo · reposos por enfermedad común"],
  ["anexo_reposo_enfermedad_ocupacional", "Anexo · reposos por enfermedad ocupacional"],
  ["anexo_reposo_dependencia", "Anexo · reposos por dependencia"],
  ["tendencias", "Tendencia frente a períodos anteriores"],
  ["integral", "Comportamiento de conjunto"],
  ["prioridades", "Alertas y prioridades"],
  ["recomendaciones_empresa", "Recomendaciones para la empresa"],
  ["conclusion_final", "Conclusión final"],
] as const;
// Las del análisis integral van juntas al final del informe (y en su propio bloque del editor)
export const SECCIONES_INTEGRAL: readonly string[] = ["tendencias", "integral", "prioridades", "recomendaciones_empresa", "conclusion_final"];
export type SeccionAnalisis = (typeof SECCIONES_ANALISIS)[number][0];

export type Analisis = { secciones: Record<SeccionAnalisis, string>; hallazgos: string[]; resumen: string; conclusion: string };

// ---------- azar con semilla (mismo informe → mismo texto; otra variante → otra redacción)
function semilla(texto: string) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}
function generador(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- formato (compartido con el análisis integral)
const TIPO_CONSULTA: Record<string, string> = { primera: "las primeras consultas", sucesiva: "las consultas sucesivas", derivada: "las consultas derivadas" };

export function totales(s: Series) {
  return {
    consultas: s.por_mes.reduce((a, m) => a + m.consultas, 0),
    preventivas: s.por_mes.reduce((a, m) => a + m.preventivas, 0),
    diagnosticos: s.por_mes.reduce((a, m) => a + m.diagnosticos, 0),
    dias: s.por_mes.reduce((a, m) => a + m.dias_reposo, 0),
    poblacion: s.piramide.reduce((a, g) => a + (g.n ?? g.F + g.M), 0),
  };
}

// Observaciones clínico-ocupacionales por capítulo CIE-10 (dos lecturas posibles de cada una)
const LECTURA: Record<string, string[]> = {
  Osteomuscular: [
    "patrón que suele asociarse con carga física, posturas forzadas, movimientos repetitivos y manipulación manual de cargas",
    "lo que orienta a revisar la ergonomía de los puestos, la manipulación de cargas y la práctica de pausas activas",
  ],
  Respiratorio: [
    "cuadros sensibles a la estacionalidad y a la exposición a polvos, humos o cambios bruscos de temperatura",
    "hallazgo que conviene contrastar con la exposición a agentes químicos y la ventilación de las áreas de trabajo",
  ],
  Digestivo: [
    "relacionado con hábitos alimentarios, horarios de comida irregulares y la calidad del agua y los alimentos disponibles",
    "lo que invita a revisar las condiciones del comedor, el agua de consumo y la educación nutricional",
  ],
  Circulatorio: [
    "con peso de la hipertensión arterial y el riesgo cardiovascular, favorecidos por sedentarismo, estrés y hábitos poco saludables",
    "situación que exige control periódico de la tensión arterial y seguimiento de los trabajadores con factores de riesgo",
  ],
  "Endocrinas y metabólicas": [
    "con sobrepeso, dislipidemia o alteraciones de la glucemia como problemas de fondo",
    "lo que justifica programas de alimentación saludable y actividad física con seguimiento de laboratorio",
  ],
  "Trastornos mentales": [
    "señal de alerta sobre los factores psicosociales: carga y ritmo de trabajo, turnos, organización y clima laboral",
    "lo que aconseja una evaluación de riesgos psicosociales y acceso a orientación psicológica",
  ],
  Piel: [
    "compatible con contacto con agentes irritantes o sensibilizantes y con el uso irregular de guantes y protección",
    "lo que pide revisar los productos manipulados, la dotación de equipos de protección y las facilidades de higiene",
  ],
  "Oído": [
    "hallazgo que debe vincularse con la exposición a ruido y el uso efectivo de la protección auditiva",
    "lo que refuerza la necesidad de un programa de conservación auditiva con audiometrías de control",
  ],
  "Ojo y anexos": [
    "asociado con carga visual, iluminación deficiente, pantallas o proyección de partículas",
    "lo que orienta a revisar la iluminación, el uso de lentes de seguridad y el control visual periódico",
  ],
  Traumatismos: [
    "que remite a condiciones inseguras, orden y limpieza y la investigación de cada lesión",
    "hallazgo que debe cruzarse con los accidentes registrados y sus causas básicas",
  ],
  "Infecciosas y parasitarias": [
    "vinculado con higiene, agua de consumo, vacunación y condiciones sanitarias del centro de trabajo",
    "lo que invita a reforzar las medidas de higiene, el saneamiento y los esquemas de vacunación",
  ],
  Genitourinario: [
    "relacionado con la hidratación durante la jornada y el acceso oportuno a servicios sanitarios",
    "lo que sugiere revisar la disponibilidad de agua potable y las pausas para necesidades fisiológicas",
  ],
  "Síntomas y signos": [
    "diagnósticos aún sintomáticos que conviene completar con estudios para precisar su causa",
    "lo que indica la necesidad de cerrar el estudio de esos casos en las consultas sucesivas",
  ],
  "Factores de salud y contacto": [
    "propio de las evaluaciones y controles de salud de la vigilancia preventiva",
    "reflejo de la actividad preventiva: evaluaciones periódicas, controles y certificaciones",
  ],
  "Sistema nervioso": [
    "con cefaleas y cuadros neurológicos que pueden relacionarse con fatiga, turnos y exposición a solventes o ruido",
    "lo que aconseja vigilar la fatiga, la organización de los turnos y la exposición a neurotóxicos",
  ],
};

// Versión que va a la empresa: la discapacidad es dato reservado al servicio médico (decisión de Cesar, #41)
export const sinDiscapacidad = (r: Reporte): Reporte => ({ ...r, poblacion: { ...r.poblacion, discapacidad: undefined } });
// Un texto guardado que nombra la discapacidad no sale a la empresa hasta que el médico lo edite
export const mencionaDiscapacidad = (textos: unknown): boolean => /discapacidad/i.test(JSON.stringify(textos ?? ""));

export function generarAnalisis(d: DatosAnalisis, variante = 0): Analisis {
  const azar = generador(semilla(`${d.empresa ?? "todas"}|${d.desde}|${d.hasta}|${variante}`));
  const elige = <T,>(a: T[]): T => a[Math.floor(azar() * a.length)];
  const baraja = <T,>(a: T[]): T[] => a.map((x) => [azar(), x] as const).sort((x, y) => x[0] - y[0]).map(([, x]) => x);
  const { r, s } = d;
  const t = totales(s);
  const ant = d.anterior ? { etiqueta: d.anterior.etiqueta, ...totales(d.anterior.s) } : null;
  const anioAnt = d.anioAnterior ? { etiqueta: d.anioAnterior.etiqueta, ...totales(d.anioAnterior.s) } : null;
  const pob = r.poblacion.total;
  const sin = sinRegistros(d.etiqueta);
  const quien = d.empresa ? elige(["la empresa", "la entidad de trabajo", "la organización"]) : elige(["las empresas atendidas", "el conjunto de empresas"]);

  // Variación contra otro período, en palabras; null si no hay base para comparar
  const cambio = (actual: number, base: number | undefined, contra: string, cosa: string) => {
    if (base === undefined || (!base && !actual)) return null;
    if (!base) return elige([`${mayus(cosa)} no tiene referencia en ${contra} (sin registros entonces).`, `En ${contra} no hubo ${cosa}, por lo que no hay base de comparación.`]);
    const v = ((actual - base) * 100) / base;
    if (Math.abs(v) < 5) return elige([`${mayus(cosa)} se mantuvo estable frente a ${contra} (${n0(base)}).`, `Respecto a ${contra} (${n0(base)}), ${cosa} no muestra cambios relevantes.`, `La cifra es similar a la de ${contra} (${n0(base)}).`]);
    const sube = v > 0;
    const mag = Math.abs(v) >= 40 ? elige(sube ? ["un aumento marcado", "un incremento importante"] : ["un descenso marcado", "una reducción importante"]) : elige(sube ? ["un aumento", "un incremento"] : ["una disminución", "un descenso"]);
    return elige([
      `Frente a ${contra} (${n0(base)}), ${cosa} registra ${mag} de ${n1(Math.abs(v))} %.`,
      `Comparado con ${contra}, se observa ${mag} de ${n1(Math.abs(v))} % (${n0(base)} → ${n0(actual)}).`,
      `${mayus(cosa)} ${sube ? "subió" : "bajó"} ${n1(Math.abs(v))} % en relación con ${contra}, cuando se registraron ${n0(base)}.`,
    ]);
  };
  const pico = (campo: "consultas" | "dias_reposo" | "diagnosticos", cosa: string) => {
    if (s.por_mes.length < 2) return null;
    const vals = s.por_mes.map((m) => m[campo]);
    const media = vals.reduce((a, b) => a + b, 0) / vals.length;
    const i = vals.indexOf(Math.max(...vals));
    if (!media || vals[i] < media * 1.2) return null;
    return elige([
      `El mes de mayor ${cosa} fue ${mesLargo(s.por_mes[i].mes)} (${n0(vals[i])}).`,
      `${mayus(mesLargo(s.por_mes[i].mes))} concentró el pico de ${cosa}, con ${n0(vals[i])}.`,
      `Destaca ${mesLargo(s.por_mes[i].mes)} como el mes de más ${cosa} (${n0(vals[i])}).`,
    ]);
  };

  // ---------- Población
  const poblacion = (() => {
    if (!pob) return `${sin} Sin población efectiva registrada no se calculan tasas ni prevalencias.`;
    const masc = r.poblacion.masculino, fem = r.poblacion.femenino;
    const predomina = masc === fem ? "con igual número de hombres y mujeres" : masc > fem ? `con predominio masculino (${pc(masc, pob)})` : `con predominio femenino (${pc(fem, pob)})`;
    const grupos = [...s.piramide].filter((g) => g.grupo !== "Sin dato").sort((a, b) => b.n - a.n);
    const mayor = grupos[0];
    const frases = [
      elige([
        `${mayus(quien)} cuenta con ${plural(pob, "trabajador efectivo", "trabajadores efectivos")} en el período, ${predomina}.`,
        `La población efectiva del período es de ${plural(pob, "trabajador", "trabajadores")}, ${predomina}.`,
        `Se registran ${plural(pob, "trabajador efectivo", "trabajadores efectivos")}, ${predomina}.`,
      ]),
    ];
    if (mayor) frases.push(elige([
      `El grupo de ${mayor.grupo} años es el más numeroso (${pc(mayor.n, pob)} de la plantilla).`,
      `La mayor concentración está entre los ${mayor.grupo} años, con ${pc(mayor.n, pob)} del personal.`,
      `Por edad, predomina el grupo de ${mayor.grupo} años (${n0(mayor.n)} trabajadores).`,
    ]));
    const mayores = s.piramide.filter((g) => g.grupo === "55-64" || g.grupo === "65 y más").reduce((a, g) => a + g.n, 0);
    if (p(mayores, pob) >= 20) frases.push(elige([
      `El ${pc(mayores, pob)} tiene 55 años o más, lo que eleva la prioridad de la vigilancia cardiovascular, metabólica y osteomuscular.`,
      `Una fracción relevante (${pc(mayores, pob)}) supera los 55 años: conviene reforzar los controles de enfermedades crónicas.`,
    ]));
    if (r.poblacion.discapacidad) frases.push(elige([
      `Hay ${plural(r.poblacion.discapacidad, "trabajador", "trabajadores")} con discapacidad registrada, cuyo puesto debe mantenerse adecuado a su condición.`,
      `Se registra${r.poblacion.discapacidad === 1 ? "" : "n"} ${plural(r.poblacion.discapacidad, "caso", "casos")} de discapacidad, que requieren adecuación del puesto y seguimiento.`,
    ]));
    if (pob < 10) frases.push("Con menos de 10 trabajadores, los porcentajes varían mucho con pocos casos y deben leerse con cautela.");
    return [frases[0], ...baraja(frases.slice(1))].join(" ");
  })();

  // ---------- Uso del servicio
  const uso = (() => {
    const c = r.consultas;
    if (!c.total) return `${sin} ${elige(["Sin consultas registradas no hay demanda que analizar; conviene confirmar que las atenciones se estén cargando en el sistema.", "El servicio médico no tiene atenciones registradas en el lapso."])}`;
    const cobertura = pob ? p(c.pacientes, pob) : 0;
    const motivo = [...c.por_motivo].sort((a, b) => b.n - a.n)[0];
    const frases = [
      elige([
        `El servicio médico realizó ${plural(c.total, "consulta", "consultas")} a ${plural(c.pacientes, "paciente", "pacientes")}${pob ? `, una cobertura del ${n1(cobertura)} % de la población` : ""}.`,
        `Se atendieron ${plural(c.total, "consulta", "consultas")} en el período, correspondientes a ${plural(c.pacientes, "trabajador", "trabajadores")}${pob ? ` (${n1(cobertura)} % de la plantilla)` : ""}.`,
        `En el período se registran ${plural(c.total, "atención", "atenciones")}${pob ? `; el ${n1(cobertura)} % de los trabajadores acudió al menos una vez` : ""}.`,
        `La demanda del servicio médico fue de ${plural(c.total, "consulta", "consultas")}${pob ? `, con ${plural(c.pacientes, "trabajador atendido", "trabajadores atendidos")} (${n1(cobertura)} % de cobertura)` : ""}.`,
        `${mayus(plural(c.pacientes, "trabajador pasó", "trabajadores pasaron"))} por el servicio médico en ${plural(c.total, "consulta", "consultas")}${pob ? `, el ${n1(cobertura)} % de la población` : ""}.`,
      ]),
      c.preventivas
        ? elige([
            `Las consultas preventivas representan el ${pc(c.preventivas, c.total)} y las asistenciales el ${pc(c.no_preventivas, c.total)}.`,
            `Del total, ${pc(c.preventivas, c.total)} fueron preventivas (evaluaciones y controles) y ${pc(c.no_preventivas, c.total)} por demanda de atención.`,
          ])
        : elige([
            "No hubo consultas preventivas: toda la atención fue asistencial, por lo que conviene programar las evaluaciones periódicas.",
            "La atención fue en su totalidad asistencial; las evaluaciones preventivas del período quedaron sin registrar.",
          ]),
    ];
    if (motivo) frases.push(elige([
      `El motivo más frecuente fue «${motivo.nombre}» (${pc(motivo.n, c.total)}).`,
      `«${motivo.nombre}» encabeza los motivos de consulta con ${plural(motivo.n, "caso", "casos")}.`,
    ]));
    if (c.preventivas && p(c.preventivas, c.total) < 25) frases.push(elige([
      "La actividad preventiva es baja en proporción: conviene programar las evaluaciones periódicas pendientes.",
      "La proporción de consultas preventivas es reducida; el plan de evaluaciones periódicas debería ganar peso.",
    ]));
    const pk = pico("consultas", "consultas");
    if (pk) frases.push(pk);
    const cmp = cambio(t.consultas, ant?.consultas, ant ? `el ${etq(ant.etiqueta)}` : "", "el número de consultas");
    if (cmp) frases.push(cmp);
    const cmpA = anioAnt && anioAnt.consultas ? cambio(t.consultas, anioAnt.consultas, "el mismo período del año anterior", "el volumen de consultas") : null;
    if (cmpA && azar() > 0.35) frases.push(cmpA);
    return [frases[0], ...baraja(frases.slice(1))].join(" ");
  })();

  // ---------- Morbilidad
  const capitulos = [...s.capitulos].sort((a, b) => b.n - a.n);
  const morbilidad = (() => {
    const m = r.morbilidad;
    if (!m.total) return `${sin} ${elige(["No hubo diagnósticos clínicos registrados.", "La población atendida no presentó diagnósticos clínicos."])}`;
    const prevalencia = pob ? p(m.pacientes ?? 0, pob) : 0;
    const frases = [
      elige([
        `Se registraron ${plural(m.total, "diagnóstico", "diagnósticos")}${pob ? `, con una prevalencia de ${n1(prevalencia)} % de trabajadores afectados` : ""}.`,
        `La morbilidad del período suma ${plural(m.total, "diagnóstico", "diagnósticos")}${m.pacientes ? ` en ${plural(m.pacientes, "paciente", "pacientes")}` : ""}${pob ? ` (${n1(prevalencia)} % de la población)` : ""}.`,
        `${pob ? `El ${n1(prevalencia)} % de los trabajadores tuvo al menos un diagnóstico` : "Hubo diagnósticos clínicos"} en el período, para un total de ${plural(m.total, "diagnóstico", "diagnósticos")}.`,
        `El perfil de morbilidad se construye con ${plural(m.total, "diagnóstico registrado", "diagnósticos registrados")}${pob ? ` y una prevalencia de ${n1(prevalencia)} %` : ""}.`,
      ]),
    ];
    const top = capitulos[0];
    if (top) {
      const lectura = LECTURA[top.nombre];
      frases.push(elige([
        `El grupo con más casos es ${minus(top.nombre)} (${pc(top.n, m.total)} de los diagnósticos)${lectura ? `, ${elige(lectura)}` : ""}.`,
        `Predomina la patología del capítulo ${minus(top.nombre)}, con ${plural(top.n, "caso", "casos")}${lectura ? `; ${elige(lectura)}` : ""}.`,
        `${mayus(top.nombre)} encabeza la morbilidad con el ${pc(top.n, m.total)}${lectura ? `, ${elige(lectura)}` : ""}.`,
      ]));
    }
    // Pareto: cuántos grupos explican el 80 %
    let acum = 0, k = 0;
    for (const c of capitulos) { acum += c.n; k++; if (acum >= m.total * 0.8) break; }
    if (capitulos.length >= 3) frases.push(elige([
      `${mayus(plural(k, "grupo", "grupos"))} de ${capitulos.length} explican el 80 % de la morbilidad, donde deben concentrarse las acciones.`,
      `El análisis de Pareto muestra que ${plural(k, "capítulo concentra", "capítulos concentran")} el 80 % de los diagnósticos.`,
    ]));
    const causa = m.primeras_causas.find(nombrable);
    if (causa) frases.push(elige([
      `La primera causa individual es ${dx(causa)}, con ${plural(causa.n, "caso", "casos")}.`,
      `Entre los diagnósticos específicos destaca ${dx(causa)}, con ${plural(causa.n, "caso", "casos")}.`,
    ]));
    const ocup = m.por_origen.ocupacional ?? 0;
    if (ocup) frases.push(elige([
      `${mayus(personas(ocup, "diagnóstico fue calificado", "diagnósticos fueron calificados"))} como de origen ocupacional, lo que obliga a su investigación y declaración.`,
      `Hay ${personas(ocup, "diagnóstico", "diagnósticos")} de posible origen ocupacional que requieren investigación y, si se confirman, declaración ante el INPSASEL.`,
    ]));
    const cmp = cambio(t.diagnosticos, ant?.diagnosticos, ant ? `el ${etq(ant.etiqueta)}` : "", "el número de diagnósticos");
    if (cmp && azar() > 0.3) frases.push(cmp);
    return [frases[0], ...baraja(frases.slice(1))].join(" ");
  })();

  // ---------- Ausentismo
  const ausentismo = (() => {
    const a = r.ausentismo;
    if (!a.dias_perdidos) return `${sin} ${elige([
      "El ausentismo por causa médica fue nulo.",
      "El indicador de ausentismo se mantiene en cero.",
    ])}`;
    const enMeta = d.pct < 2.5;
    const causa = [...a.por_causa].sort((x, y) => y.dias - x.dias)[0];
    const frases = [
      elige([
        `Se perdieron ${plural(a.dias_computables, "día", "días")} por reposo médico, con un promedio de ausentismo diario de ${n2(d.pad)} trabajadores y un ${n2(d.pct)} % de ausentismo, ${enMeta ? "dentro de" : "por encima de"} la meta de 2,5 %.`,
        `El porcentaje de ausentismo fue de ${n2(d.pct)} % (${plural(a.dias_computables, "día perdido", "días perdidos")}), ${enMeta ? "por debajo del" : "superior al"} límite de referencia de 2,5 %.`,
        `El ausentismo médico alcanzó ${n2(d.pct)} %, ${enMeta ? "un valor aceptable frente a" : "lo que supera"} la meta de 2,5 %, con ${plural(a.dias_computables, "día", "días")} de reposo.`,
      ]),
    ];
    if (a.trabajadores_ausentes) frases.push(elige([
      `${mayus(plural(a.trabajadores_ausentes, "trabajador estuvo", "trabajadores estuvieron"))} de reposo al menos un día.`,
      `Los reposos afectaron a ${plural(a.trabajadores_ausentes, "trabajador", "trabajadores")}.`,
    ]));
    if (causa) frases.push(elige([
      `La causa con más días es ${minus(d.causas[causa.nombre] ?? humano(causa.nombre))} (${pc(causa.dias, a.dias_perdidos)} de los días).`,
      `${mayus(d.causas[causa.nombre] ?? humano(causa.nombre))} explica la mayor parte del tiempo perdido, con ${plural(causa.dias, "día", "días")}.`,
    ]));
    const pc1 = a.primeras_causas?.find(nombrable);
    if (pc1) frases.push(elige([
      `Por diagnóstico, el primer motivo de reposo es ${dx(pc1)}.`,
      `${mayus(dx(pc1))} es el diagnóstico que más reposos generó.`,
    ]));
    const pk = pico("dias_reposo", "días de reposo");
    if (pk) frases.push(pk);
    const cmp = cambio(t.dias, ant?.dias, ant ? `el ${etq(ant.etiqueta)}` : "", "el total de días de reposo");
    if (cmp) frases.push(cmp);
    if (!enMeta) frases.push(elige([
      "Es prioritario analizar los casos de reposo prolongado y reincidente y su relación con el puesto de trabajo.",
      "Conviene revisar los reposos reiterados y los de larga duración, y su posible vínculo con las condiciones de trabajo.",
    ]));
    return [frases[0], ...baraja(frases.slice(1))].join(" ");
  })();

  // ---------- Accidentes y enfermedades ocupacionales
  const accidentes = (() => {
    const a = d.acc;
    const eo = r.enfermedad_ocupacional?.casos ?? 0;
    const frases: string[] = [];
    if (!a || !a.accidentes) frases.push(`${eo ? "" : `${sin} `}${elige([
      "No hubo accidentes de trabajo, resultado favorable que debe sostenerse con la inspección y la formación continua.",
      "El período cierra sin accidentes laborales registrados.",
      "No hubo accidentes de trabajo en el lapso evaluado.",
    ])}`);
    else {
      frases.push(elige([
        `Se registraron ${plural(a.accidentes, "accidente de trabajo", "accidentes de trabajo")}, ${a.conTiempoPerdido ? `${n0(a.conTiempoPerdido)} con tiempo perdido` : "ninguno con tiempo perdido"}.`,
        `Ocurri${a.accidentes === 1 ? "ó" : "eron"} ${plural(a.accidentes, "accidente laboral", "accidentes laborales")} en el período${a.conTiempoPerdido ? `; ${plural(a.conTiempoPerdido, "lesión generó", "lesiones generaron")} incapacidad` : ""}.`,
      ]));
      if (a.ifn !== null) frases.push(elige([
        `El índice de frecuencia neta fue de ${n2(a.ifn)} y el de severidad de ${n2(a.is ?? 0)} por millón de horas hombre trabajadas.`,
        `Los índices COVENIN 474 se ubican en IFN ${n2(a.ifn)} e IS ${n2(a.is ?? 0)}.`,
      ]));
      if (a.porDeclarar) frases.push(elige([
        `Queda${a.porDeclarar === 1 ? "" : "n"} ${plural(a.porDeclarar, "declaración pendiente", "declaraciones pendientes")} ante el INPSASEL, que debe${a.porDeclarar === 1 ? "" : "n"} formalizarse a la brevedad.`,
        `Hay ${plural(a.porDeclarar, "evento", "eventos")} sin declarar ante el INPSASEL: el plazo legal es de 24 horas.`,
      ]));
      else if (a.aTiempo !== null) frases.push(`El ${n0(a.aTiempo)} % de los eventos se declaró dentro del plazo legal.`);
    }
    frases.push(eo
      ? elige([`Se diagnosticaron ${personas(eo, "caso", "casos")} de enfermedad ocupacional, que requieren investigación, declaración y reubicación si corresponde.`, `En el período se calificaron ${eo < 3 ? "casos de enfermedad ocupacional" : plural(eo, "enfermedad ocupacional", "enfermedades ocupacionales")}.`])
      : elige(["No se calificaron enfermedades ocupacionales en el período.", "Sin nuevos casos de enfermedad ocupacional."]));
    return frases.join(" ");
  })();

  // ---------- Evaluaciones ocupacionales por motivo (preempleo, periódico, vacacionales, egreso…)
  const evaluaciones = (() => {
    const prev = r.consultas.por_motivo.filter((m) => m.grupo === "preventivo" && m.n > 0).sort((a, b) => b.n - a.n);
    const total = prev.reduce((a, m) => a + m.n, 0);
    if (!total) return `${sin} ${elige([
      "No hubo evaluaciones ocupacionales (preempleo, periódicas, vacacionales o de egreso): conviene revisar la programación de la vigilancia preventiva.",
      "La vigilancia quedó limitada a la consulta asistencial, sin evaluaciones ocupacionales.",
      "La actividad preventiva debe retomarse según el programa anual.",
    ])}`;
    const tipo = (re: RegExp) => prev.filter((m) => re.test(sinTildes(m.nombre))).reduce((a, m) => a + m.n, 0);
    const ingreso = tipo(/pre.?empleo|ingreso/);
    const egreso = tipo(/egreso|retiro/);
    const periodicas = tipo(/periodic|anual/);
    const preVac = tipo(/pre.?vacacion/);
    const postVac = tipo(/post.?vacacion|reintegro/);
    const detalle = unir(prev.slice(0, 5).map((m) => `${minus(m.nombre)} ${n0(m.n)} (${pc(m.n, total)})`));
    const frases = [
      elige([
        `Se realizaron ${plural(total, "evaluación ocupacional", "evaluaciones ocupacionales")}: ${detalle}.`,
        `La vigilancia preventiva sumó ${plural(total, "evaluación", "evaluaciones")}, distribuidas así: ${detalle}.`,
        `Por motivo, las ${plural(total, "evaluación ocupacional", "evaluaciones ocupacionales")} del período se reparten en ${detalle}.`,
        `El servicio completó ${plural(total, "evaluación médico-ocupacional", "evaluaciones médico-ocupacionales")}; por motivo: ${detalle}.`,
      ]),
    ];
    if (prev[0] && prev.length > 1) frases.push(elige([
      `Predominan las evaluaciones de ${minus(prev[0].nombre)}, ${p(prev[0].n, total) >= 50 ? "más de la mitad del total" : "el grupo más numeroso"}.`,
      `${mayus(prev[0].nombre)} es el motivo preventivo más frecuente.`,
    ]));
    if (ingreso || egreso) {
      if (ingreso && egreso) frases.push(ingreso > egreso
        ? elige([`Los ingresos superan a los egresos (${n0(ingreso)} frente a ${n0(egreso)}), señal de crecimiento o reposición de personal que exige una inducción y notificación de riesgos oportuna.`, `Con ${plural(ingreso, "preempleo", "preempleos")} y ${plural(egreso, "egreso", "egresos")}, la plantilla tiende a crecer: la inducción en seguridad y salud debe acompañar cada ingreso.`])
        : ingreso < egreso
          ? elige([`Los egresos (${n0(egreso)}) superan a los ingresos (${n0(ingreso)}), lo que sugiere reducción o rotación del personal.`, `Hubo más egresos que ingresos (${n0(egreso)} frente a ${n0(ingreso)}): conviene vigilar la rotación y sus causas.`])
          : `Ingresos y egresos se compensan (${n0(ingreso)} de cada uno), con una plantilla estable pero con rotación.`);
      else if (ingreso) frases.push(elige([`Hubo ${plural(ingreso, "evaluación de ingreso", "evaluaciones de ingreso")} y ningún egreso evaluado: si hubo retiros, falta su constancia de salud al egreso.`, `Se evaluaron ${plural(ingreso, "ingreso", "ingresos")} sin egresos registrados en el período.`]));
      else frases.push(elige([`Se registraron ${plural(egreso, "evaluación de egreso", "evaluaciones de egreso")}, que dejan constancia del estado de salud al salir y protegen a la empresa ante reclamos futuros.`, `Las ${plural(egreso, "evaluación", "evaluaciones")} de egreso documentan la condición de salud de quienes se retiran.`]));
    }
    if (pob) {
      const ritmo = p(periodicas, pob);
      frases.push(!periodicas
        ? elige(["No hubo evaluaciones periódicas: para cubrir a toda la plantilla en el año, cada trimestre debería evaluarse al menos la cuarta parte.", "Faltan las evaluaciones periódicas, base de la detección precoz de daños a la salud por el trabajo."])
        : ritmo < 20
          ? elige([`Las periódicas cubrieron el ${n1(ritmo)} % de la población, un ritmo insuficiente para evaluar a todos en el año (meta trimestral cercana al 25 %).`, `Con ${plural(periodicas, "periódica", "periódicas")} (${n1(ritmo)} % de la plantilla), el programa anual va atrasado.`])
          : elige([`Las periódicas alcanzaron el ${n1(ritmo)} % de la población, ritmo adecuado para cubrir a todos en el año.`, `El avance de las evaluaciones periódicas (${n1(ritmo)} % de la plantilla) es acorde con el programa anual.`]));
    }
    if (preVac && preVac > postVac) frases.push(elige([
      `Hay ${plural(preVac - postVac, "evaluación prevacacional", "evaluaciones prevacacionales")} más que postvacacionales: verificar que quienes regresaron de vacaciones fueron evaluados al reintegro.`,
      `Las postvacacionales (${n0(postVac)}) no alcanzan a las prevacacionales (${n0(preVac)}); parte de los reintegros puede estar sin evaluar o caer en el próximo período.`,
    ]));
    const cmpA = anioAnt && anioAnt.preventivas ? cambio(t.preventivas, anioAnt.preventivas, "el mismo período del año anterior", "la actividad preventiva") : null;
    if (cmpA && azar() > 0.4) frases.push(cmpA);
    return [frases[0], ...baraja(frases.slice(1))].join(" ");
  })();

  // ---------- Uso del servicio por dependencia
  const dependencias = (() => {
    const deps = (r.consultas.por_dependencia ?? []).filter((x) => x.n > 0);
    const repo = (r.ausentismo.por_dependencia ?? []).filter((x) => x.dias > 0);
    if (!deps.length && !repo.length) return sin;
    const frases: string[] = [];
    const tasa = deps.filter((x) => x.personal >= 3).map((x) => ({ ...x, tasa: x.n / x.personal })).sort((a, b) => b.tasa - a.tasa);
    const masUso = [...deps].sort((a, b) => b.n - a.n)[0];
    if (masUso) frases.push(elige([
      `${mayus(masUso.nombre)} es la dependencia con más consultas (${plural(masUso.n, "consulta", "consultas")}, ${pc(masUso.n, r.consultas.total)} del total).`,
      `Por área, la mayor demanda de atención viene de ${masUso.nombre} (${pc(masUso.n, r.consultas.total)}).`,
      `La dependencia que más usó el servicio médico fue ${masUso.nombre}, con ${plural(masUso.n, "consulta", "consultas")}.`,
    ]));
    if (tasa.length >= 2 && tasa[0].nombre !== masUso?.nombre && tasa[0].tasa >= 1.5 * (r.consultas.total / Math.max(pob, 1))) frases.push(elige([
      `En proporción a su personal, ${tasa[0].nombre} tiene la frecuencia más alta (${n1(tasa[0].tasa)} consultas por trabajador), dato que orienta la inspección de sus condiciones de trabajo.`,
      `Relativo al número de trabajadores, destaca ${tasa[0].nombre} (${n1(tasa[0].tasa)} consultas por trabajador): conviene revisar sus puestos.`,
    ]));
    // Solo áreas con 3 reposos o más: con menos, el texto señalaría a una persona
    const masDias = [...repo].filter((x) => x.n >= 3).sort((a, b) => b.dias - a.dias)[0];
    if (masDias) frases.push(elige([
      `En días de reposo, el área más afectada es ${masDias.nombre} (${plural(masDias.dias, "día", "días")}).`,
      `${mayus(masDias.nombre)} acumula más días de reposo (${n0(masDias.dias)}), por lo que su ausentismo merece seguimiento.`,
    ]));
    return [frases[0], ...baraja(frases.slice(1))].filter(Boolean).join(" ");
  })();

  // ---------- Primeras causas de morbilidad (con prevalencia) y por tipo de consulta
  const causas = (() => {
    const pcs = r.morbilidad.primeras_causas;
    if (!pcs.length || !r.morbilidad.total) return sin;
    const tres = pcs.slice(0, 3);
    const peso = tres.reduce((a, c) => a + c.n, 0);
    const frases = [elige([
      `Las tres primeras causas concentran el ${pc(peso, r.morbilidad.total)} de los diagnósticos, ${p(peso, r.morbilidad.total) >= 50 ? "un perfil concentrado donde las acciones dirigidas rinden más" : "un perfil disperso que pide acciones de promoción de la salud más generales"}.`,
      `Entre las diez primeras causas, las tres primeras suman ${pc(peso, r.morbilidad.total)} de la morbilidad.`,
      `El ${pc(peso, r.morbilidad.total)} de los diagnósticos se explica por las tres primeras causas.`,
    ])];
    const conPrev = pcs.filter((c) => c.pacientes && c.pacientes >= 3);
    if (pob && conPrev[0]) frases.push(elige([
      `La de mayor prevalencia afecta al ${pc(conPrev[0].pacientes!, pob)} de los trabajadores.`,
      `En prevalencia, la primera causa alcanza el ${pc(conPrev[0].pacientes!, pob)} de la población.`,
    ]));
    const recurrentes = pcs.filter((c) => c.pacientes && c.n > c.pacientes * 1.5 && c.n >= 3);
    if (recurrentes.length) frases.push(elige([
      `Algunas causas se repiten en los mismos pacientes (más consultas que personas), lo que sugiere cuadros recurrentes o mal controlados.`,
      `Hay diagnósticos con reconsultas frecuentes, señal de casos que no se resuelven en la primera atención.`,
    ]));
    const tipos = Object.entries(r.morbilidad.por_tipo_consulta ?? {}).filter(([, x]) => x.n > 0).sort((a, b) => b[1].n - a[1].n);
    if (tipos.length >= 2) frases.push(elige([
      `Por tipo de consulta, la morbilidad se detecta sobre todo en ${TIPO_CONSULTA[tipos[0][0]] ?? humano(tipos[0][0])} (${pc(tipos[0][1].n, r.morbilidad.total)}).`,
      `La mayor parte de los diagnósticos surge de ${TIPO_CONSULTA[tipos[0][0]] ?? humano(tipos[0][0])}.`,
    ]));
    return [frases[0], ...baraja(frases.slice(1))].join(" ");
  })();

  // ---------- Reposos: duración, ente emisor y permisos
  const reposos = (() => {
    const a = r.ausentismo;
    if (!a.reposos && !(a.permisos ?? []).length) return sin;
    const frases: string[] = [];
    if (a.reposos) {
      const media = a.dias_perdidos / a.reposos;
      frases.push(elige([
        `Cada reposo duró en promedio ${n1(media)} días${media > 7 ? ", lo que indica cuadros de mayor gravedad o reposos prolongados" : ", predominando reposos cortos"}.`,
        `La duración media de los reposos fue de ${n1(media)} días${media > 7 ? ": hay reposos largos que merecen seguimiento" : ""}.`,
        `En promedio, un reposo significó ${n1(media)} días fuera del puesto.`,
      ]));
    }
    const ente = [...a.por_ente].sort((x, y) => y.n - x.n)[0];
    if (ente && a.por_ente.length > 1) frases.push(elige([
      `La mayoría de los reposos los emitió ${minus(d.entes?.[ente.nombre] ?? humano(ente.nombre))} (${pc(ente.n, a.reposos)}).`,
      `Por ente emisor, predomina ${minus(d.entes?.[ente.nombre] ?? humano(ente.nombre))}.`,
    ]));
    const externos = a.por_ente.filter((e) => !/interno|servicio|propio/i.test(`${e.nombre} ${d.entes?.[e.nombre] ?? ""}`)).reduce((x, e) => x + e.n, 0);
    if (externos && a.reposos && p(externos, a.reposos) >= 50) frases.push(elige([
      "Más de la mitad de los reposos son externos: deben conformarse en el servicio médico y verificarse su relación con el trabajo.",
      "Predominan los reposos emitidos fuera del servicio, que requieren conformación y control del reintegro.",
    ]));
    const perm = (a.permisos ?? []).filter((x) => x.n > 0);
    if (perm.reduce((x, y) => x + y.n, 0) >= 3) frases.push(elige([
      `Aparte del ausentismo, se otorgaron ${plural(perm.reduce((x, y) => x + y.n, 0), "permiso", "permisos")} (${unir(perm.map((x) => minus(d.causas[x.nombre] ?? humano(x.nombre))))}), que no cuentan como ausentismo por razones de salud.`,
      `Los permisos (${unir(perm.map((x) => minus(d.causas[x.nombre] ?? humano(x.nombre))))}) suman ${plural(perm.reduce((x, y) => x + y.dias, 0), "día", "días")} y se reportan por separado.`,
    ]));
    return frases.join(" ");
  })();

  // ---------- Referencias
  const referencias = (() => {
    const ref = r.referencias;
    if (!ref?.total) return `${sin} ${elige(["No se emitieron referencias a especialistas.", "Todas las atenciones se resolvieron en el servicio, sin referencias a especialistas."])}`;
    const top = [...ref.por_especialidad].sort((a, b) => b.n - a.n).slice(0, 2);
    return elige([
      `Se emitieron ${plural(ref.total, "referencia", "referencias")} a especialistas${top.length ? `, principalmente a ${unir(top.map((x) => x.nombre.toLowerCase()))}` : ""}.`,
      `${mayus(plural(ref.total, "paciente fue referido", "pacientes fueron referidos"))} a la red especializada${top.length ? `; ${top[0].nombre.toLowerCase()} fue la más solicitada` : ""}.`,
    ]) + (r.consultas.total ? ` ${elige(["Equivale a", "Representa"])} ${pc(ref.total, r.consultas.total)} de las consultas.` : "");
  })();

  // ---------- Aptitud
  const aptitud = (() => {
    const ap = Object.entries(r.aptitud).filter(([, n]) => n > 0);
    const total = ap.reduce((a, [, n]) => a + n, 0);
    if (!total) return `${sin} ${elige(["No se emitieron certificados de aptitud.", "Ninguna evaluación tuvo calificación de aptitud."])}`;
    const ord = ap.sort((a, b) => b[1] - a[1]);
    const nombre = (k: string) => (d.aptitudes[k] ?? k).toLowerCase();
    const restr = ap.filter(([k]) => /restric|condic|limit/i.test(k) || /restric|condic|limit/i.test(d.aptitudes[k] ?? "")).reduce((a, [, n]) => a + n, 0);
    const noApto = ap.filter(([k]) => /no_apto|no apto/i.test(k) || /no apto/i.test(d.aptitudes[k] ?? "")).reduce((a, [, n]) => a + n, 0);
    const frases = [elige([
      `Se calificaron ${plural(total, "evaluación", "evaluaciones")}; predomina «${nombre(ord[0][0])}» con ${pc(ord[0][1], total)}.`,
      `De ${plural(total, "certificado de aptitud emitido", "certificados de aptitud emitidos")}, el ${pc(ord[0][1], total)} corresponde a «${nombre(ord[0][0])}».`,
    ])];
    if (restr) frases.push(elige([`${mayus(plural(restr, "trabajador quedó", "trabajadores quedaron"))} con restricciones o condiciones, que la empresa debe respetar en la asignación de tareas.`, `Las restricciones emitidas (${n0(restr)}) deben reflejarse en la asignación del puesto.`]));
    if (noApto) frases.push(`Hubo ${plural(noApto, "calificación", "calificaciones")} de no apto, que exige${noApto === 1 ? "" : "n"} seguimiento médico antes de cualquier asignación.`);
    return frases.join(" ");
  })();

  // ---------- Hallazgos clave (portada) y conclusión final
  const alertas: string[] = [];
  const fortalezas: string[] = [];
  if (r.ausentismo.dias_perdidos && d.pct >= 2.5) alertas.push(`ausentismo de ${n2(d.pct)} % (meta: menos de 2,5 %)`);
  else if (pob) fortalezas.push(r.ausentismo.dias_perdidos ? `ausentismo dentro de la meta (${n2(d.pct)} %)` : "ausentismo médico nulo");
  if (d.acc?.accidentes) alertas.push(`${plural(d.acc.accidentes, "accidente de trabajo", "accidentes de trabajo")}`);
  else fortalezas.push("ningún accidente de trabajo");
  if (d.acc?.porDeclarar) alertas.push(`${plural(d.acc.porDeclarar, "declaración pendiente", "declaraciones pendientes")} ante el INPSASEL`);
  if (r.enfermedad_ocupacional?.casos) alertas.push(`${plural(r.enfermedad_ocupacional.casos, "enfermedad ocupacional", "enfermedades ocupacionales")}`);
  if (capitulos[0] && r.morbilidad.total) alertas.push(`predominio del grupo ${minus(capitulos[0].nombre)} (${pc(capitulos[0].n, r.morbilidad.total)})`);
  if (r.consultas.total && p(r.consultas.preventivas, r.consultas.total) < 25) alertas.push(r.consultas.preventivas ? "baja proporción de consultas preventivas" : "ausencia de consultas preventivas");
  else if (r.consultas.preventivas) fortalezas.push(`${pc(r.consultas.preventivas, r.consultas.total)} de actividad preventiva`);

  const hallazgos = [
    pob ? `${plural(pob, "trabajador efectivo", "trabajadores efectivos")} y ${plural(r.consultas.total, "consulta", "consultas")} (${pob ? `${n1(p(r.consultas.pacientes, pob))} % de cobertura` : ""}).` : `${plural(r.consultas.total, "consulta", "consultas")} en el período.`,
    r.morbilidad.total ? `${plural(r.morbilidad.total, "diagnóstico", "diagnósticos")}${capitulos[0] ? `; primer grupo: ${minus(capitulos[0].nombre)}` : ""}.` : "Sin diagnósticos registrados.",
    r.ausentismo.dias_perdidos ? `${n2(d.pct)} % de ausentismo (${plural(r.ausentismo.dias_computables, "día perdido", "días perdidos")}), ${d.pct < 2.5 ? "dentro" : "fuera"} de la meta.` : "Sin días perdidos por reposo médico.",
    d.acc?.accidentes ? `${plural(d.acc.accidentes, "accidente", "accidentes")} de trabajo; IFN ${n2(d.acc.ifn ?? 0)}.` : "Cero accidentes de trabajo.",
  ];

  const lugar = d.empresa ? `en ${d.empresa}` : "en el conjunto de empresas atendidas";
  const apertura = elige([
    `El ${etq(d.etiqueta)} ${lugar} deja un balance ${alertas.length <= 1 ? "favorable" : alertas.length <= 3 ? "con aspectos por atender" : "que exige acciones prioritarias"}.`,
    `La vigilancia del ${etq(d.etiqueta)} ${lugar} muestra un estado de salud ${alertas.length <= 1 ? "globalmente satisfactorio" : "con focos de atención definidos"}.`,
    `Del análisis de los datos del ${etq(d.etiqueta)} ${lugar} se desprende un panorama ${alertas.length <= 1 ? "estable" : "con prioridades claras de intervención"}.`,
    `En el ${etq(d.etiqueta)}, la salud de los trabajadores ${lugar} ${alertas.length <= 1 ? "se mantiene en condiciones favorables" : alertas.length <= 3 ? "presenta aspectos que requieren atención" : "requiere intervenciones prioritarias"}.`,
    `Los indicadores del ${etq(d.etiqueta)} ${lugar} ${alertas.length <= 1 ? "reflejan un período sin alertas relevantes" : `señalan ${plural(alertas.length, "alerta", "alertas")} que deben atenderse`}.`,
  ]);
  const cuerpo: string[] = [];
  if (fortalezas.length) cuerpo.push(elige([`Como aspectos positivos destacan ${unir(fortalezas)}.`, `A favor se cuentan ${unir(fortalezas)}.`, `Se valoran positivamente ${unir(fortalezas)}.`]));
  if (alertas.length) cuerpo.push(elige([`Los puntos que requieren atención son ${unir(alertas)}.`, `Las prioridades del próximo período son ${unir(alertas)}.`, `Requieren seguimiento ${unir(alertas)}.`]));
  const top = capitulos[0];
  if (top && LECTURA[top.nombre]) cuerpo.push(elige([
    `En el perfil de morbilidad pesa el grupo ${minus(top.nombre)}, ${elige(LECTURA[top.nombre])}.`,
    `Destaca el predominio del grupo ${minus(top.nombre)}, ${elige(LECTURA[top.nombre])}.`,
  ]));
  if (ant) {
    const dif = t.consultas - ant.consultas;
    if (ant.consultas && Math.abs(dif) / ant.consultas >= 0.1) cuerpo.push(elige([
      `La demanda de atención ${dif > 0 ? "creció" : "se redujo"} ${n1((Math.abs(dif) * 100) / ant.consultas)} % respecto al ${etq(ant.etiqueta)}.`,
      `Frente al ${etq(ant.etiqueta)}, las consultas ${dif > 0 ? "aumentaron" : "disminuyeron"} en ${n1((Math.abs(dif) * 100) / ant.consultas)} %.`,
    ]));
  }
  const cierre = elige([
    "Se recomienda mantener la vigilancia médica periódica, ejecutar las medidas de control propuestas y evaluar su efecto en el próximo informe.",
    "Las recomendaciones de este informe deben incorporarse al Programa de Seguridad y Salud en el Trabajo y verificarse en el siguiente trimestre.",
    "El seguimiento de estos indicadores en el próximo período permitirá medir el impacto de las acciones preventivas adoptadas.",
    "Corresponde al Comité de Seguridad y Salud Laboral dar seguimiento a estas conclusiones y verificar en el próximo trimestre el avance de las medidas.",
    "La comparación con el siguiente informe dirá si las medidas propuestas modifican la tendencia de los indicadores.",
  ]);
  const conclusion = [apertura, ...baraja(cuerpo), cierre].join(" ");

  const resumen = [
    elige([
      `Durante el ${etq(d.etiqueta)} se atendieron ${plural(r.consultas.total, "consulta", "consultas")} ${lugar}${pob ? `, para una población de ${plural(pob, "trabajador", "trabajadores")}` : ""}.`,
      `Este informe recoge la actividad del servicio médico ${lugar} en el ${etq(d.etiqueta)}: ${plural(r.consultas.total, "consulta", "consultas")}${pob ? ` sobre ${plural(pob, "trabajador efectivo", "trabajadores efectivos")}` : ""}.`,
    ]),
    r.morbilidad.total ? elige([
      `Se registraron ${plural(r.morbilidad.total, "diagnóstico", "diagnósticos")}${top ? `, con predominio del grupo ${minus(top.nombre)}` : ""}.`,
      `La morbilidad suma ${plural(r.morbilidad.total, "diagnóstico", "diagnósticos")}${top ? ` y la encabeza el grupo ${minus(top.nombre)}` : ""}.`,
    ]) : "",
    r.ausentismo.dias_perdidos
      ? `El ausentismo fue de ${n2(d.pct)} % (${d.pct < 2.5 ? "dentro de" : "sobre"} la meta de 2,5 %)${d.acc?.accidentes ? ` y ocurri${d.acc.accidentes === 1 ? "ó" : "eron"} ${plural(d.acc.accidentes, "accidente", "accidentes")} de trabajo` : " y no hubo accidentes de trabajo"}.`
      : `No hubo días perdidos por reposo médico${d.acc?.accidentes ? `, aunque ocurri${d.acc.accidentes === 1 ? "ó" : "eron"} ${plural(d.acc.accidentes, "accidente", "accidentes")} de trabajo` : " ni accidentes de trabajo"}.`,
  ].filter(Boolean).join(" ");

  const h = { elige, baraja, azar };
  const secciones = {
    poblacion, uso, evaluaciones, dependencias, morbilidad, causas, ausentismo, reposos, accidentes, referencias, aptitud,
    ...analisisCuadros(d, h),
    ...analisisAnexo(d, h, d.causas, d.entes ?? {}),
    ...analisisIntegral(d, h, t, capitulos),
  };
  return {
    secciones: Object.fromEntries(Object.entries(secciones).map(([k, v]) => [k, contraer(v)])) as Analisis["secciones"],
    hallazgos: hallazgos.map(contraer),
    resumen: contraer(resumen),
    conclusion: contraer(conclusion),
  };
}
