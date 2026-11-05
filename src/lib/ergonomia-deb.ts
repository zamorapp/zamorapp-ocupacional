// DEB · Diagnóstico Ergonómico Biomecánico por factores de riesgo (CENEA / epm international ergonomics school).
// Fichas de identificación de peligros (1 a 5) y evaluación rápida de condiciones aceptables (zona verde) e
// inaceptables (zona roja), versión 2-2012, basadas en ISO/TR 12295 e ISO 11228-1/2/3 e ISO 11226.
// Solo tipos de ./ergonomia: el registro del método (METODOS) y las propuestas de hallazgos viven allá.
import type { Departamento, Metodo, Opcion, Pregunta, Respuestas, Resultado, Seccion } from "@/lib/ergonomia";

export type FactorDeb = "lev" | "tra" | "emp" | "rep" | "pos";
export type ZonaDeb = "no" | "verde" | "amarillo" | "rojo";
export type ResultadoFactor = {
  clave: FactorDeb;
  nombre: string;
  zona: ZonaDeb | null; // null = faltan respuestas
  fallas: string[]; // condiciones de zona verde que NO se cumplen
  rojas: string[]; // condiciones de zona roja presentes
  adicionales: string[]; // claves de factores adicionales marcados «Sí»
  especifica: string; // evaluación específica recomendada
};

const SI_NO: Opcion[] = [{ valor: 0, texto: "No" }, { valor: 1, texto: "Sí" }];
// corto: cómo se nombra la condición en el detalle del hallazgo y en el informe
type P = Pregunta & { corto?: string };
const q = (clave: string, texto: string, corto?: string, ayuda?: string): P => ({ clave, texto, opciones: SI_NO, corto, ayuda });

export const NOMBRE_FACTOR: Record<FactorDeb, string> = {
  lev: "Levantamiento de cargas",
  tra: "Transporte de cargas",
  emp: "Empuje y tracción de cargas",
  rep: "Movimientos repetitivos de la extremidad superior",
  pos: "Posturas y movimientos forzados",
};
const ESPECIFICA: Record<FactorDeb, string> = {
  lev: "NIOSH (ecuación de levantamiento, ISO 11228-1)",
  tra: "Masa acumulada y NIOSH del levantamiento (ISO 11228-1)",
  emp: "KIM-PP de la BAuA (ISO 11228-2)",
  rep: "OCRA Checklist (ISO 11228-3)",
  pos: "REBA (cuerpo entero) o RULA (miembro superior), ISO 11226",
};

// ── Identificación (fichas 1 a 5) ──
const ID: Record<FactorDeb, P[]> = {
  lev: [
    q("id_lev1", "¿Se deben levantar, sostener y depositar objetos manualmente en el puesto?"),
    q("id_lev2", "¿Alguno de los objetos pesa 3 kg o más?"),
    q("id_lev3", "¿El levantamiento es habitual en el turno (por lo menos una vez)?"),
  ],
  tra: [q("id_tra1", "¿Se levanta o baja a mano una carga de 3 kg o más que se transporta más de 1 metro?")],
  emp: [
    q("id_emp1", "¿La tarea requiere empujar o arrastrar un objeto con el cuerpo de pie o caminando?"),
    q("id_emp2", "¿El objeto tiene ruedas o rodillos (carro, jaula, carretilla, traspaleta) o se desliza sin ruedas?"),
    q("id_emp3", "¿El empuje o arrastre es habitual en el turno (por lo menos una vez)?"),
  ],
  rep: [
    q("id_rep1", "¿La tarea es por ciclos, o se repiten los mismos gestos de hombro, codo, muñeca o mano más de la mitad del tiempo?"),
    q("id_rep2", "¿La tarea repetitiva dura al menos 1 hora de la jornada?"),
  ],
  pos: [
    q("id_pos1", "¿Hay posturas estáticas (mantenidas 4 segundos o más) del tronco o de las extremidades, aunque sea con poca fuerza?"),
    q("id_pos2", "¿Hay posturas dinámicas (movimientos) forzadas del tronco, los brazos, la cabeza o el cuello?"),
  ],
};

// ── Zona verde: TODAS «Sí» = aceptable ──
const VERDE: Partial<Record<FactorDeb, P[]>> = {
  lev: [
    q("v_lev_a", "¿Todas las cargas levantadas pesan 10 kg o menos?", "cargas de más de 10 kg"),
    q("v_lev_b", "¿Carga de 3 a 5 kg con 5 levantamientos/min o menos, o de 5 a 10 kg con 1 levantamiento/min o menos?", "peso y frecuencia por encima de lo aceptable"),
    q("v_lev_c", "¿El desplazamiento vertical se hace entre la cadera y los hombros?", "levantamiento por debajo de la cadera o sobre los hombros"),
    q("v_lev_d", "¿El tronco está erguido, sin flexión ni rotación?", "tronco flexionado o girado al levantar"),
    q("v_lev_e", "¿La carga se mantiene muy cerca del cuerpo (10 cm o menos del torso)?", "carga alejada del cuerpo"),
  ],
  tra: [
    q("v_tra_a", "¿La masa acumulada está bajo el límite de su distancia?", "masa acumulada transportada por encima del límite",
      "Hasta 10 m: menos de 10.000 kg en 8 h, 1.500 kg en 1 h y 30 kg en 1 min. Más de 10 m: menos de 6.000 kg en 8 h, 750 kg en 1 h y 15 kg en 1 min."),
    q("v_tra_c", "¿El transporte se hace sin posturas forzadas?", "posturas forzadas durante el transporte"),
  ],
  emp: [
    q("v_emp_a", "¿La fuerza es menor que «moderada» (Borg < 3), o no pasa de 30 N sostenida y 100 N en picos, o de 50 N si es menos de 1 vez cada 5 min y menos de 50 m?", "fuerza de empuje o arrastre alta"),
    q("v_emp_b", "¿La fuerza se aplica a una altura de agarre entre la cadera y la mitad del pecho?", "altura de agarre inadecuada"),
    q("v_emp_c", "¿Se empuja o arrastra con el tronco erguido (sin torsión ni flexión)?", "tronco flexionado o girado al empujar"),
    q("v_emp_d", "¿El empuje o arrastre dura menos de 8 horas al día?", "empuje o arrastre de 8 horas o más"),
  ],
  rep: [
    q("v_rep_a", "¿Los brazos están inactivos más del 50 % del tiempo repetitivo (caminar con manos vacías, leer, control visual, esperar la máquina)?", "brazos activos casi todo el tiempo"),
    q("v_rep_b", "¿Ningún brazo trabaja con el codo casi a la altura del hombro más del 10 % del tiempo?", "codo a la altura del hombro más del 10 % del tiempo"),
    q("v_rep_c", "¿La fuerza es ligera, o si es moderada no pasa del 25 % del tiempo repetitivo?", "fuerza moderada más del 25 % del tiempo"),
    q("v_rep_d", "¿No hay picos de fuerza (más que «moderada» en la escala de Borg)?", "picos de fuerza"),
    q("v_rep_e", "¿Hay pausas de al menos 8 minutos cada 2 horas?", "sin pausas de 8 min cada 2 horas"),
    q("v_rep_f", "¿El trabajo repetitivo dura menos de 8 horas al día?", "trabajo repetitivo de 8 horas o más"),
  ],
};
const VERDE_POS_EST: P[] = [
  q("v_pe_a", "Tronco erguido, o flexión/extensión de 20° o menos", "tronco inclinado más de 20° (estático)"),
  q("v_pe_b", "Cuello recto, o flexión/extensión de 25° o menos", "cuello flexionado más de 25° (estático)"),
  q("v_pe_c", "Cabeza recta, o inclinación lateral de 25° o menos", "cabeza inclinada más de 25° (estático)"),
  q("v_pe_d", "Brazo sin apoyo con flexión de 20° o menos", "brazo sin apoyo elevado más de 20°"),
  q("v_pe_e", "Brazo con apoyo con flexión de 60° o menos", "brazo con apoyo elevado más de 60°"),
  q("v_pe_f", "El codo hace flexo-extensiones o prono-supinaciones no extremas", "codo en posiciones extremas"),
  q("v_pe_g", "Muñeca neutra, sin desviaciones extremas (flexión, extensión, radial o cubital)", "muñeca en desviación extrema"),
  q("v_pe_h", "Sin flexiones extremas de rodilla", "rodillas en flexión extrema"),
  q("v_pe_i", "Sin dorsiflexión ni flexión plantar extrema del tobillo", "tobillos en posición extrema"),
  q("v_pe_j", "Sin posturas de rodillas ni en cuclillas", "trabajo de rodillas o en cuclillas"),
  q("v_pe_k", "Si trabaja sentado, la rodilla está entre 90° y 135° (si no trabaja sentado, marque Sí)", "rodilla sentado fuera de 90°–135°"),
];
const VERDE_POS_DIN: P[] = [
  q("v_pd_a", "Tronco erguido, o flexiones/extensiones de 20° o menos", "tronco con flexiones de más de 20° (movimiento)"),
  q("v_pd_b", "Tronco erguido, o inclinación lateral o torsión de 10° o menos", "tronco con torsión o inclinación de más de 10°"),
  q("v_pd_c", "Cabeza recta, o inclinación lateral de 10° o menos", "cabeza con inclinación de más de 10°"),
  q("v_pd_d", "Cabeza recta, o torsión del cuello de 45° o menos", "cuello con torsión de más de 45°"),
  q("v_pd_e", "Cuello recto, o flexión entre 0° y 40°", "cuello en flexión de más de 40°"),
  q("v_pd_f", "Brazos neutros, o flexión/abducción de 20° o menos", "brazos elevados más de 20° (movimiento)"),
];

// ── Zona roja: ALGUNA «Sí» = inaceptable ──
const ROJA: Partial<Record<FactorDeb, P[]>> = {
  lev: [
    q("r_lev_a", "¿Las manos están a más de 175 cm de altura o por debajo del nivel del suelo?", "manos a más de 175 cm o bajo el suelo"),
    q("r_lev_b", "¿El desplazamiento vertical supera 175 cm?", "recorrido vertical de más de 175 cm"),
    q("r_lev_c", "¿La distancia horizontal supera 63 cm (fuera del alcance con el brazo estirado)?", "carga a más de 63 cm del cuerpo"),
    q("r_lev_d", "¿El ángulo de asimetría (giro) supera 135°?", "giro de más de 135°"),
    q("r_lev_e", "¿Más de 15 levantamientos/min en duración corta (hasta 60 min seguidos y luego 60 min de tareas ligeras)?", "más de 15 levantamientos/min (duración corta)"),
    q("r_lev_f", "¿Más de 12 levantamientos/min en duración media (hasta 120 min seguidos y luego 30 min de tareas ligeras)?", "más de 12 levantamientos/min (duración media)"),
    q("r_lev_g", "¿Más de 8 levantamientos/min en duración larga?", "más de 8 levantamientos/min (duración larga)"),
    q("r_lev_h", "¿La pueden hacer mujeres de 18 a 45 años y la carga pesa más de 20 kg?", "más de 20 kg con mujeres de 18 a 45 años"),
    q("r_lev_i", "¿La pueden hacer mujeres menores de 18 o mayores de 45 años y la carga pesa más de 15 kg?", "más de 15 kg con mujeres menores de 18 o mayores de 45"),
    q("r_lev_j", "¿Solo la hacen hombres de 18 a 45 años y la carga pesa más de 25 kg?", "más de 25 kg con hombres de 18 a 45 años"),
    q("r_lev_k", "¿Solo la hacen hombres menores de 18 o mayores de 45 años y la carga pesa más de 20 kg?", "más de 20 kg con hombres menores de 18 o mayores de 45"),
  ],
  tra: [
    q("r_tra_a", "¿Masa acumulada de más de 10.000 kg en 8 horas, a menos de 20 metros?", "más de 10.000 kg en 8 h a menos de 20 m"),
    q("r_tra_b", "¿Masa acumulada de más de 6.000 kg en 8 horas, a 20 metros o más?", "más de 6.000 kg en 8 h a 20 m o más"),
  ],
  emp: [
    q("r_emp_a", "¿Fuerza «muy intensa» (Borg 8 o más), o para iniciar 360 N o más (hombres) / 240 N o más (mujeres), o para mantener 250 N o más (hombres) / 150 N o más (mujeres)?", "fuerza de empuje muy intensa"),
    q("r_emp_b", "¿La fuerza se aplica a una altura de agarre de más de 150 cm o de menos de 60 cm?", "agarre a más de 150 cm o a menos de 60 cm"),
    q("r_emp_c", "¿Se empuja o arrastra con el tronco flexionado o en torsión?", "tronco flexionado o girado al empujar"),
    q("r_emp_d", "¿El empuje o arrastre dura más de 8 horas al día?", "empuje o arrastre de más de 8 horas"),
  ],
  rep: [
    q("r_rep_a", "¿Las acciones de una extremidad son tan rápidas que no se pueden contar?", "acciones tan rápidas que no se pueden contar"),
    q("r_rep_b", "¿Uno o ambos brazos trabajan con el codo casi a la altura del hombro la mitad del tiempo o más?", "codo a la altura del hombro la mitad del tiempo"),
    q("r_rep_c", "¿Hay picos de fuerza («intensa» o más en Borg) el 5 % del tiempo o más?", "picos de fuerza intensa"),
    q("r_rep_d", "¿Agarre de precisión con los dedos más del 80 % del tiempo?", "agarre de precisión más del 80 % del tiempo"),
    q("r_rep_e", "¿En un turno de 6 horas o más hay una sola pausa o ninguna?", "una sola pausa o ninguna en 6 horas"),
    q("r_rep_f", "¿El trabajo repetitivo supera 8 horas en el turno?", "trabajo repetitivo de más de 8 horas"),
  ],
};

// ── Factores adicionales: «Sí» = alerta con su propia medida ──
type Adicional = P & { medida: string; departamento: Departamento };
const ad = (clave: string, texto: string, corto: string, departamento: Departamento, medida: string): Adicional =>
  ({ ...q(clave, texto, corto), medida, departamento });
const ADICIONALES_LT: Adicional[] = [
  ad("a_lt_temp", "¿Hay temperaturas bajas o altas?", "temperaturas extremas", "ingenieria", "Controlar la temperatura del área (ventilación, extracción, climatización) o dar ropa adecuada y pausas de recuperación."),
  ad("a_lt_suelo", "¿El suelo es resbaladizo, desigual o inestable?", "suelo resbaladizo o desigual", "ingenieria", "Reparar y nivelar el piso; superficie antideslizante y limpieza de derrames."),
  ad("a_lt_circ", "¿Está restringida la libre circulación en el puesto?", "circulación restringida", "operaciones", "Despejar y demarcar pasillos; reordenar el área para moverse sin obstáculos."),
  ad("a_lt_tam", "¿El tamaño del objeto obstaculiza la visibilidad o el movimiento?", "objeto que tapa la vista", "operaciones", "Fraccionar la carga en unidades más pequeñas o usar ayudas de transporte."),
  ad("a_lt_cg", "¿El centro de gravedad de la carga es inestable (líquidos o cosas que se mueven dentro)?", "carga inestable", "ingenieria", "Envases con divisiones o tapas que inmovilicen el contenido; carros para líquidos."),
  ad("a_lt_bordes", "¿La carga tiene bordes afilados, partes sobresalientes o protuberancias?", "carga con bordes afilados", "sst", "Guantes de protección adecuados y embalaje que cubra bordes y salientes."),
  ad("a_lt_frio", "¿El contacto con la superficie es frío?", "superficie fría al tacto", "sst", "Guantes térmicos que permitan buen agarre."),
  ad("a_lt_cal", "¿El contacto con la superficie es caliente?", "superficie caliente al tacto", "sst", "Guantes de protección térmica y tiempo de enfriamiento antes de manipular."),
  ad("a_lt_8h", "¿El levantamiento o transporte dura más de 8 horas al día?", "manipulación de más de 8 horas", "rrhh", "Rotar al personal para que nadie manipule cargas más de 8 horas al día."),
];
const ADICIONALES_EMP: Adicional[] = [
  ad("a_e_suelo", "¿El suelo es resbaladizo, inestable, irregular, en pendiente, con grietas o roto?", "suelo en mal estado para empujar", "ingenieria", "Reparar el piso, eliminar desniveles y grietas; superficie lisa y antideslizante en las rutas de carros."),
  ad("a_e_despl", "¿Hay restricciones o limitaciones para desplazarse?", "restricciones para desplazarse", "operaciones", "Despejar las rutas de carros y definir recorridos sin obstáculos."),
  ad("a_e_rampa", "¿Hay rampas o cuestas con mucha pendiente?", "rampas con mucha pendiente", "ingenieria", "Suavizar pendientes o usar carros motorizados o con freno en las rampas."),
  ad("a_e_temp", "¿La temperatura ambiental no es adecuada (frío o calor)?", "temperatura inadecuada", "ingenieria", "Controlar la temperatura del área o dar ropa adecuada y pausas de recuperación."),
  ad("a_e_espacio", "¿Los espacios son confinados o insuficientes para girar (puertas estrechas, etc.)?", "espacios estrechos para maniobrar", "ingenieria", "Ampliar pasos y puertas o usar carros de menor tamaño y ruedas giratorias."),
  ad("a_e_vis", "¿El objeto limita la visibilidad u obstaculiza el movimiento?", "objeto que tapa la vista", "operaciones", "Reducir la altura de la carga en el carro para ver por encima."),
  ad("a_e_asas", "¿El objeto carece de asas?", "objeto sin asas", "ingenieria", "Colocar asas verticales a la altura entre la cadera y el pecho."),
  ad("a_e_inest", "¿El objeto es inestable?", "objeto inestable", "ingenieria", "Asegurar la carga en el carro (barandas, correas) y no sobrecargarlo."),
  ad("a_e_pelig", "¿El objeto tiene superficies afiladas o salientes que puedan dañar al trabajador?", "objeto con partes peligrosas", "sst", "Proteger bordes y salientes; guantes de protección."),
  ad("a_e_ruedas", "¿Las ruedas están desgastadas, rotas o sin mantenimiento?", "ruedas en mal estado", "ingenieria", "Plan de mantenimiento de ruedas (cambio, lubricación) de carros y traspaletas."),
  ad("a_e_ruedasin", "¿Las ruedas son inadecuadas para las condiciones de trabajo?", "ruedas inadecuadas", "ingenieria", "Cambiar a ruedas de mayor diámetro y material adecuado al piso."),
  ad("a_e_8h", "¿El empuje o tracción se hace más de 8 horas al día?", "empuje de más de 8 horas", "rrhh", "Rotar al personal para limitar el tiempo de empuje y arrastre."),
  ad("a_e_acel", "¿Hay que hacer movimientos acelerados para iniciar, frenar o mover la carga?", "arranques y frenadas bruscas", "ingenieria", "Carros con frenos y ruedas en buen estado; reducir el peso transportado."),
  ad("a_e_detras", "¿Hay que usar las manos por detrás del cuerpo para mover la carga?", "manos por detrás del cuerpo", "rrhh", "Enseñar a empujar de frente en vez de arrastrar con las manos atrás."),
];
export const ADICIONALES: Adicional[] = [...ADICIONALES_LT, ...ADICIONALES_EMP];

// ── Otros riesgos del puesto (complemento del DEB): «Sí» = alerta con su medida ──
// Clasificación de procesos peligrosos de la NT-01-2008 (físicos, químicos, biológicos, psicosociales) y LOPCYMAT art. 59;
// referencias de medición: COVENIN 2254 (calor y frío), 1565 (ruido), 2249 (iluminancia), 2253 (químicos).
export type CategoriaOtro = "fisico" | "quimico" | "biologico" | "psicosocial";
type Otro = Adicional & { s: number; consecuencia: string };
const ot = (clave: string, texto: string, corto: string, departamento: Departamento, s: number, consecuencia: string, medida: string): Otro =>
  ({ ...ad(clave, texto, corto, departamento, medida), s, consecuencia });
export const OTROS: { clave: CategoriaOtro; nombre: string; items: Otro[] }[] = [
  { clave: "fisico", nombre: "Riesgos físicos", items: [
    ot("o_sol", "¿Trabaja al aire libre bajo el sol directo, sobre todo entre las 10 y las 16 horas?", "radiación solar", "sst", 3, "Quemaduras, cáncer de piel, daño ocular y golpe de calor",
      "Sombra en las áreas de trabajo, tareas al sol fuera de 10 a 16 h, ropa de manga larga, sombrero de ala ancha, lentes con filtro UV y protector solar."),
    ot("o_calor", "¿Hay calor intenso (sol, hornos, calderas o poca ventilación) que hace sudar mucho?", "calor intenso", "ingenieria", 4, "Agotamiento y golpe de calor, deshidratación",
      "Medir el estrés térmico (WBGT, COVENIN 2254); ventilación o enfriamiento, agua fresca a mano, pausas a la sombra y aclimatación del personal nuevo."),
    ot("o_frio", "¿Hay frío intenso (cavas, cuartos fríos, lluvia frecuente)?", "frío intenso", "sst", 3, "Hipotermia, lesiones por frío y molestias musculares",
      "Ropa térmica, tiempo de permanencia limitado y pausas en área templada (COVENIN 2254)."),
    ot("o_ruido", "¿Hay que alzar la voz para hablar con alguien a 1 metro?", "ruido alto", "ingenieria", 4, "Pérdida auditiva inducida por ruido y estrés",
      "Medir el ruido (COVENIN 1565); aislar o encerrar la fuente, protectores auditivos y audiometría de los expuestos."),
    ot("o_vibra", "¿Usa herramientas que vibran o va sobre vehículos o maquinaria pesada?", "vibraciones", "ingenieria", 3, "Lesiones de manos y columna por vibración",
      "Herramientas y asientos antivibración, mantenimiento de equipos y límite de tiempo de uso."),
    ot("o_luz", "¿La iluminación es escasa o produce reflejos o deslumbramiento?", "iluminación inadecuada", "ingenieria", 2, "Fatiga visual, cefalea y posturas forzadas del cuello",
      "Medir la iluminancia (COVENIN 2249) y ajustar luminarias; evitar reflejos en pantallas."),
  ] },
  { clave: "quimico", nombre: "Riesgos químicos", items: [
    ot("o_polvo", "¿Hay polvo en el aire (tierra, cemento, harina, madera, sílice)?", "polvo en el ambiente", "ingenieria", 4, "Enfermedades respiratorias por polvo",
      "Humedecer o extraer el polvo en su origen; mascarilla con filtro adecuado (N95 o P100) y vigilancia respiratoria (COVENIN 2253)."),
    ot("o_humo", "¿Hay humo, gases o vapores (combustión, soldadura, escapes, quemas)?", "humo, gases o vapores", "ingenieria", 4, "Irritación e intoxicación respiratoria",
      "Ventilación o extracción localizada; respirador con cartucho adecuado y medición de contaminantes (COVENIN 2253)."),
    ot("o_quim", "¿Manipula sustancias químicas (solventes, plaguicidas, combustibles, limpiadores fuertes)?", "sustancias químicas", "sst", 4, "Dermatitis, quemaduras e intoxicaciones",
      "Fichas de datos de seguridad a mano, guantes y protección ocular adecuados, lavaojos cerca y formación en manejo seguro."),
  ] },
  { clave: "biologico", nombre: "Riesgos biológicos", items: [
    ot("o_bio", "¿Hay contacto con animales, insectos, aguas servidas, desechos o fluidos de personas?", "agentes biológicos", "sst", 3, "Infecciones, picaduras y mordeduras",
      "Vacunas indicadas (tétanos, hepatitis B), guantes y botas, repelente en campo y lavado de manos."),
  ] },
  { clave: "psicosocial", nombre: "Riesgos psicosociales y de organización", items: [
    ot("o_destajo", "¿Se paga por pieza o por meta (a destajo), o las metas de producción son muy exigentes?", "trabajo a destajo o metas exigentes", "rrhh", 3, "Estrés, fatiga y sobreesfuerzo por saltarse pausas",
      "Revisar metas y forma de pago para que permitan las pausas; que el pago por pieza no obligue a trabajar sin descanso (LOPCYMAT art. 59)."),
    ot("o_turnos", "¿Trabaja de noche, en turnos rotativos o en jornadas de más de 8 horas u horas extras frecuentes?", "turnos nocturnos, rotativos o jornadas largas", "rrhh", 3, "Trastornos del sueño, fatiga y estrés",
      "Rotar turnos en sentido horario, descanso suficiente entre turnos, limitar horas extras y evaluar la salud del trabajador nocturno."),
    ot("o_ritmo", "¿El ritmo lo impone una máquina, la línea o el cliente, sin poder parar?", "ritmo impuesto", "operaciones", 3, "Estrés y trastornos musculoesqueléticos",
      "Dar control sobre el ritmo y las pausas; personal de relevo."),
    ot("o_mental", "¿La tarea exige mucha concentración o atención sostenida, o es monótona sin variar en la jornada?", "alta exigencia mental o monotonía", "operaciones", 2, "Fatiga mental y estrés",
      "Pausas cortas frecuentes, variar y rotar tareas, y estudio de carga mental si hace falta."),
    ot("o_aislado", "¿Trabaja solo o lejos de ayuda (por ejemplo, en campo)?", "trabajo aislado", "sst", 3, "Demora en la atención de accidentes o emergencias",
      "Comunicación permanente (radio o teléfono), plan de emergencias y reporte de llegada y salida."),
    ot("o_violencia", "¿Atiende público conflictivo o hay riesgo de agresión o acoso?", "riesgo de agresión o acoso", "rrhh", 3, "Estrés, ansiedad y lesiones por agresión",
      "Protocolo ante agresiones y acoso, formación en manejo de conflictos y apoyo psicológico."),
    ot("o_viajes", "¿Conduce o se traslada por carretera o terreno irregular como parte del trabajo?", "traslados por carretera o en campo", "operaciones", 4, "Accidentes de tránsito y fatiga",
      "Vehículos en buen estado, plan de viaje, pausas en traslados largos y manejo defensivo."),
  ] },
];
const TODOS_OTROS = OTROS.flatMap((c) => c.items);

// Mediciones ambientales en el puesto (opcionales): fuera del rango de referencia = alerta
export const MEDICIONES: (Pregunta & { fuera: (v: number) => boolean; corto: string; medida: string; departamento: Departamento; s: number; consecuencia: string; referencia: string })[] = [
  { clave: "m_temp", texto: "Temperatura del aire", opciones: [], numero: { min: -10, max: 60, unidad: "°C", paso: 0.1 }, referencia: "17 a 26 °C en trabajo sedentario (COVENIN 2254)",
    fuera: (v) => v < 17 || v > 26, corto: "temperatura fuera de 17–26 °C", departamento: "ingenieria", s: 3, consecuencia: "Disconfort térmico y fatiga",
    medida: "Climatizar o ventilar el área y medir el estrés térmico si hay calor (COVENIN 2254)." },
  { clave: "m_humedad", texto: "Humedad relativa", opciones: [], numero: { min: 0, max: 100, unidad: "%" }, referencia: "30 a 70 %",
    fuera: (v) => v < 30 || v > 70, corto: "humedad fuera de 30–70 %", departamento: "ingenieria", s: 2, consecuencia: "Disconfort térmico e irritación de mucosas",
    medida: "Ajustar ventilación, deshumidificación o humidificación del área." },
  { clave: "m_lux", texto: "Iluminancia en el plano de trabajo", opciones: [], numero: { min: 0, max: 5000, unidad: "lux" }, referencia: "300 lux o más en oficinas; según la tarea (COVENIN 2249)",
    fuera: (v) => v < 300, corto: "iluminancia de menos de 300 lux", departamento: "ingenieria", s: 2, consecuencia: "Fatiga visual y posturas forzadas del cuello",
    medida: "Aumentar o reubicar luminarias hasta el nivel de la tarea (COVENIN 2249)." },
  { clave: "m_ruido", texto: "Nivel de ruido", opciones: [], numero: { min: 30, max: 140, unidad: "dBA" }, referencia: "menos de 85 dBA en 8 horas (COVENIN 1565)",
    fuera: (v) => v >= 85, corto: "ruido de 85 dBA o más", departamento: "ingenieria", s: 4, consecuencia: "Pérdida auditiva inducida por ruido",
    medida: "Controlar el ruido en la fuente, protectores auditivos y audiometría de los expuestos (COVENIN 1565)." },
];

/** Otros riesgos y mediciones fuera de rango marcados en la evaluación, por categoría */
export function otrosRiesgos(r: Respuestas): { categoria: string; items: { clave: string; texto: string }[] }[] {
  const res = OTROS.map((c) => ({ categoria: c.nombre, items: c.items.filter((p) => r[p.clave] === 1).map((p) => ({ clave: p.clave, texto: p.corto ?? p.texto })) }));
  const med = MEDICIONES.filter((m) => Number.isFinite(r[m.clave]) && m.fuera(r[m.clave]))
    .map((m) => ({ clave: m.clave, texto: `${m.corto} (medido ${String(r[m.clave]).replace(".", ",")} ${m.numero!.unidad})` }));
  return [...res, { categoria: "Mediciones ambientales", items: med }].filter((c) => c.items.length);
}
export const otroPorClave = (clave: string) => TODOS_OTROS.find((p) => p.clave === clave) ?? MEDICIONES.find((m) => m.clave === clave);

// ── Respuestas ──
const val = (r: Respuestas, k: string) => (Number.isFinite(r[k]) ? r[k] : null);
const respondidas = (r: Respuestas, ps: P[]) => ps.every((p) => val(r, p.clave) !== null);
const conNo = (r: Respuestas, ps: P[]) => ps.filter((p) => val(r, p.clave) === 0);
const conSi = (r: Respuestas, ps: P[]) => ps.filter((p) => val(r, p.clave) === 1);

// Presencia del peligro: levantamiento, empuje y repetitivos exigen todas «Sí»; transporte su única; posturas, alguna
export function presente(f: FactorDeb, r: Respuestas): boolean | null {
  const ps = ID[f];
  if (f === "pos") return conSi(r, ps).length > 0 ? true : respondidas(r, ps) ? false : null;
  if (conNo(r, ps).length) return false;
  return respondidas(r, ps) ? true : null;
}
const verdeDe = (f: FactorDeb, r: Respuestas): P[] =>
  f === "pos" ? [...(val(r, "id_pos1") === 1 ? VERDE_POS_EST : []), ...(val(r, "id_pos2") === 1 ? VERDE_POS_DIN : [])] : VERDE[f] ?? [];
const adicionalesDe = (f: FactorDeb): Adicional[] => (f === "lev" || f === "tra" ? ADICIONALES_LT : f === "emp" ? ADICIONALES_EMP : []);

export function evaluarFactor(f: FactorDeb, r: Respuestas): ResultadoFactor {
  const base = { clave: f, nombre: NOMBRE_FACTOR[f], fallas: [] as string[], rojas: [] as string[], adicionales: [] as string[], especifica: ESPECIFICA[f] };
  const hay = presente(f, r);
  if (hay === null) return { ...base, zona: null };
  if (!hay) return { ...base, zona: "no" };
  const verde = verdeDe(f, r);
  const adicionales = conSi(r, adicionalesDe(f)).map((p) => p.clave);
  if (!respondidas(r, verde)) return { ...base, adicionales, zona: null };
  const fallas = conNo(r, verde).map((p) => p.corto ?? p.texto);
  if (!fallas.length) return { ...base, adicionales, zona: "verde" };
  // Algún «No» en la zona verde: se revisa la zona roja (posturas no tiene zona roja rápida: va a evaluación específica)
  const roja = ROJA[f] ?? [];
  const rojas = conSi(r, roja).map((p) => p.corto ?? p.texto);
  if (rojas.length) return { ...base, fallas, rojas, adicionales, zona: "rojo" };
  if (!respondidas(r, roja)) return { ...base, fallas, adicionales, zona: null };
  return { ...base, fallas, adicionales, zona: "amarillo" };
}

// ── Secciones del formulario (cada una se muestra solo cuando aplica) ──
export const FACTORES: FactorDeb[] = ["lev", "tra", "emp", "rep", "pos"];
const ZONA_SECCION: Record<FactorDeb, Seccion["zona"]> = { lev: "carga", tra: "carga", emp: "carga", rep: "actividad", pos: "tronco" };
function secciones(): Seccion[] {
  const s: Seccion[] = [];
  for (const f of FACTORES) {
    const n = NOMBRE_FACTOR[f];
    s.push({ titulo: `${n}: ¿está presente?`, zona: ZONA_SECCION[f], preguntas: ID[f], grupo: f });
    if (f === "pos") {
      s.push({ titulo: "Posturas estáticas: condiciones aceptables (zona verde)", zona: "tronco", preguntas: VERDE_POS_EST, grupo: f, verde: true, si: (r) => val(r, "id_pos1") === 1 });
      s.push({ titulo: "Posturas dinámicas: condiciones aceptables (zona verde)", zona: "tronco", preguntas: VERDE_POS_DIN, grupo: f, verde: true, si: (r) => val(r, "id_pos2") === 1 });
      continue;
    }
    s.push({ titulo: `${n}: condiciones aceptables (zona verde)`, zona: ZONA_SECCION[f], preguntas: VERDE[f]!, grupo: f, verde: true, si: (r) => presente(f, r) === true });
    s.push({ titulo: `${n}: condiciones inaceptables (zona roja)`, zona: ZONA_SECCION[f], preguntas: ROJA[f]!, grupo: f, roja: true,
      si: (r) => presente(f, r) === true && conNo(r, VERDE[f]!).length > 0 });
    if (f === "tra" || f === "emp")
      s.push({ titulo: f === "tra" ? "Levantamiento y transporte: aspectos adicionales" : "Empuje y tracción: aspectos adicionales", zona: ZONA_SECCION[f], preguntas: adicionalesDe(f), grupo: f, opcional: true,
        si: (r) => (f === "tra" ? presente("lev", r) === true || presente("tra", r) === true : presente("emp", r) === true) });
  }
  for (const c of OTROS) s.push({ titulo: c.nombre, zona: "actividad", preguntas: c.items, grupo: "otros", opcional: true });
  s.push({ titulo: "Mediciones ambientales (si las tomaste)", zona: "actividad", preguntas: MEDICIONES.map((m) => ({ ...m, ayuda: `Referencia: ${m.referencia}.` })), grupo: "otros", opcional: true });
  return s;
}

const ORDEN_ZONA: Record<ZonaDeb, number> = { rojo: 3, amarillo: 2, verde: 1, no: 0 };
export const TEXTO_ZONA: Record<ZonaDeb, string> = { rojo: "Zona roja: inaceptable", amarillo: "Zona amarilla: evaluación específica", verde: "Zona verde: aceptable", no: "No presente" };
export const ordenarFactores = (fs: ResultadoFactor[]) =>
  [...fs].sort((a, b) => (ORDEN_ZONA[b.zona ?? "no"] - ORDEN_ZONA[a.zona ?? "no"]) || b.adicionales.length - a.adicionales.length);

export const DEB: Metodo = {
  clave: "deb",
  nombre: "DEB · Diagnóstico Ergonómico Biomecánico por factores de riesgo",
  corto: "DEB",
  paraQue: "Recorrido del puesto con lista de chequeo: identifica los 5 peligros y los clasifica en zona verde, amarilla o roja.",
  fuente: "CENEA / epm international ergonomics school, fichas DEB v2-2012 (ISO/TR 12295, ISO 11228-1/2/3, ISO 11226).",
  secciones: secciones(),
  calcular(r): Resultado {
    const factores = FACTORES.map((f) => evaluarFactor(f, r));
    const completo = factores.every((f) => f.zona !== null);
    const rojos = factores.filter((f) => f.zona === "rojo").length;
    const amarillos = factores.filter((f) => f.zona === "amarillo").length;
    const conAdicionales = factores.filter((f) => f.zona === "verde" && f.adicionales.length).length;
    const presentes = factores.filter((f) => f.zona && f.zona !== "no").length;
    const otros = otrosRiesgos(r);
    const nOtros = otros.reduce((n, c) => n + c.items.length, 0);
    const alertas = new Set(factores.flatMap((f) => f.adicionales)).size + nOtros;
    const [urgencia, nivel, accion] =
      rojos ? [4, "Zona roja", "Riesgo inaceptable: intervenir de inmediato y hacer la evaluación específica para definir la medida"] as const
      : amarillos ? [2, "Zona amarilla", "No se puede descartar el riesgo: hacer la evaluación específica de cada factor en amarillo"] as const
      : conAdicionales || nOtros ? [1, presentes ? "Zona verde con alertas" : "Sin peligros biomecánicos, con alertas", "Hay otros factores de riesgo del puesto que se deben corregir"] as const
      : [0, presentes ? "Zona verde" : "Sin peligros", presentes ? "Riesgo aceptable: mantener las condiciones y reevaluar si cambia la tarea" : "No se identificaron peligros ergonómicos biomecánicos"] as const;
    return {
      puntaje: rojos * 10 + amarillos, maximo: 5, urgencia, nivel, accion, completo,
      texto: !presentes ? "Sin peligros" : [rojos && `${rojos} en rojo`, amarillos && `${amarillos} en amarillo`, presentes - rojos - amarillos && `${presentes - rojos - amarillos} en verde`].filter(Boolean).join(" · "),
      subtexto: `${presentes} de 5 peligros presentes${alertas ? ` · ${alertas} ${alertas === 1 ? "alerta adicional" : "alertas adicionales"}` : ""}`,
      parciales: factores.map((f) => ({ etiqueta: f.nombre, valor: f.zona ? TEXTO_ZONA[f.zona] : "falta responder" })),
      zonas: {},
      factores: ordenarFactores(factores),
      otros,
    };
  },
};

// Preguntas obligatorias que faltan por peligro (secciones visibles, sin contar los aspectos adicionales).
// En zona roja basta una «Sí»: el resto de la ficha roja ya no hace falta.
export function faltantesDeb(r: Respuestas): { factor: FactorDeb; nombre: string; n: number }[] {
  return FACTORES.flatMap((f) => {
    if (evaluarFactor(f, r).zona !== null) return [];
    const n = DEB.secciones.filter((s) => s.grupo === f && !s.opcional && (!s.si || s.si(r)))
      .flatMap((s) => s.preguntas).filter((p) => val(r, p.clave) === null).length;
    return [{ factor: f, nombre: NOMBRE_FACTOR[f], n }];
  });
}
