// Evaluación ergonómica de puestos: métodos validados, cálculo del puntaje y hallazgos priorizados.
// Compartido servidor/cliente, sin dependencias: el cálculo es el mismo en la pantalla, al guardar y en el informe.
//
// Fuentes (tablas copiadas de las hojas oficiales de los autores):
//   RULA: McAtamney L, Corlett EN. RULA: a survey method for the investigation of work-related upper limb
//         disorders. Applied Ergonomics 1993;24(2):91-99.
//   REBA: Hignett S, McAtamney L. Rapid Entire Body Assessment (REBA). Applied Ergonomics 2000;31(2):201-205.
//   Prioridad: matriz 5×5 probabilidad × severidad del puesto (lib/puestos-tipos), la misma de la LOPCYMAT en la app.
import { nivelRiesgo } from "@/lib/puestos-tipos";

// Quién hace evaluaciones (la base aplica la misma lista en evaluaciones_ergonomicas_editar)
export const ROLES_ERGONOMIA = ["administrador", "gerente_medico", "medico", "coordinador_sst"];

export type ClaveMetodo = "rula" | "reba" | "rosa" | "niosh" | "deb" | "libre";
export type Departamento = "ingenieria" | "operaciones" | "rrhh" | "sst";
export type Zona = "brazo" | "antebrazo" | "muneca" | "cuello" | "tronco" | "piernas" | "carga" | "actividad" | "silla" | "pantalla" | "perifericos";

export const DEPARTAMENTOS: { clave: Departamento; nombre: string; enfoque: string }[] = [
  { clave: "ingenieria", nombre: "Ingeniería y mantenimiento", enfoque: "Rediseño del puesto, alturas, alcances, herramientas, ayudas mecánicas" },
  { clave: "operaciones", nombre: "Operaciones y producción", enfoque: "Organización de la tarea, ritmo, pausas, rotación, métodos de trabajo" },
  { clave: "rrhh", nombre: "Recursos Humanos", enfoque: "Formación, rotación del personal, selección y reubicación, jornada" },
  { clave: "sst", nombre: "Seguridad y Salud en el Trabajo", enfoque: "Vigilancia de la salud, seguimiento de medidas, notificación de riesgos" },
];
export const NOMBRE_DEPTO = Object.fromEntries(DEPARTAMENTOS.map((d) => [d.clave, d.nombre])) as Record<Departamento, string>;

export type Opcion = { valor: number; texto: string; detalle?: string };
// numero: se escribe un valor (kg, cm, grados) en vez de elegir una opción
export type Pregunta = { clave: string; texto: string; opciones: Opcion[]; ayuda?: string; numero?: { min: number; max: number; unidad: string; paso?: number } };
export type Seccion = { titulo: string; zona: Zona; preguntas: Pregunta[] };
export type Respuestas = Record<string, number>;

export type Resultado = {
  puntaje: number;
  maximo: number;
  /** 0 aceptable · 1 vigilar · 2 programar · 3 pronto · 4 inmediato */
  urgencia: 0 | 1 | 2 | 3 | 4;
  nivel: string;
  accion: string;
  parciales: { etiqueta: string; valor: number }[];
  zonas: Partial<Record<Zona, number>>;
  completo: boolean;
  /** Cómo se muestra el puntaje cuando no es «N de M» (NIOSH: «IL 1,45») */
  texto?: string;
  /** Línea bajo el puntaje (NIOSH: «Carga 25 kg · límite recomendado 4,9 kg») */
  subtexto?: string;
};

export type Metodo = {
  clave: ClaveMetodo;
  nombre: string;
  corto: string;
  paraQue: string;
  fuente: string;
  secciones: Seccion[];
  calcular: (r: Respuestas) => Resultado;
};

const si = (puntos = 1, texto = "Sí"): Opcion[] => [{ valor: 0, texto: "No" }, { valor: puntos, texto }];
const v = (r: Respuestas, k: string) => (Number.isFinite(r[k]) ? r[k] : 0);
const tope = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// ─────────────────────────────── RULA ───────────────────────────────
// Tabla A [brazo 1-6][antebrazo 1-3][muñeca 1-4][giro 1-2]
const RULA_A = [
  [[[1, 2], [2, 2], [2, 3], [3, 3]], [[2, 2], [2, 2], [3, 3], [3, 3]], [[2, 3], [3, 3], [3, 3], [4, 4]]],
  [[[2, 3], [3, 3], [3, 4], [4, 4]], [[3, 3], [3, 3], [3, 4], [4, 4]], [[3, 4], [4, 4], [4, 4], [5, 5]]],
  [[[3, 3], [4, 4], [4, 4], [5, 5]], [[3, 4], [4, 4], [4, 4], [5, 5]], [[4, 4], [4, 4], [4, 5], [5, 5]]],
  [[[4, 4], [4, 4], [4, 5], [5, 5]], [[4, 4], [4, 4], [4, 5], [5, 5]], [[4, 4], [4, 5], [5, 5], [6, 6]]],
  [[[5, 5], [5, 5], [5, 6], [6, 7]], [[5, 6], [6, 6], [6, 7], [7, 7]], [[6, 6], [6, 7], [7, 7], [7, 8]]],
  [[[7, 7], [7, 7], [7, 8], [8, 9]], [[8, 8], [8, 8], [8, 9], [9, 9]], [[9, 9], [9, 9], [9, 9], [9, 9]]],
];
// Tabla B [cuello 1-6][tronco 1-6][piernas 1-2]
const RULA_B = [
  [[1, 3], [2, 3], [3, 4], [5, 5], [6, 6], [7, 7]],
  [[2, 3], [2, 3], [4, 5], [5, 5], [6, 7], [7, 7]],
  [[3, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 7]],
  [[5, 5], [5, 6], [6, 7], [7, 7], [7, 7], [8, 8]],
  [[7, 7], [7, 7], [7, 8], [8, 8], [8, 8], [8, 8]],
  [[8, 8], [8, 8], [8, 8], [8, 9], [9, 9], [9, 9]],
];
// Tabla C [puntaje C 1-8+][puntaje D 1-7+]
const RULA_C = [
  [1, 2, 3, 3, 4, 5, 5],
  [2, 2, 3, 4, 4, 5, 5],
  [3, 3, 3, 4, 4, 5, 6],
  [3, 3, 3, 4, 5, 6, 6],
  [4, 4, 4, 5, 6, 7, 7],
  [4, 4, 5, 6, 6, 7, 7],
  [5, 5, 6, 6, 7, 7, 7],
  [5, 5, 6, 7, 7, 7, 7],
];

const CARGA_RULA: Opcion[] = [
  { valor: 0, texto: "Menos de 2 kg", detalle: "intermitente" },
  { valor: 1, texto: "2 a 10 kg", detalle: "intermitente" },
  { valor: 2, texto: "2 a 10 kg sostenida o repetida", detalle: "o más de 10 kg intermitente" },
  { valor: 3, texto: "Más de 10 kg sostenida o repetida", detalle: "o golpes, fuerza brusca" },
];

export const RULA: Metodo = {
  clave: "rula",
  nombre: "RULA · Evaluación rápida de miembros superiores",
  corto: "RULA",
  paraQue: "Tareas sentadas o de pie con trabajo de brazos, manos y cuello: cajas, ensamblaje, oficina, laboratorio.",
  fuente: "McAtamney L, Corlett EN. Applied Ergonomics 1993;24(2):91-99.",
  secciones: [
    {
      titulo: "Brazo",
      zona: "brazo",
      preguntas: [
        { clave: "brazo", texto: "Posición del brazo", opciones: [
          { valor: 1, texto: "20° atrás a 20° adelante" }, { valor: 2, texto: "Más de 20° atrás o 20°–45° adelante" },
          { valor: 3, texto: "45°–90° adelante" }, { valor: 4, texto: "Más de 90°" }] },
        { clave: "hombroElevado", texto: "Hombro elevado", opciones: si(1) },
        { clave: "brazoAbducido", texto: "Brazo separado del cuerpo (abducido)", opciones: si(1) },
        { clave: "brazoApoyado", texto: "Brazo apoyado o persona inclinada que lo sostiene", opciones: si(-1) },
      ],
    },
    {
      titulo: "Antebrazo",
      zona: "antebrazo",
      preguntas: [
        { clave: "antebrazo", texto: "Flexión del codo", opciones: [{ valor: 1, texto: "60°–100°" }, { valor: 2, texto: "Menos de 60° o más de 100°" }] },
        { clave: "antebrazoCruza", texto: "Trabaja cruzando la línea media del cuerpo o hacia el lado", opciones: si(1) },
      ],
    },
    {
      titulo: "Muñeca",
      zona: "muneca",
      preguntas: [
        { clave: "muneca", texto: "Flexión o extensión de la muñeca", opciones: [
          { valor: 1, texto: "Neutra" }, { valor: 2, texto: "Hasta 15°" }, { valor: 3, texto: "Más de 15°" }] },
        { clave: "munecaDesviada", texto: "Desviación hacia el pulgar o el meñique", opciones: si(1) },
        { clave: "giro", texto: "Giro de la muñeca", opciones: [{ valor: 1, texto: "En el rango medio" }, { valor: 2, texto: "Cerca del tope" }] },
        { clave: "musculoBrazo", texto: "Postura estática más de 1 min o repetida 4 o más veces por minuto", opciones: si(1) },
        { clave: "cargaBrazo", texto: "Carga o fuerza en brazo y mano", opciones: CARGA_RULA },
      ],
    },
    {
      titulo: "Cuello",
      zona: "cuello",
      preguntas: [
        { clave: "cuello", texto: "Posición del cuello", opciones: [
          { valor: 1, texto: "0°–10° adelante" }, { valor: 2, texto: "10°–20°" }, { valor: 3, texto: "Más de 20°" }, { valor: 4, texto: "Hacia atrás (extensión)" }] },
        { clave: "cuelloGiro", texto: "Cuello girado", opciones: si(1) },
        { clave: "cuelloLateral", texto: "Cuello inclinado hacia un lado", opciones: si(1) },
      ],
    },
    {
      titulo: "Tronco",
      zona: "tronco",
      preguntas: [
        { clave: "tronco", texto: "Posición del tronco", opciones: [
          { valor: 1, texto: "Sentado bien apoyado o erguido" }, { valor: 2, texto: "0°–20° adelante" },
          { valor: 3, texto: "20°–60°" }, { valor: 4, texto: "Más de 60°" }] },
        { clave: "troncoGiro", texto: "Tronco girado", opciones: si(1) },
        { clave: "troncoLateral", texto: "Tronco inclinado hacia un lado", opciones: si(1) },
      ],
    },
    {
      titulo: "Piernas, actividad y carga",
      zona: "piernas",
      preguntas: [
        { clave: "piernas", texto: "Piernas y pies", opciones: [{ valor: 1, texto: "Apoyados y equilibrados" }, { valor: 2, texto: "Sin apoyo o desequilibrados" }] },
        { clave: "musculoCuerpo", texto: "Cuello o tronco en postura estática más de 1 min o repetida 4/min", opciones: si(1) },
        { clave: "cargaCuerpo", texto: "Carga o fuerza sobre cuello, tronco y piernas", opciones: CARGA_RULA },
      ],
    },
  ],
  calcular(r) {
    const brazo = tope(v(r, "brazo") + v(r, "hombroElevado") + v(r, "brazoAbducido") + v(r, "brazoApoyado"), 1, 6);
    const antebrazo = tope(v(r, "antebrazo") + v(r, "antebrazoCruza"), 1, 3);
    const muneca = tope(v(r, "muneca") + v(r, "munecaDesviada"), 1, 4);
    const giro = tope(v(r, "giro"), 1, 2);
    const cuello = tope(v(r, "cuello") + v(r, "cuelloGiro") + v(r, "cuelloLateral"), 1, 6);
    const tronco = tope(v(r, "tronco") + v(r, "troncoGiro") + v(r, "troncoLateral"), 1, 6);
    const piernas = tope(v(r, "piernas"), 1, 2);
    const a = RULA_A[brazo - 1][antebrazo - 1][muneca - 1][giro - 1];
    const b = RULA_B[cuello - 1][tronco - 1][piernas - 1];
    const c = a + v(r, "musculoBrazo") + v(r, "cargaBrazo");
    const d = b + v(r, "musculoCuerpo") + v(r, "cargaCuerpo");
    const puntaje = RULA_C[tope(c, 1, 8) - 1][tope(d, 1, 7) - 1];
    const completo = ["brazo", "antebrazo", "muneca", "giro", "cuello", "tronco", "piernas"].every((k) => v(r, k) > 0);
    const [urgencia, nivel, accion] =
      puntaje >= 7 ? [4, "Nivel 4 · Muy alto", "Investigar y cambiar de inmediato"] as const
      : puntaje >= 5 ? [3, "Nivel 3 · Alto", "Investigar y cambiar pronto"] as const
      : puntaje >= 3 ? [2, "Nivel 2 · Medio", "Investigar más; pueden requerirse cambios"] as const
      : [0, "Nivel 1 · Aceptable", "Postura aceptable si no se mantiene ni se repite por largos periodos"] as const;
    return {
      puntaje, maximo: 7, urgencia, nivel, accion, completo,
      parciales: [
        { etiqueta: "Brazo", valor: brazo }, { etiqueta: "Antebrazo", valor: antebrazo }, { etiqueta: "Muñeca", valor: muneca },
        { etiqueta: "Giro de muñeca", valor: giro }, { etiqueta: "Tabla A", valor: a }, { etiqueta: "Puntaje C (brazo y muñeca)", valor: c },
        { etiqueta: "Cuello", valor: cuello }, { etiqueta: "Tronco", valor: tronco }, { etiqueta: "Piernas", valor: piernas },
        { etiqueta: "Tabla B", valor: b }, { etiqueta: "Puntaje D (cuello, tronco y piernas)", valor: d },
      ],
      // Zona en riesgo = su puntaje parcial respecto a lo neutro (1)
      zonas: { brazo, antebrazo, muneca: muneca + giro - 1, cuello, tronco, piernas, carga: Math.max(v(r, "cargaBrazo"), v(r, "cargaCuerpo")), actividad: v(r, "musculoBrazo") + v(r, "musculoCuerpo") },
    };
  },
};

// ─────────────────────────────── REBA ───────────────────────────────
// Tabla A [tronco 1-5][cuello 1-3][piernas 1-4]
const REBA_A = [
  [[1, 2, 3, 4], [1, 2, 3, 4], [3, 3, 5, 6]],
  [[2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7]],
  [[2, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8]],
  [[3, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9]],
  [[4, 6, 7, 8], [6, 7, 8, 9], [7, 8, 9, 9]],
];
// Tabla B [brazo 1-6][antebrazo 1-2][muñeca 1-3]
const REBA_B = [
  [[1, 2, 2], [1, 2, 3]],
  [[1, 2, 3], [2, 3, 4]],
  [[3, 4, 5], [4, 5, 5]],
  [[4, 5, 5], [5, 6, 7]],
  [[6, 7, 8], [7, 8, 8]],
  [[7, 8, 8], [8, 9, 9]],
];
// Tabla C [puntaje A 1-12][puntaje B 1-12]
const REBA_C = [
  [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
  [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
  [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
  [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
  [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
  [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
  [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
  [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
  [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
];

export const REBA: Metodo = {
  clave: "reba",
  nombre: "REBA · Evaluación rápida del cuerpo entero",
  corto: "REBA",
  paraQue: "Tareas con posturas cambiantes de todo el cuerpo: almacén, limpieza, mantenimiento, enfermería, construcción.",
  fuente: "Hignett S, McAtamney L. Applied Ergonomics 2000;31(2):201-205.",
  secciones: [
    {
      titulo: "Tronco",
      zona: "tronco",
      preguntas: [
        { clave: "tronco", texto: "Posición del tronco", opciones: [
          { valor: 1, texto: "Erguido" }, { valor: 2, texto: "0°–20° adelante o atrás" },
          { valor: 3, texto: "20°–60° adelante o más de 20° atrás" }, { valor: 4, texto: "Más de 60° adelante" }] },
        { clave: "troncoGiro", texto: "Tronco girado o inclinado hacia un lado", opciones: si(1) },
      ],
    },
    {
      titulo: "Cuello",
      zona: "cuello",
      preguntas: [
        { clave: "cuello", texto: "Posición del cuello", opciones: [{ valor: 1, texto: "0°–20° adelante" }, { valor: 2, texto: "Más de 20° adelante o hacia atrás" }] },
        { clave: "cuelloGiro", texto: "Cuello girado o inclinado hacia un lado", opciones: si(1) },
      ],
    },
    {
      titulo: "Piernas",
      zona: "piernas",
      preguntas: [
        { clave: "piernas", texto: "Apoyo de las piernas", opciones: [
          { valor: 1, texto: "Sobre ambas piernas, caminando o sentado" }, { valor: 2, texto: "Sobre una pierna o inestable" }] },
        { clave: "rodillas", texto: "Flexión de rodillas (de pie)", opciones: [
          { valor: 0, texto: "Menos de 30°" }, { valor: 1, texto: "30°–60°" }, { valor: 2, texto: "Más de 60°" }] },
        { clave: "carga", texto: "Carga o fuerza", opciones: [
          { valor: 0, texto: "Menos de 5 kg" }, { valor: 1, texto: "5 a 10 kg" }, { valor: 2, texto: "Más de 10 kg" }] },
        { clave: "brusca", texto: "Fuerza aplicada de golpe o con choques", opciones: si(1) },
      ],
    },
    {
      titulo: "Brazo",
      zona: "brazo",
      preguntas: [
        { clave: "brazo", texto: "Posición del brazo", opciones: [
          { valor: 1, texto: "20° atrás a 20° adelante" }, { valor: 2, texto: "Más de 20° atrás o 20°–45° adelante" },
          { valor: 3, texto: "45°–90° adelante" }, { valor: 4, texto: "Más de 90°" }] },
        { clave: "brazoAbducido", texto: "Brazo separado del cuerpo o rotado", opciones: si(1) },
        { clave: "hombroElevado", texto: "Hombro elevado", opciones: si(1) },
        { clave: "brazoApoyado", texto: "Brazo apoyado o a favor de la gravedad", opciones: si(-1) },
      ],
    },
    {
      titulo: "Antebrazo y muñeca",
      zona: "antebrazo",
      preguntas: [
        { clave: "antebrazo", texto: "Flexión del codo", opciones: [{ valor: 1, texto: "60°–100°" }, { valor: 2, texto: "Menos de 60° o más de 100°" }] },
        { clave: "muneca", texto: "Flexión o extensión de la muñeca", opciones: [{ valor: 1, texto: "0°–15°" }, { valor: 2, texto: "Más de 15°" }] },
        { clave: "munecaGiro", texto: "Muñeca desviada o girada", opciones: si(1) },
        { clave: "agarre", texto: "Agarre", opciones: [
          { valor: 0, texto: "Bueno", detalle: "asa adecuada" }, { valor: 1, texto: "Regular", detalle: "aceptable, no ideal" },
          { valor: 2, texto: "Malo", detalle: "posible pero inadecuado" }, { valor: 3, texto: "Inaceptable", detalle: "sin asa, incómodo o inseguro" }] },
      ],
    },
    {
      titulo: "Actividad",
      zona: "actividad",
      preguntas: [
        { clave: "estatica", texto: "Una o más partes del cuerpo estáticas más de 1 minuto", opciones: si(1) },
        { clave: "repetida", texto: "Movimientos pequeños repetidos más de 4 veces por minuto", opciones: si(1) },
        { clave: "inestable", texto: "Cambios rápidos y amplios de postura o base inestable", opciones: si(1) },
      ],
    },
  ],
  calcular(r) {
    const tronco = tope(v(r, "tronco") + v(r, "troncoGiro"), 1, 5);
    const cuello = tope(v(r, "cuello") + v(r, "cuelloGiro"), 1, 3);
    const piernas = tope(v(r, "piernas") + v(r, "rodillas"), 1, 4);
    const brazo = tope(v(r, "brazo") + v(r, "brazoAbducido") + v(r, "hombroElevado") + v(r, "brazoApoyado"), 1, 6);
    const antebrazo = tope(v(r, "antebrazo"), 1, 2);
    const muneca = tope(v(r, "muneca") + v(r, "munecaGiro"), 1, 3);
    const tablaA = REBA_A[tronco - 1][cuello - 1][piernas - 1];
    const tablaB = REBA_B[brazo - 1][antebrazo - 1][muneca - 1];
    const carga = v(r, "carga") + v(r, "brusca");
    const a = tablaA + carga;
    const b = tablaB + v(r, "agarre");
    const actividad = v(r, "estatica") + v(r, "repetida") + v(r, "inestable");
    const puntaje = REBA_C[tope(a, 1, 12) - 1][tope(b, 1, 12) - 1] + actividad;
    const completo = ["tronco", "cuello", "piernas", "brazo", "antebrazo", "muneca"].every((k) => v(r, k) > 0);
    const [urgencia, nivel, accion] =
      puntaje >= 11 ? [4, "Muy alto", "Implantar cambios de inmediato"] as const
      : puntaje >= 8 ? [3, "Alto", "Investigar e implantar cambios pronto"] as const
      : puntaje >= 4 ? [2, "Medio", "Investigar más; cambiar pronto"] as const
      : puntaje >= 2 ? [1, "Bajo", "Puede requerirse un cambio"] as const
      : [0, "Inapreciable", "No se requiere acción"] as const;
    return {
      puntaje, maximo: 15, urgencia, nivel, accion, completo,
      parciales: [
        { etiqueta: "Tronco", valor: tronco }, { etiqueta: "Cuello", valor: cuello }, { etiqueta: "Piernas", valor: piernas },
        { etiqueta: "Tabla A", valor: tablaA }, { etiqueta: "Carga y fuerza", valor: carga }, { etiqueta: "Puntaje A", valor: a },
        { etiqueta: "Brazo", valor: brazo }, { etiqueta: "Antebrazo", valor: antebrazo }, { etiqueta: "Muñeca", valor: muneca },
        { etiqueta: "Tabla B", valor: tablaB }, { etiqueta: "Agarre", valor: v(r, "agarre") }, { etiqueta: "Puntaje B", valor: b },
        { etiqueta: "Actividad", valor: actividad },
      ],
      zonas: { tronco, cuello, piernas, brazo, antebrazo, muneca, carga: carga + v(r, "agarre"), actividad },
    };
  },
};

// Color del nivel del método en pantalla (0 aceptable … 4 inmediato)
export const CLASE_URGENCIA = [
  "bg-ok/15 text-ok-texto",
  "bg-ok/15 text-ok-texto",
  "bg-aviso/25 text-aviso-texto dark:text-aviso",
  "bg-alerta/15 text-alerta-texto",
  "bg-alerta text-white",
];

// ─────────────────────────────── ROSA ───────────────────────────────
// Sonne M, Villalta DL, Andrews DM. Development and evaluation of an office ergonomic risk checklist: ROSA.
// Applied Ergonomics 2012;43(1):98-108. Tablas de la hoja oficial (Cornell University Ergonomics Web, 2011-2012).
// Silla [altura + profundidad 2-8][apoyabrazos + respaldo 2-9]
const ROSA_SILLA = [
  [1, 2, 3, 4, 5, 6, 7, 8],
  [2, 2, 3, 4, 5, 6, 7, 8],
  [3, 3, 3, 4, 5, 7, 7, 8],
  [4, 4, 4, 4, 5, 7, 7, 8],
  [5, 5, 5, 5, 5, 8, 8, 9],
  [6, 6, 6, 7, 7, 8, 9, 9],
  [7, 7, 7, 8, 8, 9, 9, 9],
];
// Pantalla y teléfono [teléfono 0-6][pantalla 0-7]
const ROSA_PANTALLA = [
  [1, 1, 1, 2, 3, 4, 5, 6],
  [1, 1, 2, 2, 3, 4, 5, 6],
  [1, 2, 2, 3, 3, 4, 6, 7],
  [2, 2, 3, 3, 4, 5, 6, 8],
  [3, 3, 4, 4, 5, 6, 7, 8],
  [4, 4, 5, 5, 6, 7, 8, 9],
  [5, 5, 6, 7, 8, 8, 9, 9],
];
// Mouse y teclado [mouse 0-7][teclado 0-7]
const ROSA_PERIFERICOS = [
  [1, 1, 1, 2, 3, 4, 5, 6],
  [1, 1, 2, 3, 4, 5, 6, 7],
  [1, 2, 2, 3, 4, 5, 6, 7],
  [2, 3, 3, 3, 5, 6, 7, 8],
  [3, 4, 4, 5, 5, 6, 7, 8],
  [4, 5, 5, 6, 6, 7, 8, 9],
  [5, 6, 6, 7, 7, 8, 8, 9],
  [6, 7, 7, 8, 8, 9, 9, 9],
];
const DURACION: Opcion[] = [
  { valor: -1, texto: "Menos de 1 h al día", detalle: "o menos de 30 min seguidos" },
  { valor: 0, texto: "1 a 4 h al día", detalle: "o 30 min a 1 h seguidos" },
  { valor: 1, texto: "Más de 4 h al día", detalle: "o más de 1 h seguida" },
];
const dur = (clave: string, que: string): Pregunta => ({ clave, texto: `Tiempo de uso ${que.replace(/^el /, "del ").replace(/^la /, "de la ")}`, opciones: DURACION });

export const ROSA: Metodo = {
  clave: "rosa",
  nombre: "ROSA · Evaluación rápida de puestos de oficina",
  corto: "ROSA",
  paraQue: "Puestos de oficina con computadora: silla, pantalla, teléfono, teclado y mouse.",
  fuente: "Sonne M, Villalta DL, Andrews DM. Applied Ergonomics 2012;43(1):98-108.",
  secciones: [
    {
      titulo: "Silla: altura y asiento",
      zona: "silla",
      preguntas: [
        { clave: "sillaAltura", texto: "Altura de la silla", opciones: [
          { valor: 1, texto: "Rodillas a 90°" }, { valor: 2, texto: "Muy baja o muy alta", detalle: "rodillas a menos o más de 90°" },
          { valor: 3, texto: "Los pies no tocan el suelo" }] },
        { clave: "sillaEspacio", texto: "Espacio insuficiente debajo de la mesa (no puede cruzar las piernas)", opciones: si(1) },
        { clave: "sillaAlturaFija", texto: "Altura de la silla no regulable", opciones: si(1) },
        { clave: "asiento", texto: "Profundidad del asiento", opciones: [
          { valor: 1, texto: "Unos 8 cm entre rodilla y borde", detalle: "tres dedos" }, { valor: 2, texto: "Muy largo o muy corto" }] },
        { clave: "asientoFijo", texto: "Profundidad del asiento no regulable", opciones: si(1) },
      ],
    },
    {
      titulo: "Silla: apoyabrazos, respaldo y tiempo",
      zona: "silla",
      preguntas: [
        { clave: "apoyabrazos", texto: "Apoyabrazos", opciones: [
          { valor: 1, texto: "Codos apoyados, hombros relajados" }, { valor: 2, texto: "Muy altos o muy bajos", detalle: "hombros encogidos o brazos sin apoyo" }] },
        { clave: "brazosDuros", texto: "Apoyabrazos duros o dañados", opciones: si(1) },
        { clave: "brazosAnchos", texto: "Apoyabrazos muy separados", opciones: si(1) },
        { clave: "brazosFijos", texto: "Apoyabrazos no regulables", opciones: si(1) },
        { clave: "respaldo", texto: "Respaldo", opciones: [
          { valor: 1, texto: "Apoyo lumbar adecuado, 95°–110°" },
          { valor: 2, texto: "Sin apoyo lumbar, mal inclinado o sin respaldo", detalle: "o la persona se inclina hacia adelante" }] },
        { clave: "mesaAlta", texto: "Superficie de trabajo muy alta (hombros encogidos)", opciones: si(1) },
        { clave: "respaldoFijo", texto: "Respaldo no regulable", opciones: si(1) },
        dur("durSilla", "la silla"),
      ],
    },
    {
      titulo: "Pantalla",
      zona: "pantalla",
      preguntas: [
        { clave: "pantalla", texto: "Ubicación de la pantalla", opciones: [
          { valor: 1, texto: "A un brazo (40–75 cm), a la altura de los ojos" }, { valor: 2, texto: "Muy baja", detalle: "más de 30° por debajo de los ojos" },
          { valor: 3, texto: "Muy alta", detalle: "cuello hacia atrás" }] },
        { clave: "pantallaLejos", texto: "Muy lejos (más de 75 cm)", opciones: si(1) },
        { clave: "pantallaGiro", texto: "Cuello girado más de 30°", opciones: si(1) },
        { clave: "pantallaReflejo", texto: "Reflejos en la pantalla", opciones: si(1) },
        { clave: "pantallaAtril", texto: "Documentos sin atril", opciones: si(1) },
        dur("durPantalla", "la pantalla"),
      ],
    },
    {
      titulo: "Teléfono",
      zona: "pantalla",
      preguntas: [
        { clave: "telefono", texto: "Uso del teléfono", opciones: [
          { valor: 1, texto: "Auricular, o una mano y cuello recto" }, { valor: 2, texto: "Muy lejos", detalle: "a más de 30 cm" }] },
        { clave: "telefonoHombro", texto: "Lo sostiene entre el cuello y el hombro", opciones: si(2) },
        { clave: "telefonoManos", texto: "Sin manos libres", opciones: si(1) },
        dur("durTelefono", "el teléfono"),
      ],
    },
    {
      titulo: "Mouse",
      zona: "perifericos",
      preguntas: [
        { clave: "mouse", texto: "Ubicación del mouse", opciones: [{ valor: 1, texto: "En línea con el hombro" }, { valor: 2, texto: "Hay que estirarse para alcanzarlo" }] },
        { clave: "mouseNivel", texto: "Mouse y teclado a distinta altura", opciones: si(2) },
        { clave: "mousePinza", texto: "Agarre en pinza (mouse pequeño)", opciones: si(1) },
        { clave: "mouseApoyo", texto: "Reposamuñecas delante del mouse", opciones: si(1) },
        dur("durMouse", "el mouse"),
      ],
    },
    {
      titulo: "Teclado",
      zona: "perifericos",
      preguntas: [
        { clave: "teclado", texto: "Posición de las muñecas", opciones: [
          { valor: 1, texto: "Rectas, hombros relajados" }, { valor: 2, texto: "Extendidas más de 15°", detalle: "o teclado inclinado hacia arriba" }] },
        { clave: "tecladoDesvio", texto: "Muñecas desviadas al escribir", opciones: si(1) },
        { clave: "tecladoAlto", texto: "Teclado muy alto (hombros encogidos)", opciones: si(1) },
        { clave: "tecladoAlcance", texto: "Tiene que alcanzar objetos por encima de la cabeza", opciones: si(1) },
        { clave: "tecladoFijo", texto: "Bandeja o superficie no regulable", opciones: si(1) },
        dur("durTeclado", "el teclado"),
      ],
    },
  ],
  calcular(r) {
    const altura = v(r, "sillaAltura") + v(r, "sillaEspacio") + v(r, "sillaAlturaFija");
    const profundidad = v(r, "asiento") + v(r, "asientoFijo");
    const brazos = v(r, "apoyabrazos") + v(r, "brazosDuros") + v(r, "brazosAnchos") + v(r, "brazosFijos");
    const respaldo = v(r, "respaldo") + v(r, "mesaAlta") + v(r, "respaldoFijo");
    const silla = tope(ROSA_SILLA[tope(altura + profundidad, 2, 8) - 2][tope(brazos + respaldo, 2, 9) - 2] + v(r, "durSilla"), 1, 10);
    const pantalla = tope(v(r, "pantalla") + v(r, "pantallaLejos") + v(r, "pantallaGiro") + v(r, "pantallaReflejo") + v(r, "pantallaAtril") + v(r, "durPantalla"), 0, 7);
    const telefono = tope(v(r, "telefono") + v(r, "telefonoHombro") + v(r, "telefonoManos") + v(r, "durTelefono"), 0, 6);
    const mouse = tope(v(r, "mouse") + v(r, "mouseNivel") + v(r, "mousePinza") + v(r, "mouseApoyo") + v(r, "durMouse"), 0, 7);
    const teclado = tope(v(r, "teclado") + v(r, "tecladoDesvio") + v(r, "tecladoAlto") + v(r, "tecladoAlcance") + v(r, "tecladoFijo") + v(r, "durTeclado"), 0, 7);
    const pantallaTelefono = ROSA_PANTALLA[telefono][pantalla];
    const perifericos = ROSA_PERIFERICOS[mouse][teclado];
    // Tablas de periféricos y final: en la hoja oficial cada celda es el mayor de los dos puntajes
    const equipos = tope(Math.max(pantallaTelefono, perifericos), 1, 9);
    const puntaje = tope(Math.max(silla, equipos), 1, 10);
    const completo = ["sillaAltura", "asiento", "apoyabrazos", "respaldo", "pantalla", "telefono", "mouse", "teclado"].every((k) => v(r, k) > 0)
      && ["durSilla", "durPantalla", "durTelefono", "durMouse", "durTeclado"].every((k) => k in r);
    const [urgencia, nivel, accion] =
      puntaje >= 8 ? [4, "Muy alto", "Corregir el puesto de inmediato"] as const
      : puntaje >= 5 ? [3, "Alto", "Riesgo alto (5 o más): evaluar a fondo y corregir pronto"] as const
      : puntaje >= 3 ? [1, "Mejorable", "Ajustar los elementos con puntaje alto cuando sea posible"] as const
      : [0, "Bajo", "Puesto adecuado"] as const;
    return {
      puntaje, maximo: 10, urgencia, nivel, accion, completo,
      parciales: [
        { etiqueta: "Altura + profundidad del asiento", valor: altura + profundidad }, { etiqueta: "Apoyabrazos + respaldo", valor: brazos + respaldo },
        { etiqueta: "Silla (con tiempo)", valor: silla }, { etiqueta: "Pantalla", valor: pantalla }, { etiqueta: "Teléfono", valor: telefono },
        { etiqueta: "Pantalla y teléfono", valor: pantallaTelefono }, { etiqueta: "Mouse", valor: mouse }, { etiqueta: "Teclado", valor: teclado },
        { etiqueta: "Mouse y teclado", valor: perifericos }, { etiqueta: "Equipos", valor: equipos },
      ],
      zonas: { silla, pantalla: pantallaTelefono, perifericos },
    };
  },
};

// ─────────────────────────────── NIOSH ───────────────────────────────
// Waters TR, Putz-Anderson V, Garg A, Fine LJ. Revised NIOSH equation for the design and evaluation of manual lifting
// tasks. Ergonomics 1993;36(7):749-776. Applications Manual for the Revised NIOSH Lifting Equation, DHHS (NIOSH)
// 2021-110 (tablas 5 y 7, en unidades métricas).
const FRECUENCIAS = [0.2, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
// [frecuencia][≤1 h V<75, ≤1 h V≥75, 1-2 h V<75, 1-2 h V≥75, 2-8 h V<75, 2-8 h V≥75]
const NIOSH_FM = [
  [1.0, 1.0, 0.95, 0.95, 0.85, 0.85],
  [0.97, 0.97, 0.92, 0.92, 0.81, 0.81],
  [0.94, 0.94, 0.88, 0.88, 0.75, 0.75],
  [0.91, 0.91, 0.84, 0.84, 0.65, 0.65],
  [0.88, 0.88, 0.79, 0.79, 0.55, 0.55],
  [0.84, 0.84, 0.72, 0.72, 0.45, 0.45],
  [0.8, 0.8, 0.6, 0.6, 0.35, 0.35],
  [0.75, 0.75, 0.5, 0.5, 0.27, 0.27],
  [0.7, 0.7, 0.42, 0.42, 0.22, 0.22],
  [0.6, 0.6, 0.35, 0.35, 0.18, 0.18],
  [0.52, 0.52, 0.3, 0.3, 0, 0.15],
  [0.45, 0.45, 0.26, 0.26, 0, 0.13],
  [0.41, 0.41, 0, 0.23, 0, 0],
  [0.37, 0.37, 0, 0.21, 0, 0],
  [0, 0.34, 0, 0, 0, 0],
  [0, 0.31, 0, 0, 0, 0],
  [0, 0.28, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
];
const r2 = (n: number) => Math.round(n * 100) / 100;

export const NIOSH: Metodo = {
  clave: "niosh",
  nombre: "NIOSH · Ecuación de levantamiento de cargas",
  corto: "NIOSH",
  paraQue: "Levantar o bajar cargas con las dos manos: almacén, despacho, carga de camiones, producción.",
  fuente: "Waters TR et al. Ergonomics 1993;36(7):749-776 · NIOSH Applications Manual 2021-110.",
  secciones: [
    {
      titulo: "La carga",
      zona: "carga",
      preguntas: [
        { clave: "carga", texto: "Peso de la carga", opciones: [], numero: { min: 0.5, max: 100, unidad: "kg", paso: 0.5 } },
        { clave: "agarre", texto: "Agarre", opciones: [
          { valor: 0, texto: "Bueno", detalle: "asas o cajas con agarraderas" }, { valor: 1, texto: "Regular", detalle: "sin asas, se puede doblar los dedos" },
          { valor: 2, texto: "Malo", detalle: "voluminosa, irregular o resbaladiza" }] },
      ],
    },
    {
      titulo: "Posición al levantar (origen)",
      zona: "tronco",
      preguntas: [
        { clave: "h", texto: "Distancia horizontal de las manos al punto medio entre los tobillos", opciones: [], numero: { min: 0, max: 100, unidad: "cm" }, ayuda: "Con cinta métrica, en el suelo: del punto medio entre los tobillos a la vertical de las manos." },
        { clave: "v", texto: "Altura de las manos al inicio, desde el suelo", opciones: [], numero: { min: 0, max: 200, unidad: "cm" }, ayuda: "Con cinta métrica, del suelo a los nudillos al tomar la carga." },
        { clave: "d", texto: "Recorrido vertical de la carga (diferencia de altura origen–destino)", opciones: [], numero: { min: 0, max: 200, unidad: "cm" }, ayuda: "Altura de las manos al dejar la carga menos altura al tomarla (sin signo)." },
        { clave: "a", texto: "Giro del tronco (asimetría)", opciones: [], numero: { min: 0, max: 180, unidad: "°" }, ayuda: "Cuánto gira el tronco entre tomar y dejar: 0° de frente, 90° de lado." },
      ],
    },
    {
      titulo: "Frecuencia y duración",
      zona: "actividad",
      preguntas: [
        { clave: "frecuencia", texto: "Levantamientos por minuto", opciones: FRECUENCIAS.map((f) => ({
          valor: f, texto: f === 16 ? "Más de 15" : f === 0.2 ? "1 cada 5 min o menos" : String(f).replace(".", ",") })) },
        { clave: "duracion", texto: "Duración de la tarea en la jornada", opciones: [
          { valor: 1, texto: "Hasta 1 hora", detalle: "con descanso igual después" }, { valor: 2, texto: "1 a 2 horas" }, { valor: 3, texto: "2 a 8 horas" }] },
      ],
    },
  ],
  calcular(r) {
    const L = v(r, "carga"), H = v(r, "h"), V = v(r, "v"), D = v(r, "d"), A = v(r, "a");
    const hm = H <= 25 ? 1 : H > 63 ? 0 : 25 / H;
    const vm = V > 175 ? 0 : 1 - 0.003 * Math.abs(V - 75);
    const dm = D <= 25 ? 1 : D > 175 ? 0 : 0.82 + 4.5 / D;
    const am = A > 135 ? 0 : 1 - 0.0032 * A;
    const fila = Math.max(0, FRECUENCIAS.indexOf(r.frecuencia ?? 0.2));
    const fm = NIOSH_FM[fila][(tope(v(r, "duracion"), 1, 3) - 1) * 2 + (V >= 75 ? 1 : 0)];
    const cm = v(r, "agarre") === 2 ? 0.9 : v(r, "agarre") === 1 && V < 75 ? 0.95 : 1;
    const lpr = 23 * hm * vm * dm * am * fm * cm;
    const il = lpr > 0 ? L / lpr : 99;
    const completo = ["carga", "h", "v", "d", "a", "frecuencia", "duracion", "agarre"].every((k) => k in r) && L > 0;
    const [urgencia, nivel, accion] =
      il > 3 ? [4, "Muy alto", "Inaceptable para casi todos: rediseñar la tarea de inmediato"] as const
      : il > 2 ? [3, "Alto", "Riesgo alto para muchos trabajadores: rediseñar pronto"] as const
      : il > 1 ? [2, "Moderado", "Riesgo para algunos trabajadores: rediseñar la tarea"] as const
      : [0, "Aceptable", "La carga no supera el límite recomendado"] as const;
    const conRiesgo = il > 1;
    return {
      puntaje: r2(Math.min(il, 99)), maximo: 3, urgencia, nivel, accion, completo,
      texto: lpr > 0 ? `IL ${r2(il).toFixed(2).replace(".", ",")}` : "LPR 0",
      subtexto: `Carga ${String(L).replace(".", ",")} kg · límite recomendado ${(Math.round(lpr * 10) / 10).toFixed(1).replace(".", ",")} kg`,
      parciales: [
        { etiqueta: "Multiplicador horizontal (HM)", valor: r2(hm) }, { etiqueta: "Multiplicador vertical (VM)", valor: r2(vm) },
        { etiqueta: "Multiplicador de distancia (DM)", valor: r2(dm) }, { etiqueta: "Multiplicador de asimetría (AM)", valor: r2(am) },
        { etiqueta: "Multiplicador de frecuencia (FM)", valor: fm }, { etiqueta: "Multiplicador de agarre (CM)", valor: cm },
        { etiqueta: "Límite de peso recomendado (kg)", valor: r2(lpr) }, { etiqueta: "Índice de levantamiento (IL)", valor: r2(Math.min(il, 99)) },
      ],
      zonas: {
        carga: conRiesgo ? 3 : 0,
        tronco: conRiesgo && (A > 0 || V < 50) ? 3 : 0,
        brazo: conRiesgo && H > 40 ? 3 : 0,
        actividad: conRiesgo && fm < 0.75 ? 1 : 0,
      },
    };
  },
};

export const METODOS: Record<"rula" | "reba" | "rosa" | "niosh", Metodo> = { rula: RULA, reba: REBA, rosa: ROSA, niosh: NIOSH };
// Métodos donde el lado (derecho/izquierdo) no aplica
export const SIN_LADO: ClaveMetodo[] = ["rosa", "niosh"];
export const metodoDe = (clave: ClaveMetodo): Metodo | null => (Object.hasOwn(METODOS, clave) ? METODOS[clave as keyof typeof METODOS] : null);

// Respuesta válida para la pregunta: una de sus opciones, o un número dentro de su rango (1 decimal)
export function respuestaValida(m: Metodo, clave: string, valor: unknown): number | null {
  const p = m.secciones.flatMap((s) => s.preguntas).find((x) => x.clave === clave);
  if (!p || typeof valor !== "number" || !Number.isFinite(valor)) return null;
  if (p.numero) return valor >= p.numero.min && valor <= p.numero.max ? Math.round(valor * 10) / 10 : null;
  return p.opciones.some((o) => o.valor === valor) ? valor : null;
}
export const NOMBRE_METODO: Record<ClaveMetodo, string> = {
  rula: "RULA", reba: "REBA", rosa: "ROSA · Puestos de oficina", niosh: "NIOSH · Levantamiento de cargas", deb: "DEB · Diagnóstico ergonómico y biomecánico básico (CENEA)", libre: "Inspección con lista de hallazgos",
};

// Métodos recomendados para próximas versiones (se muestran como «Próximamente» con su fuente)
export const PROXIMOS: { corto: string; para: string; fuente: string }[] = [
  { corto: "DEB (CENEA)", para: "Diagnóstico ergonómico y biomecánico básico con lista de chequeo y fotos", fuente: "Centro de Ergonomía Aplicada (CENEA)" },
  { corto: "OCRA", para: "Movimientos repetitivos de mano y brazo", fuente: "Occhipinti E. Ergonomics 1998 · ISO 11228-3" },
  { corto: "KIM", para: "Empuje y arrastre de cargas", fuente: "BAuA (Alemania), Key Indicator Method LHC/PP 2019" },
];

// ───────────────────────── Hallazgos y prioridad ─────────────────────────
export type Hallazgo = {
  id: string;
  factor: string;
  detalle: string;
  p: number; // probabilidad 1-5
  s: number; // severidad 1-5
  consecuencia: string; // posible daño (sin diagnósticos de ninguna persona)
  medida: string;
  departamento: Departamento;
  plazo: string;
  origen: "metodo" | "manual" | "checklist";
};

export const PLAZOS = ["Inmediato", "Menos de 1 mes", "Menos de 3 meses", "Menos de 6 meses", "Vigilar"];

// Prioridad = nivel de la matriz 5×5; el plazo sugerido sale de ese nivel
export function prioridad(h: Pick<Hallazgo, "p" | "s">) {
  const n = nivelRiesgo({ p: h.p, s: h.s });
  if (!n) return null;
  const plazo = n.n >= 17 ? PLAZOS[0] : n.n >= 10 ? PLAZOS[1] : n.n >= 5 ? PLAZOS[2] : PLAZOS[4];
  return { ...n, plazo };
}

export function ordenarHallazgos(lista: Hallazgo[]) {
  return [...lista].sort((a, b) => (prioridad(b)?.n ?? 0) - (prioridad(a)?.n ?? 0));
}

// Qué se propone para cada zona cargada: factor, daño posible y una medida por departamento.
const PROPUESTAS: Record<Zona, { factor: string; consecuencia: string; medidas: [Departamento, string][] }> = {
  silla: {
    factor: "Silla no ajustada a la persona",
    consecuencia: "Lumbalgia, cervicalgia y molestias de hombros por estar sentado mucho tiempo",
    medidas: [
      ["ingenieria", "Silla regulable en altura, profundidad, apoyabrazos y apoyo lumbar; reposapiés si los pies no apoyan en el suelo."],
      ["rrhh", "Enseñar a ajustar la silla al cuerpo y programar pausas activas cada hora."],
    ],
  },
  pantalla: {
    factor: "Pantalla o teléfono mal ubicados",
    consecuencia: "Cervicalgia, fatiga visual y tensión de cuello y hombros",
    medidas: [
      ["ingenieria", "Pantalla de frente, a un brazo (40–75 cm), con el borde superior a la altura de los ojos y sin reflejos; atril para documentos; auricular o manos libres."],
    ],
  },
  perifericos: {
    factor: "Teclado y mouse fuera de alcance o a distinta altura",
    consecuencia: "Tendinitis de muñeca, síndrome del túnel carpiano, epicondilitis",
    medidas: [
      ["ingenieria", "Teclado y mouse a la misma altura, cerca del cuerpo y con los codos a 90°; mouse de tamaño adecuado; bandeja regulable."],
      ["operaciones", "Alternar el trabajo de teclado con otras tareas y pausas de 5 minutos cada hora."],
    ],
  },
  brazo: {
    factor: "Brazos elevados o separados del cuerpo",
    consecuencia: "Trastornos musculoesqueléticos de hombro (tendinitis del manguito rotador, bursitis)",
    medidas: [
      ["ingenieria", "Bajar la altura de trabajo o acercar los objetos para trabajar con el codo pegado al cuerpo y por debajo del hombro; colocar apoyabrazos."],
      ["operaciones", "Reorganizar la tarea para que las alturas por encima del hombro sean ocasionales; pausas de 5 min cada hora."],
    ],
  },
  antebrazo: {
    factor: "Codo fuera del rango cómodo o trabajo fuera de la línea del cuerpo",
    consecuencia: "Epicondilitis y molestias de codo y antebrazo",
    medidas: [["ingenieria", "Reubicar controles, pantallas y materiales frente al trabajador, dentro del área de alcance cómodo."]],
  },
  muneca: {
    factor: "Muñeca flexionada, desviada o girada",
    consecuencia: "Tendinitis de muñeca, síndrome del túnel carpiano",
    medidas: [
      ["ingenieria", "Herramientas con mango ergonómico (en ángulo o de diámetro adecuado) que mantengan la muñeca recta."],
      ["rrhh", "Formación del personal en técnicas de trabajo con muñeca neutra y pausas activas."],
    ],
  },
  cuello: {
    factor: "Cuello flexionado, en extensión o girado",
    consecuencia: "Cervicalgia y tensión muscular de cuello y hombros",
    medidas: [["ingenieria", "Ubicar la pantalla o la zona de vista a la altura de los ojos y de frente; mejorar la iluminación para no inclinar la cabeza."]],
  },
  tronco: {
    factor: "Tronco inclinado o girado",
    consecuencia: "Lumbalgia, lesiones de disco intervertebral",
    medidas: [
      ["ingenieria", "Elevar o acercar la superficie de trabajo (mesas regulables, mesas elevadoras) para trabajar con el tronco erguido."],
      ["operaciones", "Evitar giros del tronco: girar con los pies; reorganizar el flujo de materiales."],
    ],
  },
  piernas: {
    factor: "Piernas sin apoyo, de pie prolongado o rodillas flexionadas",
    consecuencia: "Fatiga, insuficiencia venosa y molestias de rodilla",
    medidas: [
      ["ingenieria", "Silla o apoyo de pie-sentado, reposapiés y alfombra antifatiga."],
      ["operaciones", "Alternar tareas de pie y sentado durante la jornada."],
    ],
  },
  carga: {
    factor: "Manipulación de cargas o aplicación de fuerza",
    consecuencia: "Lumbalgia, hernia discal, distensiones y accidentes por sobreesfuerzo",
    medidas: [
      ["ingenieria", "Ayudas mecánicas (carretillas, polipastos, mesas elevadoras) y envases de menor peso con asas."],
      ["rrhh", "Formación certificada en manipulación manual de cargas; tareas de carga pesada entre dos personas."],
    ],
  },
  actividad: {
    factor: "Posturas estáticas o movimientos repetitivos",
    consecuencia: "Fatiga muscular y trastornos acumulativos de miembro superior",
    medidas: [
      ["operaciones", "Pausas activas programadas y rotación entre tareas con distinta exigencia física."],
      ["rrhh", "Plan de rotación del personal y programa de pausas activas dentro de la jornada."],
    ],
  },
};

export const ZONAS: Record<Zona, string> = { brazo: "brazo", antebrazo: "antebrazo", muneca: "muñeca", cuello: "cuello", tronco: "tronco", piernas: "piernas", carga: "carga y agarre", actividad: "actividad", silla: "silla", pantalla: "pantalla y teléfono", perifericos: "teclado y mouse" };

// Umbral por zona para considerarla «cargada» (sobre lo neutro de cada método)
const UMBRAL: Partial<Record<Zona, number>> = { brazo: 3, antebrazo: 2, muneca: 3, cuello: 3, tronco: 3, piernas: 2, carga: 2, actividad: 1, silla: 5, pantalla: 5, perifericos: 5 };

/** Hallazgos propuestos a partir del resultado del método (el médico los revisa, edita o borra). */
export function proponerHallazgos(metodo: Metodo, resultado: Resultado, ya: Hallazgo[] = [], nuevoId: () => string = () => Math.random().toString(36).slice(2, 10)): Hallazgo[] {
  if (resultado.urgencia === 0) return [];
  // Probabilidad según la urgencia del método; severidad según la zona (cargas y tronco dañan más)
  const p = [1, 2, 3, 4, 5][resultado.urgencia];
  const nuevos: Hallazgo[] = [];
  for (const [zona, valor] of Object.entries(resultado.zonas) as [Zona, number][]) {
    if (valor < (UMBRAL[zona] ?? 99)) continue;
    const prop = PROPUESTAS[zona];
    const s = zona === "carga" || zona === "tronco" ? 4 : 3;
    // Una medida por zona (la del departamento más eficaz); con riesgo muy alto, también las de los demás
    for (const [departamento, medida] of resultado.urgencia >= 4 ? prop.medidas : prop.medidas.slice(0, 1)) {
      if (ya.some((h) => h.factor === prop.factor && h.departamento === departamento)) continue;
      const pr = prioridad({ p, s });
      nuevos.push({ id: nuevoId(), factor: prop.factor, detalle: `${metodo.corto} · ${ZONAS[zona]}: ${valor} puntos`, p, s, consecuencia: prop.consecuencia, medida, departamento, plazo: pr?.plazo ?? "", origen: "metodo" });
    }
  }
  // Toda evaluación con riesgo deja la vigilancia de la salud de los expuestos
  if (resultado.urgencia >= 2 && !ya.some((h) => h.departamento === "sst" && h.origen === "metodo")) {
    nuevos.push({
      id: nuevoId(), factor: metodo.clave === "niosh" ? "Exposición a manipulación de cargas" : "Exposición a carga postural", detalle: `${metodo.corto} ${resultado.texto ?? resultado.puntaje} · ${resultado.nivel}`, p, s: 3,
      consecuencia: "Trastornos musculoesqueléticos relacionados con el trabajo",
      medida: "Vigilancia de la salud musculoesquelética de los expuestos (evaluación periódica), notificación del riesgo por escrito (LOPCYMAT art. 53.1) y reevaluar el puesto al aplicar las medidas.",
      departamento: "sst", plazo: prioridad({ p, s: 3 })?.plazo ?? "", origen: "metodo",
    });
  }
  return nuevos;
}
