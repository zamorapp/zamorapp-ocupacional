// COVENIN 474:1997, sección 4 (evaluación de severidad) y Tabla 1 (cargos por incapacidad parcial permanente).
// La base calcula los días cargados con el mismo criterio (trigger calcular_dias_cargados).

export type Incapacidad = "sin_tiempo_perdido" | "temporal" | "parcial_permanente" | "absoluta_permanente" | "fatal";
export type Cargo = { concepto: string; dias: number; porcentaje: number };
export type Testigo = { nombre: string; cedula: string; tipo: "presencial" | "referencial" };

export const ETIQUETA_INCAPACIDAD: Record<Incapacidad, string> = {
  sin_tiempo_perdido: "Sin tiempo perdido",
  temporal: "Incapacidad temporal (días de reposo)",
  parcial_permanente: "Incapacidad parcial permanente (Tabla 1)",
  absoluta_permanente: "Incapacidad absoluta permanente (6.000 días)",
  fatal: "Lesión fatal (6.000 días)",
};

export const CARGO_MAXIMO = 6000;

// Tabla 1 · A (pérdida traumática o quirúrgica) y B (pérdida de función), en días
const dedos: [string, [string, number][]][] = [
  ["Pulgar", [["falange distal", 300], ["falange próxima", 600], ["metacarpo", 900]]],
  ["Índice", [["falange distal", 100], ["falange media", 200], ["falange próxima", 400], ["metacarpo", 600]]],
  ["Medio", [["falange distal", 75], ["falange media", 150], ["falange próxima", 300], ["metacarpo", 500]]],
  ["Anular", [["falange distal", 60], ["falange media", 120], ["falange próxima", 240], ["metacarpo", 450]]],
  ["Meñique", [["falange distal", 50], ["falange media", 100], ["falange próxima", 200], ["metacarpo", 400]]],
];
const pie: [string, [string, number][]][] = [
  ["Dedo gordo del pie", [["falange distal", 150], ["falange próxima", 300], ["metatarso", 600]]],
  ["Otro dedo del pie", [["falange distal", 35], ["falange media", 75], ["falange próxima", 150], ["metatarso", 350]]],
];

export const TABLA_CARGOS: { grupo: string; items: { concepto: string; dias: number }[] }[] = [
  { grupo: "Mano y dedos", items: [...dedos.flatMap(([d, xs]) => xs.map(([p, dias]) => ({ concepto: `${d}, ${p}`, dias }))), { concepto: "Mano hasta la muñeca", dias: 3000 }] },
  { grupo: "Pie y dedos", items: [...pie.flatMap(([d, xs]) => xs.map(([p, dias]) => ({ concepto: `${d}, ${p}`, dias }))), { concepto: "Pie hasta el tobillo", dias: 2400 }] },
  {
    grupo: "Brazo y pierna",
    items: [
      { concepto: "Brazo, arriba del codo y hasta el hombro", dias: 4500 },
      { concepto: "Brazo, arriba de la muñeca y en o debajo del codo", dias: 3600 },
      { concepto: "Pierna, cualquier punto arriba de la rodilla", dias: 4500 },
      { concepto: "Pierna, entre el tobillo y la rodilla", dias: 3000 },
    ],
  },
  {
    grupo: "Sentidos y otros",
    items: [
      { concepto: "Un ojo (pérdida de la vista)", dias: 1800 },
      { concepto: "Un oído (pérdida total del sentido)", dias: 600 },
      { concepto: "Ambos oídos en un accidente (pérdida total)", dias: 3000 },
      { concepto: "Hernia no reducida", dias: 50 },
      { concepto: "Otra incapacidad permanente: % de 6.000 días a juicio médico (4.10)", dias: 6000 },
    ],
  },
];

// Días cargados: 6.000 por muerte o incapacidad absoluta (4.2, 4.3); parcial: suma de la Tabla 1 por el % de pérdida
// (4.5) con tope de 6.000 (4.7).
export function diasCargados(incapacidad: Incapacidad | null, cargos: Cargo[]): number | null {
  if (!incapacidad) return null;
  if (incapacidad === "fatal" || incapacidad === "absoluta_permanente") return CARGO_MAXIMO;
  if (incapacidad !== "parcial_permanente") return 0;
  const total = cargos.reduce((s, c) => s + ((Number(c.dias) || 0) * (Number.isFinite(c.porcentaje) ? c.porcentaje : 100)) / 100, 0);
  return Math.min(CARGO_MAXIMO, Math.round(total));
}

// Código y texto de un valor de lista («1415 Manos (excepto los dedos)»)
export const conCodigo = (valor: string, items: { codigo: string | null; nombre: string }[]) => {
  const i = items.find((x) => x.nombre === valor);
  return i?.codigo ? `${i.codigo} · ${valor}` : valor;
};
