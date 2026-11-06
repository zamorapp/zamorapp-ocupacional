// Evaluación de riesgos psicosociales con el CoPsoQ-istas21, VERSIÓN CORTA (ISTAS, marzo 2010).
// Fuente: «Evaluación de riesgos psicosociales. Versión corta del método. Para pequeñas empresas con menos de 25
// trabajadoras o trabajadores y auto-evaluación», ISTAS 2010 (copsoq.istas21.net/ficheros/documentos/vcorta_CopSoqv1-5.pdf),
// revisado el 05-nov-2026. Versión española del CoPsoQ © ISTAS 2002, 2010; CoPsoQ original danés © NRCWE 2005.
// Licencia: uso gratuito con finalidad preventiva, participación (acuerdo con el Comité), anonimato y SIN MODIFICAR el
// cuestionario: por eso las preguntas, opciones y cortes son fijos aquí (no se editan en Configuración) y la base
// (20261030904000) calcula lo mismo en puntajes_istas21_corta() y nivel_istas21_corta().

export const METODO_PSICOSOCIAL = {
  nombre: "CoPsoQ-istas21 · versión corta",
  cita: "Instituto Sindical de Trabajo, Ambiente y Salud (ISTAS). Evaluación de riesgos psicosociales: versión corta del método CoPsoQ-istas21. Barcelona, 2010. Adaptación española del Cuestionario Psicosocial de Copenhague (CoPsoQ © NRCWE).",
  licencia: "Instrumento de dominio público elaborado por ISTAS, usado sin modificaciones, con finalidad preventiva, de forma anónima y con el acuerdo del Comité de Seguridad y Salud Laboral. No se cobra por el cuestionario.",
} as const;

// Roles del servicio que crean y manejan evaluaciones (la base exige lo mismo)
export const ROLES_PSICOSOCIAL = ["administrador", "gerente_medico", "medico", "coordinador_sst"];

export type Opciones = readonly string[];
const FRECUENCIA: Opciones = ["Siempre", "Muchas veces", "Algunas veces", "Sólo alguna vez", "Nunca"];
const PREOCUPACION: Opciones = ["Muy preocupado", "Bastante preocupado", "Más o menos preocupado", "Poco preocupado", "Nada preocupado"];
const DOMESTICO: Opciones = [
  "Soy la/el principal responsable y hago la mayor parte de las tareas familiares y domésticas",
  "Hago aproximadamente la mitad de las tareas familiares y domésticas",
  "Hago más o menos una cuarta parte de las tareas familiares y domésticas",
  "Sólo hago tareas muy puntuales",
  "No hago ninguna o casi ninguna de estas tareas",
];

// nota: aclaración fuera de la pregunta (el texto del método no se cambia)
export type Pregunta = { n: number; texto: string; opciones: Opciones; invertida?: boolean; nota?: string };
export type Apartado = {
  n: number;
  nombre: string;
  corto: string;
  intro?: string;
  preguntas: Pregunta[];
  maximo: number;
  // Intervalos de la población ocupada de referencia (tercios): [desde, hasta]
  verde: [number, number];
  amarillo: [number, number];
  rojo: [number, number];
  que: string; // qué mide, en palabras simples
  medidas: string[]; // medidas preventivas que propone el manual (punto de partida para el plan)
};

const p = (n: number, texto: string, opciones: Opciones = FRECUENCIA, invertida = false): Pregunta => ({ n, texto, opciones, invertida });

export const APARTADOS: Apartado[] = [
  {
    n: 1, nombre: "Exigencias psicológicas", corto: "Exigencias",
    preguntas: [
      p(1, "¿Tienes que trabajar muy rápido?"),
      p(2, "¿La distribución de tareas es irregular y provoca que se te acumule el trabajo?"),
      p(3, "¿Tienes tiempo de llevar al día tu trabajo?", FRECUENCIA, true),
      p(4, "¿Te cuesta olvidar los problemas del trabajo?"),
      p(5, "¿Tu trabajo, en general, es desgastador emocionalmente?"),
      p(6, "¿Tu trabajo requiere que escondas tus emociones?"),
    ],
    maximo: 24, verde: [0, 7], amarillo: [8, 11], rojo: [12, 24],
    que: "Trabajar rápido o de forma irregular, acumulación de tareas y desgaste emocional.",
    medidas: [
      "Ajustar la cantidad de trabajo al tiempo disponible para hacerlo (plantilla, distribución de tareas).",
      "Dar formación para manejar de forma saludable las exigencias emocionales del puesto.",
    ],
  },
  {
    n: 2, nombre: "Trabajo activo y posibilidades de desarrollo", corto: "Trabajo activo",
    preguntas: [
      p(7, "¿Tienes influencia sobre la cantidad de trabajo que se te asigna?"),
      p(8, "¿Se tiene en cuenta tu opinión cuando se te asignan tareas?"),
      p(9, "¿Tienes influencia sobre el orden en el que realizas las tareas?"),
      p(10, "¿Puedes decidir cuándo haces un descanso?"),
      p(11, "Si tienes algún asunto personal o familiar ¿puedes dejar tu puesto de trabajo al menos una hora sin tener que pedir un permiso especial?"),
      p(12, "¿Tu trabajo requiere que tengas iniciativa?"),
      p(13, "¿Tu trabajo permite que aprendas cosas nuevas?"),
      p(14, "¿Te sientes comprometido con tu profesión?"),
      p(15, "¿Tienen sentido tus tareas?"),
      p(16, "¿Hablas con entusiasmo de tu empresa a otras personas?"),
    ],
    maximo: 40, verde: [26, 40], amarillo: [19, 25], rojo: [0, 18],
    que: "Influencia sobre el propio trabajo, control de los tiempos, aprender y darle sentido a las tareas.",
    medidas: [
      "Aumentar las oportunidades de aplicar y desarrollar habilidades; evitar el trabajo monótono y repetitivo.",
      "Dar más control sobre los tiempos de trabajo (pausas, descansos, permisos, vacaciones).",
      "Hacer partícipe al trabajador de las decisiones sobre sus tareas y sus condiciones de trabajo.",
    ],
  },
  {
    n: 3, nombre: "Inseguridad sobre el futuro", corto: "Inseguridad",
    intro: "En estos momentos, ¿estás preocupado/a…",
    preguntas: [
      { ...p(17, "…por lo difícil que sería encontrar otro trabajo en el caso de que te quedaras en paro?", PREOCUPACION), nota: "«En paro» quiere decir sin empleo." },
      p(18, "…por si te cambian de tareas contra tu voluntad?", PREOCUPACION),
      p(19, "…por si te cambian el horario (turno, días de la semana, horas de entrada y salida) contra tu voluntad?", PREOCUPACION),
      p(20, "…por si te varían el salario (que no te lo actualicen, que te lo bajen, que introduzcan el salario variable, que te paguen en especie, etc.)?", PREOCUPACION),
    ],
    maximo: 16, verde: [0, 4], amarillo: [5, 9], rojo: [10, 16],
    que: "Preocupación por la estabilidad del empleo y por cambios no deseados de tareas, horario o salario.",
    medidas: [
      "Garantizar la estabilidad en el empleo y en las condiciones de trabajo (jornada, sueldo).",
      "Informar con antelación y acordar los cambios de tareas, turnos u horarios.",
    ],
  },
  {
    n: 4, nombre: "Apoyo social y calidad de liderazgo", corto: "Apoyo y liderazgo",
    preguntas: [
      p(21, "¿Sabes exactamente qué margen de autonomía tienes en tu trabajo?"),
      p(22, "¿Sabes exactamente qué tareas son de tu responsabilidad?"),
      p(23, "¿En tu empresa se te informa con suficiente antelación de los cambios que pueden afectar tu futuro?"),
      p(24, "¿Recibes toda la información que necesitas para realizar bien tu trabajo?"),
      p(25, "¿Recibes ayuda y apoyo de tus compañeras o compañeros?"),
      p(26, "¿Recibes ayuda y apoyo de tu inmediato o inmediata superior?"),
      p(27, "¿Tu puesto de trabajo se encuentra aislado del de tus compañeros/as?", FRECUENCIA, true),
      p(28, "En el trabajo, ¿sientes que formas parte de un grupo?"),
      p(29, "¿Tus actuales jefes inmediatos planifican bien el trabajo?"),
      p(30, "¿Tus actuales jefes inmediatos se comunican bien con los trabajadores y trabajadoras?"),
    ],
    maximo: 40, verde: [32, 40], amarillo: [25, 31], rojo: [0, 24],
    que: "Claridad del rol, información a tiempo, apoyo de compañeros y jefes, trabajo aislado y calidad del mando.",
    medidas: [
      "Facilitar el apoyo entre el personal y eliminar el trabajo aislado.",
      "Definir con claridad los puestos, las tareas asignadas y el margen de autonomía; informar a tiempo.",
      "Formar a los mandos en planificación y comunicación; eliminar la competitividad entre compañeros o áreas.",
    ],
  },
  {
    n: 5, nombre: "Doble presencia", corto: "Doble presencia",
    preguntas: [
      p(31, "¿Qué parte del trabajo familiar y doméstico haces tú?", DOMESTICO),
      p(32, "Si faltas algún día de casa, ¿las tareas domésticas que realizas se quedan sin hacer?"),
      p(33, "Cuando estás en la empresa ¿piensas en las tareas domésticas y familiares?"),
      p(34, "¿Hay momentos en los que necesitarías estar en la empresa y en casa a la vez?"),
    ],
    maximo: 16, verde: [0, 2], amarillo: [3, 6], rojo: [7, 16],
    que: "Carga de responder a la vez a las exigencias del trabajo y de la casa.",
    medidas: [
      "Permitir compatibilizar la vida laboral y familiar (horarios previsibles, flexibilidad, permisos).",
    ],
  },
  {
    n: 6, nombre: "Estima", corto: "Estima",
    preguntas: [
      p(35, "Mis superiores me dan el reconocimiento que merezco"),
      p(36, "En las situaciones difíciles en el trabajo recibo el apoyo necesario"),
      p(37, "En mi trabajo me tratan injustamente", FRECUENCIA, true),
      p(38, "Si pienso en todo el trabajo y esfuerzo que he realizado, el reconocimiento que recibo en mi trabajo me parece adecuado"),
    ],
    maximo: 16, verde: [13, 16], amarillo: [10, 12], rojo: [0, 9],
    que: "Reconocimiento, respeto, apoyo en momentos difíciles y trato justo.",
    medidas: [
      "Garantizar el respeto y el trato justo; reconocer el trabajo y el esfuerzo.",
      "Eliminar toda discriminación por sexo, edad o etnia.",
    ],
  },
];

export const TOTAL_PREGUNTAS = 38;

// Opción marcada (0 = primera … 4 = última) → código del método: 4 − opción, salvo las preguntas invertidas (3, 27, 37)
const INVERTIDAS = new Set(APARTADOS.flatMap((a) => a.preguntas.filter((q) => q.invertida).map((q) => q.n)));
export function codigo(pregunta: number, opcion: number) {
  return INVERTIDAS.has(pregunta) ? opcion : 4 - opcion;
}

// Puntaje de cada apartado (6 números) a partir de las 38 opciones marcadas; null si falta alguna
export function puntajes(respuestas: (number | null | undefined)[]): number[] | null {
  if (respuestas.length !== TOTAL_PREGUNTAS || respuestas.some((r) => !Number.isInteger(r) || (r as number) < 0 || (r as number) > 4)) return null;
  return APARTADOS.map((a) => a.preguntas.reduce((s, q) => s + codigo(q.n, respuestas[q.n - 1] as number), 0));
}

export type Nivel = 0 | 1 | 2; // verde, amarillo, rojo
export function nivel(apartado: number, puntaje: number): Nivel {
  const a = APARTADOS[apartado - 1];
  if (puntaje >= a.verde[0] && puntaje <= a.verde[1]) return 0;
  if (puntaje >= a.amarillo[0] && puntaje <= a.amarillo[1]) return 1;
  return 2;
}

// Nivel del PROMEDIO de un grupo (decimal): los cortes del método son enteros, así que un promedio que cae entre dos
// intervalos (p. ej. 7,5 entre verde 0-7 y amarillo 8-11) va al más cercano. Sirve en apartados que suben o bajan.
export function nivelMedia(apartado: number, media: number): Nivel {
  const a = APARTADOS[apartado - 1];
  if (a.verde[1] < a.rojo[0]) return media <= a.verde[1] + 0.5 ? 0 : media <= a.amarillo[1] + 0.5 ? 1 : 2;
  return media >= a.verde[0] - 0.5 ? 0 : media >= a.amarillo[0] - 0.5 ? 1 : 2;
}

// Riesgo psicosocial global del grupo, en una frase, a partir del nivel promedio de los 6 apartados
export function riesgoGlobal(niveles: Nivel[]): { nivel: Nivel; texto: string } {
  const rojos = niveles.filter((n) => n === 2).length;
  const amarillos = niveles.filter((n) => n === 1).length;
  if (rojos >= 2) return { nivel: 2, texto: "Alto" };
  if (rojos === 1 || amarillos >= 3) return { nivel: 1, texto: "Moderado" };
  return { nivel: 0, texto: "Bajo" };
}

export const NIVELES = [
  { nombre: "Verde", que: "Situación más favorable para la salud", clase: "bg-ok/15 text-ok-texto", barra: "bg-ok", color: "#2f9e5b" },
  { nombre: "Amarillo", que: "Situación intermedia", clase: "bg-aviso/20 text-aviso-texto", barra: "bg-aviso", color: "#e0b100" },
  { nombre: "Rojo", que: "Situación más desfavorable para la salud", clase: "bg-alerta/15 text-alerta-texto", barra: "bg-alerta", color: "#d4413b" },
] as const;

export const rango = (r: [number, number]) => `${r[0]} a ${r[1]}`;

// --- Resultados agregados (los arma la base: resultados_psicosociales) ---
export type Dimension = { apartado: number; verde: number; amarillo: number; rojo: number; media: number };
export type GrupoResultado = { id: string; nombre: string; n: number; dimensiones: Dimension[] };
export type Resultados = {
  total: number; codigos: number; usados: number; minimo: number; suficiente: boolean; abierta?: boolean;
  sin_grupo?: number; dimensiones?: Dimension[]; grupos?: GrupoResultado[];
};

export const porcentaje = (parte: number, total: number) => (total > 0 ? Math.round((parte * 100) / total) : 0);

// Prioridad de intervención como en el método: primero lo que tiene más trabajadores en rojo.
// «Prioritario» = la mitad o más en rojo; «a vigilar» = un tercio o más (más que la población de referencia).
export function prioridadDimension(d: Dimension): { texto: string; clase: string; orden: number } {
  const t = d.verde + d.amarillo + d.rojo;
  const r = t ? d.rojo / t : 0;
  if (r >= 0.5) return { texto: "Prioritario", clase: NIVELES[2].clase, orden: 2 };
  if (r > 1 / 3) return { texto: "A vigilar", clase: NIVELES[1].clase, orden: 1 };
  return { texto: "Favorable", clase: NIVELES[0].clase, orden: 0 };
}

export const ordenarPorRojo = (ds: Dimension[]) =>
  [...ds].sort((a, b) => porcentaje(b.rojo, b.verde + b.amarillo + b.rojo) - porcentaje(a.rojo, a.verde + a.amarillo + a.rojo) || a.apartado - b.apartado);

// Texto sugerido para las conclusiones (lo edita el médico). Nunca nombra personas: solo apartados y puestos agregados.
export function conclusionSugerida(r: Resultados): string {
  if (!r.suficiente || !r.dimensiones) return "";
  const lineas: string[] = [];
  const part = r.codigos > 0 ? ` (${porcentaje(r.usados, r.codigos)} % de los códigos entregados)` : "";
  lineas.push(`Respondieron ${r.total} trabajadores${part}.`);
  const orden = ordenarPorRojo(r.dimensiones);
  const prio = orden.filter((d) => prioridadDimension(d).orden === 2);
  const vigilar = orden.filter((d) => prioridadDimension(d).orden === 1);
  const nombre = (d: Dimension) => `${APARTADOS[d.apartado - 1].nombre.toLowerCase()} (${porcentaje(d.rojo, r.total)} % en rojo)`;
  if (prio.length) lineas.push(`Exposiciones prioritarias: ${prio.map(nombre).join("; ")}.`);
  if (vigilar.length) lineas.push(`A vigilar: ${vigilar.map(nombre).join("; ")}.`);
  if (!prio.length && !vigilar.length) lineas.push("Ningún apartado supera a la población de referencia en la proporción de trabajadores en rojo.");
  const grupos = (r.grupos ?? []).filter((g) => g.id !== "_otros");
  for (const g of grupos) {
    const peor = ordenarPorRojo(g.dimensiones)[0];
    if (peor && prioridadDimension(peor).orden === 2) lineas.push(`En ${g.nombre} destaca ${APARTADOS[peor.apartado - 1].nombre.toLowerCase()} (${porcentaje(peor.rojo, g.n)} % en rojo).`);
  }
  lineas.push("Las medidas preventivas actúan sobre la organización del trabajo (el origen), no sobre las personas, y se acuerdan con el Comité de Seguridad y Salud Laboral.");
  return lineas.join("\n");
}

export type Medida = { id: string; apartado: number; medida: string; responsable: string; plazo: string };

// Código de un solo uso: 8 letras/números sin los que se confunden (0/O, 1/I/L)
export const CODIGO_PSICOSOCIAL = /^[2-9A-HJKMNP-Z]{8}$/;
// Código de ejemplo del modo demo (sin base): abre el cuestionario sin guardar nada
export const CODIGO_DEMO = "K7Q3M9TX";
// Enlace único de la oficina (/c/o/<token>): 32 caracteres hexadecimales (migración 20261030920000)
export const ENLACE_OFICINA = /^[0-9a-f]{32}$/;
export const TOKEN_DEMO = "0123456789abcdef0123456789abcdef";
export const codigoLegible = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
export const normalizarCodigo = (c: string) => c.toUpperCase().replace(/[^0-9A-Z]/g, "");

// Id corto para un puesto o área nueva (la base exige ^[a-z0-9]{1,12}$)
export function idGrupo(existentes: string[]): string {
  for (let i = 1; i < 1000; i++) if (!existentes.includes(`g${i}`)) return `g${i}`;
  return "g999";
}
