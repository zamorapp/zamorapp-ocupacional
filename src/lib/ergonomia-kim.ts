// KIM-PP: empuje y arrastre de cargas con carretillas, carros, monorrieles o grúas suspendidas.
// BAuA (Instituto Federal de Seguridad y Salud en el Trabajo, Alemania). Key Indicator Method for assessing and designing
// physical workloads with respect to manual Pushing and Pulling of loads (KIM-PP), versión 2019.
// Puntaje = (masa + recorrido + condiciones + equipo + postura + organización) × puntos de tiempo (× 1,3 si son mujeres).
// Donde la hoja distingue tipos de carretilla o de ruedas con dibujos, se toma la columna más exigente (criterio prudente).
import type { Metodo, Opcion, Respuestas, Resultado } from "@/lib/ergonomia";

const o = (valor: number, texto: string, detalle?: string): Opcion => ({ valor, texto, detalle });
const v = (r: Respuestas, k: string) => (Number.isFinite(r[k]) ? r[k] : 0);
const NO_SI: Opcion[] = [o(0, "No"), o(1, "Sí")];

// Puntos de tiempo por recorrido en metros (o duración) por jornada
const TIEMPO: [number, number][] = [[40, 1], [200, 1.5], [400, 2], [800, 2.5], [1200, 3], [1800, 3.5], [2500, 4], [4200, 5], [6300, 6], [8400, 7], [11000, 8], [15000, 9], [20000, 10]];
export const puntosTiempo = (metros: number) => TIEMPO.find(([hasta]) => metros <= hasta)?.[1] ?? 10;

// Puntos por masa movida (incluido el equipo); 100 = la hoja la marca en gris: no se mueve con seguridad
const BANDAS = [50, 100, 200, 300, 400, 600, 800, 1000, 1300];
const MASA: Record<number, number[]> = {
  1: [3, 5, 10, 50, 100, 100, 100, 100, 100, 100], // carretilla de una rueda
  2: [2.5, 4, 7, 50, 100, 100, 100, 100, 100, 100], // carretilla de un eje (dos ruedas, diablito)
  3: [2.5, 3, 4, 5, 7, 12, 50, 100, 100, 100], // carro solo con ruedas giratorias
  4: [3, 4, 6, 8, 12, 50, 100, 100, 100, 100], // contenedor con ruedas giratorias simples, a la intemperie
  5: [1, 1, 2, 3, 4, 6, 10, 15, 50, 100], // carro con ruedas fijas o giratorias con traba
  6: [1, 1, 1.5, 2, 2.5, 4, 7, 10, 50, 100], // carro guiado con barra de tiro
  7: [1, 1, 1.5, 2, 2.5, 4, 7, 10, 20, 50], // monorriel suspendido
  8: [2, 2.5, 3.5, 4.5, 6, 10, 15, 50, 100, 100], // grúa puente suspendida
};
export const puntosMasa = (equipo: number, kg: number) => {
  const fila = MASA[equipo];
  if (!fila) return 0;
  const i = BANDAS.findIndex((hasta) => kg <= hasta);
  return fila[i === -1 ? BANDAS.length : i];
};
const SUSPENDIDO = (equipo: number) => equipo === 7 || equipo === 8;

const CONDICIONES = [
  ["kArranque", "Arrancar cuesta mucho: el equipo se hunde o se atasca", 3],
  ["kParadasFreno", "Paradas frecuentes frenando", 3],
  ["kParadas", "Paradas frecuentes sin frenar", 1],
  ["kManiobra", "Muchas curvas, cambios de dirección o maniobras", 3],
  ["kPreciso", "Hay que colocar y detener la carga con precisión o seguir un camino exacto", 1],
  ["kRapido", "Se mueve rápido (más o menos 1 a 1,3 m/s)", 2],
] as const;
const PROPIEDADES = [
  ["kSinAsas", "Sin asas o asas inadecuadas", 2],
  ["kSinFreno", "Sin freno, o freno insuficiente en bajadas", 3],
  ["kRuedasMal", "Ruedas inadecuadas para el piso (pequeñas, blandas, de mal material)", 2],
  ["kRuedasDanadas", "Ruedas dañadas, desgastadas o sin mantenimiento", 2],
] as const;
const suma = (r: Respuestas, lista: readonly (readonly [string, string, number])[]) =>
  Math.min(4, lista.reduce((t, [k, , pts]) => t + (v(r, k) === 1 ? pts : 0), 0));

export const KIM: Metodo = {
  clave: "kim",
  nombre: "KIM-PP · Empuje y arrastre de cargas",
  corto: "KIM",
  paraQue: "Mover cargas con carretillas, carros, jaulas, contenedores con ruedas, monorrieles o grúas a mano.",
  fuente: "BAuA (Alemania), Key Indicator Method KIM-PP 2019 · ISO 11228-2.",
  secciones: [
    {
      titulo: "Equipo y carga",
      zona: "carga",
      preguntas: [
        { clave: "equipo", texto: "¿Con qué se mueve la carga?", sinPuntos: true, opciones: [
          o(1, "Carretilla de una rueda"), o(2, "Carretilla de dos ruedas o diablito", "un solo eje"),
          o(3, "Carro con ruedas giratorias", "las 4 ruedas giran"), o(4, "Contenedor con ruedas simples a la intemperie", "por ejemplo, de basura"),
          o(5, "Carro con ruedas fijas", "o giratorias con traba"), o(6, "Carro guiado con barra de tiro"),
          o(7, "Monorriel suspendido"), o(8, "Grúa puente suspendida")] },
        { clave: "masa", texto: "Masa total que se mueve (carga más el equipo)", opciones: [], numero: { min: 1, max: 3000, unidad: "kg" },
          ayuda: "Pesa el equipo vacío y súmale la carga más pesada habitual." },
        { clave: "recorrido", texto: "Recorrido total empujando o arrastrando en la jornada", opciones: [], numero: { min: 1, max: 30000, unidad: "m" },
          ayuda: "Si solo sabes el tiempo: cada minuto empujando son unos 42 m (a paso de 2,5 km/h)." },
      ],
    },
    {
      titulo: "Piso y pendientes",
      zona: "carga",
      si: (r) => !SUSPENDIDO(v(r, "equipo")),
      preguntas: [
        { clave: "piso", texto: "Estado del piso", opciones: [
          o(0, "Liso, firme, seco y plano"), o(1, "Casi liso, con pequeños daños", "sin pendientes"),
          o(2, "Mezcla de adoquín, concreto y asfalto", "pendientes leves, bordillos rebajados"),
          o(3, "Adoquín irregular o arena compacta", "pendientes leves, bordes o umbrales pequeños"),
          o(6, "Tierra o adoquín muy irregular", "huecos, mucha suciedad, escalones o umbrales")] },
        { clave: "pendiente", texto: "Pendientes importantes en el recorrido", opciones: [
          o(0, "No", "hasta 2°"), o(5, "De 2 a 4°", "4 a 8 %"), o(10, "De 5 a 10°", "9 a 18 %"), o(25, "Más de 10° o escaleras")] },
      ],
    },
    {
      titulo: "Condiciones del trabajo (suman hasta 4)",
      zona: "actividad",
      preguntas: CONDICIONES.map(([clave, texto]) => ({ clave, texto, opciones: NO_SI })),
    },
    {
      titulo: "Estado del equipo (suman hasta 4)",
      zona: "carga",
      preguntas: PROPIEDADES.map(([clave, texto]) => ({ clave, texto, opciones: NO_SI })),
    },
    {
      titulo: "Postura y organización",
      zona: "tronco",
      preguntas: [
        { clave: "postura", texto: "Postura al empujar o arrastrar", opciones: [
          o(3, "Tronco recto o algo inclinado", "sin giros; altura de agarre libre; nada estorba las piernas"),
          o(5, "Cuerpo inclinado hacia donde avanza", "o giro leve al tirar de un lado; agarre fijo a 0,9–1,2 m; sobre todo arrastrando"),
          o(8, "Posturas forzadas", "agarre fijo por encima de 1,2 m, fuerza de un lado, no se ve el camino, giros o inclinación frecuentes")] },
        { clave: "organizacion", texto: "Organización de la jornada", opciones: [
          o(0, "Buena", "alterna seguido con otras tareas"), o(2, "Limitada", "alterna poco"), o(4, "Desfavorable", "casi sin alternar, con picos de esfuerzo")] },
        { clave: "mujeres", texto: "¿Lo hacen mujeres?", opciones: [o(0, "No"), o(1, "Sí", "el puntaje se multiplica por 1,3")] },
      ],
    },
  ],
  calcular(r): Resultado {
    const equipo = v(r, "equipo");
    const pMasa = puntosMasa(equipo, v(r, "masa"));
    const pPiso = SUSPENDIDO(equipo) ? 0 : v(r, "piso") + v(r, "pendiente");
    const pCond = suma(r, CONDICIONES);
    const pEquipo = suma(r, PROPIEDADES);
    const pPostura = v(r, "postura");
    const pOrg = v(r, "organizacion");
    const pTiempo = puntosTiempo(v(r, "recorrido"));
    const factor = v(r, "mujeres") === 1 ? 1.3 : 1;
    const total = Math.round((pMasa + pPiso + pCond + pEquipo + pPostura + pOrg) * pTiempo * factor * 10) / 10;
    const completo = ["equipo", "masa", "recorrido", "postura", "organizacion", "mujeres"].every((k) => k in r) && (SUSPENDIDO(equipo) || ("piso" in r && "pendiente" in r));
    const [urgencia, nivel, accion] =
      total >= 100 ? [4, "Alto", "Rediseñar el puesto es necesario; además, otras medidas de prevención"] as const
      : total >= 50 ? [3, "Aumentado", "Rediseñar el puesto y otras medidas de prevención"] as const
      : total >= 20 ? [1, "Algo aumentado", "Para personas menos resistentes, rediseño y prevención pueden ayudar"] as const
      : [0, "Bajo", "No se requieren medidas"] as const;
    const coma = (n: number) => String(n).replace(".", ",");
    return {
      puntaje: total, maximo: 100, urgencia, nivel, accion, completo,
      texto: `${coma(total)} puntos`,
      subtexto: `${coma(v(r, "masa"))} kg · ${coma(v(r, "recorrido"))} m por jornada${factor > 1 ? " · ×1,3 mujeres" : ""}${pMasa >= 50 ? " · masa que no se mueve con seguridad" : ""}`,
      parciales: [
        { etiqueta: "Masa", valor: pMasa }, { etiqueta: "Piso y pendientes", valor: pPiso }, { etiqueta: "Condiciones", valor: pCond },
        { etiqueta: "Estado del equipo", valor: pEquipo }, { etiqueta: "Postura", valor: pPostura }, { etiqueta: "Organización", valor: pOrg },
        { etiqueta: "Puntos de tiempo", valor: pTiempo }, { etiqueta: "Puntaje KIM-PP", valor: total },
      ],
      zonas: {
        carga: pMasa >= 4 || pEquipo >= 2 || pPiso >= 5 ? 3 : 0,
        tronco: pPostura >= 5 ? 3 : 0,
        actividad: pOrg >= 2 || pCond >= 3 ? 1 : 0,
      },
    };
  },
};
