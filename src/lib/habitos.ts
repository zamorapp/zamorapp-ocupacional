// Hábitos psicobiológicos estructurados (Cesar, 06-nov).
// Cada hábito guarda `detalle` (lo que se eligió) y `valor` (texto clínico ya armado).
// `valor` sigue siendo lo que leen el informe, la historia, el celular y el enlace del paciente,
// así que las consultas viejas (solo `valor`) siguen funcionando igual.
import type { Habito } from "./consultas-tipos";

export type DetalleHabito = Partial<Record<CampoHabito, string>>;
export type CampoHabito = "estado" | "tipo" | "frecuencia" | "cantidad" | "desde" | "horas" | "reparador" | "disciplina" | "parejas" | "nota";

type Campo = { campo: CampoHabito; etiqueta: string; opciones?: string[]; libre?: string; solo?: string[] };
export type FormaHabito = {
  estados: { valor: string; nombre: string }[];
  campos: Campo[];
  normal: DetalleHabito;
  opcional?: boolean;
};

const CONSUMO = [
  { valor: "niega", nombre: "Niega" },
  { valor: "si", nombre: "Consume" },
  { valor: "ex", nombre: "Ya no consume" },
];
const FRECUENCIA_CONSUMO = ["Muy eventual", "Eventual", "Social", "Fines de semana", "Semanal", "Todos los días"];
const ACTIVO = ["si", "ex"];

export const FORMAS_HABITO: Record<string, FormaHabito> = {
  alcohol: {
    estados: CONSUMO,
    campos: [
      { campo: "tipo", etiqueta: "Bebida", opciones: ["Cerveza", "Ron", "Whisky", "Vino", "Otros"], solo: ACTIVO },
      { campo: "frecuencia", etiqueta: "Frecuencia", opciones: FRECUENCIA_CONSUMO, solo: ACTIVO },
      { campo: "desde", etiqueta: "Lo dejó hace", libre: "2 años", solo: ["ex"] },
    ],
    normal: { estado: "niega" },
  },
  tabaco: {
    estados: CONSUMO,
    campos: [
      { campo: "tipo", etiqueta: "Tipo", opciones: ["Cigarrillo", "Tabaco", "Vapeador", "Otros"], solo: ACTIVO },
      { campo: "frecuencia", etiqueta: "Frecuencia", opciones: ["Ocasional", "Eventual", "Social", "Fines de semana", "Todos los días"], solo: ACTIVO },
      { campo: "cantidad", etiqueta: "Cantidad", opciones: ["Pocas unidades", "Media caja", "Una caja", "Dos cajas", "Más de dos cajas"], solo: ACTIVO },
      { campo: "desde", etiqueta: "Lo dejó hace", libre: "5 años", solo: ["ex"] },
    ],
    normal: { estado: "niega" },
  },
  estupefacientes: {
    estados: CONSUMO,
    campos: [
      { campo: "tipo", etiqueta: "Sustancia", opciones: ["Marihuana", "Cocaína", "Crack", "Crispy", "Otros"], solo: ACTIVO },
      { campo: "frecuencia", etiqueta: "Frecuencia", opciones: FRECUENCIA_CONSUMO, solo: ACTIVO },
      { campo: "desde", etiqueta: "Último consumo hace", libre: "1 año", solo: ["ex"] },
    ],
    normal: { estado: "niega" },
  },
  cafe: {
    estados: [{ valor: "niega", nombre: "Niega" }, { valor: "si", nombre: "Consume" }],
    campos: [{ campo: "cantidad", etiqueta: "Al día", opciones: ["1 taza", "2 a 3 tazas", "4 o más tazas"], solo: ["si"] }],
    normal: { estado: "niega" },
  },
  medicamentos: {
    estados: [{ valor: "niega", nombre: "Niega" }, { valor: "si", nombre: "Toma" }],
    campos: [{ campo: "tipo", etiqueta: "Cuáles", libre: "Losartán 50 mg diario", solo: ["si"] }],
    normal: { estado: "niega" },
  },
  actividad_fisica: {
    estados: [
      { valor: "no", nombre: "Sedentario" },
      { valor: "si", nombre: "Practica" },
      { valor: "regular", nombre: "Regular" },
    ],
    campos: [
      { campo: "disciplina", etiqueta: "Disciplina", libre: "Caminata, fútbol, gimnasio…", solo: ["si"] },
      { campo: "frecuencia", etiqueta: "Frecuencia", opciones: ["Todos los días", "Interdiaria", "Semanal", "Fines de semana", "Eventual"], solo: ["si"] },
    ],
    normal: { estado: "regular" },
  },
  sueno: {
    estados: [{ valor: "si", nombre: "Reparador" }, { valor: "no", nombre: "No reparador" }],
    campos: [{ campo: "horas", etiqueta: "Horas", opciones: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] }],
    normal: { estado: "si", horas: "8" },
  },
  alimentacion: {
    estados: [
      { valor: "balanceada", nombre: "Balanceada" },
      { valor: "carbohidratos", nombre: "Predominio de carbohidratos" },
      { valor: "hipocalorica", nombre: "Hipocalórica" },
      { valor: "desbalanceada", nombre: "Desbalanceada" },
    ],
    campos: [],
    normal: { estado: "balanceada" },
  },
  sexual: {
    estados: [{ valor: "si", nombre: "Activo" }, { valor: "no", nombre: "Inactivo" }],
    campos: [{ campo: "parejas", etiqueta: "Parejas", opciones: ["Una pareja", "Dos parejas", "Más de dos parejas"], solo: ["si"] }],
    normal: {},
    opcional: true,
  },
};

// Hábitos que el formulario siempre ofrece aunque la lista de la organización no los tenga
export const HABITOS_EXTRA: Habito[] = [{ clave: "sexual", nombre: "Sexuales", valor: "" }];

export function completarHabitos(habitos: Habito[]): Habito[] {
  const faltan = HABITOS_EXTRA.filter((e) => !habitos.some((h) => h.clave === e.clave));
  return faltan.length ? [...habitos, ...faltan] : habitos;
}

export const formaDe = (clave: string): FormaHabito | undefined => FORMAS_HABITO[clave];

export function campoVisible(c: { solo?: string[] }, d: DetalleHabito) {
  return !c.solo || c.solo.includes(d.estado ?? "");
}

const minus = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// Texto clínico a partir de lo elegido. Vacío si no se eligió nada.
export function textoHabito(clave: string, d: DetalleHabito): string {
  const forma = formaDe(clave);
  const nota = d.nota?.trim();
  const v = (c: CampoHabito) => (forma && !campoVisible(forma.campos.find((x) => x.campo === c) ?? {}, d) ? "" : d[c]?.trim() ?? "");
  let base = "";
  switch (clave) {
    case "alcohol":
    case "tabaco":
    case "estupefacientes": {
      const que = [v("tipo") && minus(v("tipo")), v("cantidad") && minus(v("cantidad")), v("frecuencia") && minus(v("frecuencia"))].filter(Boolean).join(", ");
      if (d.estado === "niega") base = "Niega";
      else if (d.estado === "si") base = `Consume${que ? ` ${que}` : ""}`;
      else if (d.estado === "ex") base = `Exconsumidor${que ? ` (${que})` : ""}${v("desde") ? `, dejó hace ${v("desde")}` : ""}`;
      break;
    }
    case "cafe":
      base = d.estado === "niega" ? "Niega" : d.estado === "si" ? `Consume${v("cantidad") ? ` ${v("cantidad")} al día` : ""}` : "";
      break;
    case "medicamentos":
      base = d.estado === "niega" ? "Niega" : d.estado === "si" ? v("tipo") || "Toma medicamentos" : "";
      break;
    case "actividad_fisica":
      if (d.estado === "no") base = "Sedentario";
      else if (d.estado === "regular") base = "Actividad física regular";
      else if (d.estado === "si") base = [v("disciplina") || "Practica actividad física", v("frecuencia") && minus(v("frecuencia"))].filter(Boolean).join(", ");
      break;
    case "sueno": {
      const horas = v("horas") ? `${v("horas")} ${v("horas") === "1" ? "hora" : "horas"}` : "";
      const tipo = d.estado === "si" ? "Reparador" : d.estado === "no" ? "No reparador" : "";
      base = [tipo, horas && (tipo ? `de ${horas}` : horas)].filter(Boolean).join(" ");
      break;
    }
    case "alimentacion":
      base = forma?.estados.find((e) => e.valor === d.estado)?.nombre ?? "";
      break;
    case "sexual":
      base = d.estado === "no" ? "Sin actividad sexual" : d.estado === "si" ? `Sexualmente activo${v("parejas") ? `, ${minus(v("parejas"))}` : ""}` : "";
      break;
  }
  return [base, nota].filter(Boolean).join(". ");
}

// Detalle de un hábito; si es de una consulta vieja (solo texto), el texto pasa a la nota para no perderlo.
export function detalleDe(h: Habito): DetalleHabito {
  if (h.detalle) return h.detalle;
  const t = h.valor.trim();
  if (!t) return {};
  if (/^niega\.?$/i.test(t) && formaDe(h.clave)?.estados.some((e) => e.valor === "niega")) return { estado: "niega" };
  return { nota: t };
}

export const conDetalle = (h: Habito, d: DetalleHabito): Habito => ({ ...h, detalle: d, valor: textoHabito(h.clave, d) });

export function habitosNormales(habitos: Habito[]): Habito[] {
  return habitos.map((h) => {
    const f = formaDe(h.clave);
    if (!f || f.opcional) return h;
    return conDetalle(h, { ...f.normal });
  });
}

export function todosNormales(habitos: Habito[]) {
  const conForma = habitos.filter((h) => formaDe(h.clave) && !formaDe(h.clave)!.opcional);
  return conForma.length > 0 && conForma.every((h) => {
    const d = h.detalle;
    const n = formaDe(h.clave)!.normal;
    return d && !d.nota?.trim() && Object.keys(n).every((k) => d[k as CampoHabito] === n[k as CampoHabito]);
  });
}

// Para informes e historia: una sola frase si todo está en lo normal; si no, «Nombre: texto» de cada uno.
export function resumenHabitos(habitos: Habito[]): string {
  const llenos = habitos.filter((h) => h.valor.trim());
  if (!llenos.length) return "";
  if (todosNormales(habitos)) {
    const extra = llenos.filter((h) => formaDe(h.clave)?.opcional || !formaDe(h.clave)).map((h) => `${h.nombre}: ${h.valor.trim()}`);
    return ["No refiere hábitos psicobiológicos de importancia. Sueño reparador de 8 horas, actividad física regular y alimentación balanceada", ...extra].join(" · ");
  }
  return llenos.map((h) => `${h.nombre}: ${h.valor.trim()}`).join(" · ");
}
