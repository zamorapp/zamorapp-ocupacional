// OCRA Checklist: riesgo por movimientos repetitivos de la extremidad superior (un brazo por evaluación).
// Colombini D, Occhipinti E, Grieco A. Risk assessment and management of repetitive movements and exertions of upper
// limbs. Elsevier 2002 · Occhipinti E. Ergonomics 1998;41(9):1290-1311 · ISO 11228-3:2007.
// Tablas tal como las publica Ergonautas (Diego-Mas JA, Universidad Politécnica de Valencia, 2025).
// ICKL = (FR + FF + FFz + FP + FC) · MD
import type { Metodo, Opcion, Respuestas, Resultado } from "@/lib/ergonomia";

const o = (valor: number, texto: string, detalle?: string): Opcion => ({ valor, texto, detalle });
const v = (r: Respuestas, k: string) => (Number.isFinite(r[k]) ? r[k] : 0);
const NO_SI: Opcion[] = [o(0, "No"), o(1, "Sí")];

// Multiplicador de duración según el tiempo neto de trabajo repetitivo (minutos); bajo 60 min, la tabla multitarea
const MD: [number, number][] = [[1.87, 0.01], [3.75, 0.02], [7.5, 0.05], [15, 0.1], [30, 0.2], [59, 0.35], [120, 0.5], [180, 0.65], [240, 0.75], [300, 0.85], [360, 0.925], [420, 0.95], [480, 1], [539, 1.2], [599, 1.5], [659, 2], [719, 2.8]];
export const multiplicadorDuracion = (min: number) => MD.find(([hasta]) => min <= hasta)?.[1] ?? 4;

const FISICOS = [
  ["ocGuantes", "Guantes que estorban el agarre más de la mitad del tiempo"],
  ["ocGolpes", "Golpear (martillo, pico) 2 veces por minuto o más, o 10 veces por hora o más"],
  ["ocFrio", "Frío (menos de 0 °C) más de la mitad del tiempo"],
  ["ocVibra", "Herramientas que vibran, 1/3 del tiempo o más"],
  ["ocCompresion", "Herramientas que comprimen la piel (enrojecimiento, callos, ampollas)"],
  ["ocPrecision", "Tareas de precisión (áreas de menos de 2-3 mm) más de la mitad del tiempo"],
] as const;

export const OCRA: Metodo = {
  clave: "ocra",
  nombre: "OCRA Checklist · Movimientos repetitivos de la extremidad superior",
  corto: "OCRA",
  paraQue: "Tareas por ciclos con brazos y manos: empaque, ensamblaje, cajas, costura, línea de producción.",
  fuente: "Colombini, Occhipinti y Grieco, Elsevier 2002 · Occhipinti, Ergonomics 1998;41(9):1290-1311 · ISO 11228-3.",
  secciones: [
    {
      titulo: "Tiempos de la jornada en el puesto",
      zona: "actividad",
      preguntas: [
        { clave: "turno", texto: "Duración del turno en el puesto", opciones: [], numero: { min: 30, max: 900, unidad: "min" } },
        { clave: "pausas", texto: "Pausas (oficiales y no oficiales)", opciones: [], numero: { min: 0, max: 300, unidad: "min" } },
        { clave: "almuerzo", texto: "Descanso para almorzar dentro del turno", opciones: [], numero: { min: 0, max: 120, unidad: "min" } },
        { clave: "noRepetitivo", texto: "Tareas no repetitivas (limpiar, reponer, esperar)", opciones: [], numero: { min: 0, max: 900, unidad: "min" },
          ayuda: "El tiempo neto repetitivo es el turno menos pausas, almuerzo y tareas no repetitivas." },
      ],
    },
    {
      titulo: "Recuperación",
      zona: "actividad",
      preguntas: [
        { clave: "fr", texto: "Pausas de recuperación en el turno", opciones: [
          o(0, "8 min cada hora", "o recuperación dentro del ciclo (10 s de cada 60)"),
          o(2, "4 pausas de 8 min", "además del almuerzo en 7-8 h, o 4 en 6 h"),
          o(3, "3 pausas de 8 min", "además del almuerzo en 7-8 h, o 2 en 6 h"),
          o(4, "2 pausas de 8 min", "además del almuerzo en 7-8 h, o 3 sin almuerzo, o 1 en 6 h"),
          o(6, "1 pausa o solo el almuerzo", "1 pausa en 7 h sin almuerzo, o solo almuerzo en 8 h"),
          o(10, "Sin pausas reales", "menos de 5 min en 7-8 h")] },
      ],
    },
    {
      titulo: "Frecuencia de las acciones técnicas",
      zona: "actividad",
      preguntas: [
        { clave: "atd", texto: "Acciones dinámicas (movimientos del brazo)", opciones: [
          o(0, "Lentos", "unas 20 acciones/min, pausas frecuentes"),
          o(1, "No muy rápidos", "unas 30 acciones/min, pequeñas pausas"),
          o(3, "Bastante rápidos", "más de 40/min, pequeñas pausas"),
          o(4, "Bastante rápidos sin pausas", "más de 40/min, pausas ocasionales e irregulares"),
          o(6, "Rápidos", "más de 50/min, pausas ocasionales"),
          o(8, "Rápidos sin pausas", "más de 60/min, cuesta mantener el ritmo"),
          o(10, "Muy rápidos", "70/min o más, sin pausas")] },
        { clave: "ate", texto: "Acciones estáticas (sostener un objeto 5 s seguidos o más)", opciones: [
          o(0, "No o poco"), o(2.5, "2/3 del ciclo"), o(4.5, "Todo el ciclo")] },
      ],
    },
    {
      titulo: "Fuerza (escala de Borg CR-10)",
      zona: "carga",
      preguntas: [
        { clave: "fzMod", texto: "Fuerza moderada (Borg 3-4)", opciones: [o(0, "No"), o(2, "1/3 del tiempo"), o(4, "50 %"), o(6, "Más del 50 %"), o(8, "Casi todo")] },
        { clave: "fzInt", texto: "Fuerza intensa (Borg 5-7)", opciones: [o(0, "No"), o(4, "2 s cada 10 min"), o(8, "1 % del tiempo"), o(16, "5 % del tiempo"), o(24, "Más del 10 % del tiempo")] },
        { clave: "fzMax", texto: "Fuerza casi máxima (Borg 8 o más)", opciones: [o(0, "No"), o(6, "2 s cada 10 min"), o(12, "1 % del tiempo"), o(24, "5 % del tiempo"), o(32, "Más del 10 % del tiempo")] },
      ],
    },
    {
      titulo: "Posturas y movimientos",
      zona: "brazo",
      preguntas: [
        { clave: "hombro", texto: "Hombro: brazo a la altura del hombro sin apoyo", opciones: [
          o(0, "No"), o(1, "Algo elevado", "más de la mitad del tiempo"), o(2, "10 % del tiempo"), o(6, "1/3 del tiempo"), o(12, "Más de la mitad"), o(24, "Todo el tiempo")] },
        { clave: "sobreCabeza", texto: "Las manos quedan por encima de la cabeza (duplica el hombro)", opciones: NO_SI },
        { clave: "codo", texto: "Codo: movimientos bruscos (flexo-extensión o giro extremo, tirones, golpes)", opciones: [o(0, "No"), o(2, "1/3 del tiempo"), o(4, "Más de la mitad"), o(8, "Casi todo")] },
        { clave: "muneca", texto: "Muñeca: doblada en posición extrema", opciones: [o(0, "No"), o(2, "1/3 del tiempo"), o(4, "Más de la mitad"), o(8, "Todo el tiempo")] },
        { clave: "agarre", texto: "Mano: agarre en pinza, gancho o palmar", opciones: [o(0, "No"), o(2, "1/3 del tiempo"), o(4, "Más de la mitad"), o(8, "Casi todo")] },
        { clave: "estereo", texto: "Movimientos idénticos repetidos (estereotipia)", opciones: [
          o(0, "No"), o(1.5, "2/3 del tiempo", "o ciclo de 8 a 15 s"), o(3, "Casi todo el tiempo", "o ciclo de menos de 8 s")] },
      ],
    },
    {
      titulo: "Factores adicionales",
      zona: "actividad",
      preguntas: [
        ...FISICOS.map(([clave, texto]) => ({ clave, texto, opciones: NO_SI })),
        { clave: "concurren", texto: "Si hay varios, ¿cuánto tiempo concurren?", opciones: [o(0, "Uno solo o poco"), o(1, "Más de la mitad"), o(2, "Todo el tiempo")] },
        { clave: "fso", texto: "Ritmo impuesto por la máquina", opciones: [o(0, "No"), o(1, "En parte", "con pequeños márgenes"), o(2, "Totalmente")] },
      ],
    },
  ],
  calcular(r): Resultado {
    const tntr = Math.max(0, v(r, "turno") - v(r, "pausas") - v(r, "almuerzo") - v(r, "noRepetitivo"));
    const md = multiplicadorDuracion(tntr);
    const fr = v(r, "fr");
    const ff = Math.max(v(r, "atd"), v(r, "ate"));
    const ffz = v(r, "fzMod") + v(r, "fzInt") + v(r, "fzMax");
    const pho = v(r, "hombro") * (v(r, "sobreCabeza") ? 2 : 1);
    const fp = Math.max(pho, v(r, "codo"), v(r, "muneca"), v(r, "agarre")) + v(r, "estereo");
    const fisicos = FISICOS.filter(([k]) => v(r, k) === 1).length;
    const ffm = !fisicos ? 0 : v(r, "concurren") === 2 ? 3 : 2;
    const fc = ffm + v(r, "fso");
    const ickl = Math.round((fr + ff + ffz + fp + fc) * md * 10) / 10;
    const completo = ["turno", "fr", "atd", "ate", "fzMod", "fzInt", "fzMax", "hombro", "codo", "muneca", "agarre", "estereo", "fso"].every((k) => k in r) && tntr > 0;
    const [urgencia, nivel, accion] =
      ickl > 22.5 ? [4, "Inaceptable alto", "Mejorar el puesto de inmediato, supervisión médica y entrenamiento"] as const
      : ickl > 14 ? [3, "Inaceptable medio", "Mejorar el puesto pronto, supervisión médica y entrenamiento"] as const
      : ickl > 11 ? [2, "Inaceptable leve", "Mejorar el puesto, supervisión médica y entrenamiento"] as const
      : ickl > 7.5 ? [1, "Incierto", "Nuevo análisis o mejora del puesto"] as const
      : ickl > 5 ? [0, "Aceptable", "No se requieren medidas"] as const
      : [0, "Óptimo", "No se requieren medidas"] as const;
    const coma = (n: number) => String(n).replace(".", ",");
    return {
      puntaje: ickl, maximo: 22.5, urgencia, nivel, accion, completo,
      texto: `ICKL ${coma(ickl)}`,
      subtexto: `Tiempo neto repetitivo ${tntr} min · multiplicador ${coma(md)}`,
      parciales: [
        { etiqueta: "Recuperación (FR)", valor: fr }, { etiqueta: "Frecuencia (FF)", valor: ff }, { etiqueta: "Fuerza (FFz)", valor: ffz },
        { etiqueta: "Posturas (FP)", valor: fp }, { etiqueta: "Adicionales (FC)", valor: fc },
        { etiqueta: "Multiplicador de duración (MD)", valor: md }, { etiqueta: "Índice Check List OCRA", valor: ickl },
      ],
      zonas: {
        brazo: pho >= 6 ? 3 : 0,
        antebrazo: v(r, "codo") >= 4 ? 2 : 0,
        muneca: Math.max(v(r, "muneca"), v(r, "agarre")) >= 4 ? 3 : 0,
        carga: ffz >= 8 ? 2 : 0,
        actividad: fr >= 4 || ff >= 4 || v(r, "estereo") >= 3 ? 1 : 0,
      },
    };
  },
};
