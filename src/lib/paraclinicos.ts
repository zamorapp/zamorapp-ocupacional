// Resultados de paraclínicos: rango del catálogo, semáforo y pendientes. Compartido entre servidor y cliente.
import type { Paraclinico } from "@/lib/consultas-tipos";

export type EstadoResultado = "" | "normal" | "fuera" | "alterado";

// Lo que guarda el catálogo (lista «paraclinico») en lista_items.datos
export type DefExamen = {
  tipo: "numero" | "informe";
  unidad: string;
  min: number | null;
  max: number | null;
  minF: number | null;
  maxF: number | null;
};

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function defExamen(datos: Record<string, unknown> | null | undefined): DefExamen {
  const d = datos ?? {};
  return {
    tipo: d.tipo === "informe" ? "informe" : "numero",
    unidad: typeof d.unidad === "string" ? d.unidad : "",
    min: num(d.rango_min),
    max: num(d.rango_max),
    minF: num(d.rango_min_f),
    maxF: num(d.rango_max_f),
  };
}

// Rango que aplica según el sexo del trabajador (si el catálogo tiene uno distinto para mujeres)
export function rango(def: DefExamen, sexo: string | null) {
  const f = sexo === "F" && (def.minF !== null || def.maxF !== null);
  return { min: f ? def.minF : def.min, max: f ? def.maxF : def.max };
}

const fmt = (n: number) => String(n).replace(".", ",");

export function textoReferencia(def: DefExamen, sexo: string | null) {
  const { min, max } = rango(def, sexo);
  if (min !== null && max !== null) return `${fmt(min)}–${fmt(max)}`;
  if (max !== null) return `< ${fmt(max)}`;
  if (min !== null) return `> ${fmt(min)}`;
  return "";
}

// Fuera de rango leve (hasta 25 % del ancho del rango) o alterado (más lejos)
export function estadoCalculado(valor: string, def: DefExamen, sexo: string | null): EstadoResultado {
  if (def.tipo === "informe") return "";
  const v = num(valor.trim());
  if (v === null) return "";
  const { min, max } = rango(def, sexo);
  if (min === null && max === null) return "";
  if ((min === null || v >= min) && (max === null || v <= max)) return "normal";
  const ancho = min !== null && max !== null ? max - min : Math.abs(max ?? min ?? 1) || 1;
  const distancia = max !== null && v > max ? v - max : (min ?? 0) - v;
  return distancia / ancho > 0.25 ? "alterado" : "fuera";
}

export const pendiente = (p: Paraclinico) => !p.resultado?.trim() && !p.estado;

export function contarResultados(lista: Paraclinico[]) {
  const c = { pendientes: 0, normales: 0, alterados: 0 };
  for (const p of lista) {
    if (pendiente(p)) c.pendientes++;
    else if (p.estado === "normal") c.normales++;
    else if (p.estado === "fuera" || p.estado === "alterado") c.alterados++;
  }
  return c;
}

export const ETIQUETA_RESULTADO: Record<EstadoResultado, string> = { "": "Pendiente", normal: "Normal", fuera: "Fuera de rango", alterado: "Alterado" };
// Píldora y punto del semáforo (tokens de estado de zamorApp)
export const ESTILO_RESULTADO: Record<EstadoResultado, { pildora: string; punto: string }> = {
  "": { pildora: "bg-muted text-muted-foreground", punto: "bg-input" },
  normal: { pildora: "bg-ok/15 text-ok-texto", punto: "bg-ok" },
  fuera: { pildora: "bg-aviso/20 text-aviso-texto", punto: "bg-aviso" },
  alterado: { pildora: "bg-alerta/15 text-alerta-texto", punto: "bg-alerta" },
};

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Texto para impresos: «126 mg/dL (alterado)», «Normal», «Normal · sin alteraciones» o «pendiente»
export function textoResultado(p: Paraclinico) {
  const r = p.resultado?.trim();
  const marca = p.estado === "fuera" ? "fuera de rango" : p.estado === "alterado" ? "alterado" : "";
  if (!r) return p.estado ? ETIQUETA_RESULTADO[p.estado] : "pendiente";
  if (/^-?\d+([.,]\d+)?$/.test(r)) return `${r}${p.unidad ? ` ${p.unidad}` : ""}${marca ? ` (${marca})` : ""}`;
  return p.estado ? `${ETIQUETA_RESULTADO[p.estado]} · ${r}` : r;
}
