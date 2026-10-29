// Análisis del informe de vigilancia: un párrafo por cuadro y una conclusión final, redactados con los datos del período.
// La redacción cambia entre informes (empresa, período y variante eligen las frases), para que no parezcan plantillas.
// Puro: corre en el servidor (informe impreso) y en el navegador (botón «Otra redacción» del editor).

import type { Reporte } from "@/lib/reportes";
import { MESES } from "@/lib/periodos";

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
  acc: { accidentes: number; conTiempoPerdido: number; diasPerdidos: number; ifn: number | null; is: number | null; aTiempo: number | null; porDeclarar: number } | null;
  causas: Record<string, string>;
  aptitudes: Record<string, string>;
};

export const SECCIONES_ANALISIS = [
  ["poblacion", "Población"],
  ["uso", "Uso del servicio médico"],
  ["morbilidad", "Morbilidad"],
  ["ausentismo", "Ausentismo"],
  ["accidentes", "Accidentes y enfermedades ocupacionales"],
  ["referencias", "Referencias"],
  ["aptitud", "Aptitud"],
] as const;
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

// ---------- formato
const n0 = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 0 });
const n1 = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 1 });
const n2 = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
const p = (parte: number, total: number) => (total ? (parte * 100) / total : 0);
const pc = (parte: number, total: number) => `${n1(p(parte, total))} %`;
const plural = (n: number, uno: string, varios: string) => `${n0(n)} ${n === 1 ? uno : varios}`;
const minus = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const unir = (partes: string[]) => (partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`);
// Etiqueta del período dentro de una frase: «el I trimestre 2026», «el trimestre febrero – abril 2026», «el período del 01/01/2026 al…»
const etq = (e: string) => {
  const corta = e.replace(/ \(.*\)$/, "");
  return corta.startsWith("Del ") ? `período ${minus(corta)}` : /^(Trimestre|Año|Período)\b/.test(corta) ? minus(corta) : corta;
};
// «a el» → «al», «de el» → «del» (las etiquetas de período se insertan con artículo)
const contraer = (t: string) => t.replace(/\b([Aa]) el /g, "$1l ").replace(/\b([Dd]e) el /g, "$1l ");
const humano = (codigo: string) => codigo.replace(/_/g, " ");
// Diagnóstico para el texto: «Lumbago (M54.5)», o solo el código si no hay descripción
const dx = (c: { cie10: string; descripcion: string | null }) => (c.descripcion && c.descripcion !== c.cie10 ? `${c.descripcion} (${c.cie10})` : c.cie10);
const mesLargo = (aaaamm: string) => MESES[Number(aaaamm.slice(5, 7)) - 1] ?? aaaamm;

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
    if (!pob) return "No hay trabajadores efectivos registrados en el período; sin población no se calculan tasas ni prevalencias.";
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
    if (!c.total) return elige(["No se registraron consultas en el período.", "En el período no hubo atenciones en el servicio médico."]);
    const cobertura = pob ? p(c.pacientes, pob) : 0;
    const motivo = [...c.por_motivo].sort((a, b) => b.n - a.n)[0];
    const frases = [
      elige([
        `El servicio médico realizó ${plural(c.total, "consulta", "consultas")} a ${plural(c.pacientes, "paciente", "pacientes")}${pob ? `, una cobertura del ${n1(cobertura)} % de la población` : ""}.`,
        `Se atendieron ${plural(c.total, "consulta", "consultas")} en el período, correspondientes a ${plural(c.pacientes, "trabajador", "trabajadores")}${pob ? ` (${n1(cobertura)} % de la plantilla)` : ""}.`,
        `En el período se registran ${plural(c.total, "atención", "atenciones")}${pob ? `; el ${n1(cobertura)} % de los trabajadores acudió al menos una vez` : ""}.`,
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
    if (!m.total) return elige(["No se registraron diagnósticos en el período.", "En el período no hubo diagnósticos clínicos registrados."]);
    const prevalencia = pob ? p(m.pacientes ?? 0, pob) : 0;
    const frases = [
      elige([
        `Se registraron ${plural(m.total, "diagnóstico", "diagnósticos")}${pob ? `, con una prevalencia de ${n1(prevalencia)} % de trabajadores afectados` : ""}.`,
        `La morbilidad del período suma ${plural(m.total, "diagnóstico", "diagnósticos")}${m.pacientes ? ` en ${plural(m.pacientes, "paciente", "pacientes")}` : ""}${pob ? ` (${n1(prevalencia)} % de la población)` : ""}.`,
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
    const causa = m.primeras_causas[0];
    if (causa) frases.push(elige([
      `La primera causa individual es ${dx(causa)}, con ${plural(causa.n, "caso", "casos")}.`,
      `Entre los diagnósticos específicos destaca ${dx(causa)}, con ${plural(causa.n, "caso", "casos")}.`,
    ]));
    const ocup = m.por_origen.ocupacional ?? 0;
    if (ocup) frases.push(elige([
      `${mayus(plural(ocup, "diagnóstico fue calificado", "diagnósticos fueron calificados"))} como de origen ocupacional (${pc(ocup, m.total)}), lo que obliga a su investigación y declaración.`,
      `Hay ${plural(ocup, "diagnóstico", "diagnósticos")} de posible origen ocupacional que requieren investigación y, si se confirman, declaración ante el INPSASEL.`,
    ]));
    const cmp = cambio(t.diagnosticos, ant?.diagnosticos, ant ? `el ${etq(ant.etiqueta)}` : "", "el número de diagnósticos");
    if (cmp && azar() > 0.3) frases.push(cmp);
    return [frases[0], ...baraja(frases.slice(1))].join(" ");
  })();

  // ---------- Ausentismo
  const ausentismo = (() => {
    const a = r.ausentismo;
    if (!a.dias_perdidos) return elige([
      "No se registraron días de reposo médico en el período: el ausentismo por causa médica fue nulo.",
      "Sin reposos médicos en el período; el indicador de ausentismo se mantiene en cero.",
    ]);
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
    const pc1 = a.primeras_causas?.[0];
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
    if (!a || !a.accidentes) frases.push(elige([
      "No se registraron accidentes de trabajo en el período, resultado favorable que debe sostenerse con la inspección y la formación continua.",
      "El período cierra sin accidentes laborales registrados.",
      "No hubo accidentes de trabajo en el lapso evaluado.",
    ]));
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
      ? elige([`Se diagnosticó ${plural(eo, "caso", "casos")} de enfermedad ocupacional, que requiere${eo === 1 ? "" : "n"} investigación, declaración y reubicación si corresponde.`, `En el período se calificaron ${plural(eo, "enfermedad ocupacional", "enfermedades ocupacionales")}.`])
      : elige(["No se calificaron enfermedades ocupacionales en el período.", "Sin nuevos casos de enfermedad ocupacional."]));
    return frases.join(" ");
  })();

  // ---------- Referencias
  const referencias = (() => {
    const ref = r.referencias;
    if (!ref?.total) return elige(["No se emitieron referencias a especialistas en el período.", "Todas las atenciones se resolvieron en el servicio, sin referencias a especialistas."]);
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
    if (!total) return elige(["No se emitieron certificados de aptitud en el período.", "Sin evaluaciones con calificación de aptitud en el período."]);
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

  const secciones = { poblacion, uso, morbilidad, ausentismo, accidentes, referencias, aptitud };
  return {
    secciones: Object.fromEntries(Object.entries(secciones).map(([k, v]) => [k, contraer(v)])) as Analisis["secciones"],
    hallazgos: hallazgos.map(contraer),
    resumen: contraer(resumen),
    conclusion: contraer(conclusion),
  };
}
