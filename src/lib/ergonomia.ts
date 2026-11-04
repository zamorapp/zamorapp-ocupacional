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

export type ClaveMetodo = "rula" | "reba" | "deb" | "libre";
export type Departamento = "ingenieria" | "operaciones" | "rrhh" | "sst";
export type Zona = "brazo" | "antebrazo" | "muneca" | "cuello" | "tronco" | "piernas" | "carga" | "actividad";

export const DEPARTAMENTOS: { clave: Departamento; nombre: string; enfoque: string }[] = [
  { clave: "ingenieria", nombre: "Ingeniería y mantenimiento", enfoque: "Rediseño del puesto, alturas, alcances, herramientas, ayudas mecánicas" },
  { clave: "operaciones", nombre: "Operaciones y producción", enfoque: "Organización de la tarea, ritmo, pausas, rotación, métodos de trabajo" },
  { clave: "rrhh", nombre: "Recursos Humanos", enfoque: "Formación, rotación del personal, selección y reubicación, jornada" },
  { clave: "sst", nombre: "Seguridad y Salud en el Trabajo", enfoque: "Vigilancia de la salud, seguimiento de medidas, notificación de riesgos" },
];
export const NOMBRE_DEPTO = Object.fromEntries(DEPARTAMENTOS.map((d) => [d.clave, d.nombre])) as Record<Departamento, string>;

export type Opcion = { valor: number; texto: string; detalle?: string };
export type Pregunta = { clave: string; texto: string; opciones: Opcion[]; ayuda?: string };
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

export const METODOS: Record<"rula" | "reba", Metodo> = { rula: RULA, reba: REBA };
export const NOMBRE_METODO: Record<ClaveMetodo, string> = {
  rula: "RULA", reba: "REBA", deb: "DEB · Diagnóstico ergonómico y biomecánico básico (CENEA)", libre: "Inspección con lista de hallazgos",
};

// Métodos recomendados para próximas versiones (se muestran como «Próximamente» con su fuente)
export const PROXIMOS: { corto: string; para: string; fuente: string }[] = [
  { corto: "DEB (CENEA)", para: "Diagnóstico ergonómico y biomecánico básico con lista de chequeo y fotos", fuente: "Centro de Ergonomía Aplicada (CENEA)" },
  { corto: "NIOSH", para: "Levantamiento manual de cargas (límite de peso recomendado)", fuente: "Waters TR et al. Ergonomics 1993;36(7):749-776 · ISO 11228-1" },
  { corto: "ROSA", para: "Puestos de oficina con computadora", fuente: "Sonne M et al. Applied Ergonomics 2012;43(1):98-108" },
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

export const ZONAS: Record<Zona, string> = { brazo: "brazo", antebrazo: "antebrazo", muneca: "muñeca", cuello: "cuello", tronco: "tronco", piernas: "piernas", carga: "carga y agarre", actividad: "actividad" };

// Umbral por zona para considerarla «cargada» (sobre lo neutro de cada método)
const UMBRAL: Partial<Record<Zona, number>> = { brazo: 3, antebrazo: 2, muneca: 3, cuello: 3, tronco: 3, piernas: 2, carga: 2, actividad: 1 };

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
      id: nuevoId(), factor: "Exposición a carga postural", detalle: `${metodo.corto} ${resultado.puntaje} · ${resultado.nivel}`, p, s: 3,
      consecuencia: "Trastornos musculoesqueléticos relacionados con el trabajo",
      medida: "Vigilancia de la salud musculoesquelética de los expuestos (evaluación periódica), notificación del riesgo por escrito (LOPCYMAT art. 53.1) y reevaluar el puesto al aplicar las medidas.",
      departamento: "sst", plazo: prioridad({ p, s: 3 })?.plazo ?? "", origen: "metodo",
    });
  }
  return nuevos;
}
