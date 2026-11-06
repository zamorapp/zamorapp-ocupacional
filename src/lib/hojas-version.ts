// Versión propia de la organización de cada hoja para el paciente (migración 20261030913000): solo los cambios sobre
// el texto de la app, con el mismo formato de ?c= (cambios-hoja.ts). Una por hoja: «dieta-<clave>» y
// «bienestar-<clave>» (las pausas activas son «bienestar-pausas»). Al armar una hoja se aplica primero la versión de la
// organización y encima lo que el médico cambió en pantalla para ese paciente.
import { BOTONES_BIENESTAR, TEMAS } from "@/lib/bienestar";
import { DIETAS, dietaDe } from "@/lib/dietas";
import type { Cambios } from "@/lib/cambios-hoja";

export type Versiones = Record<string, Cambios>;
export type HojaEditable = { codigo: string; tipo: "dieta" | "bienestar"; clave: string; nombre: string };

export const HOJAS_EDITABLES: HojaEditable[] = [
  ...DIETAS.map((d) => ({ codigo: `dieta-${d.clave}`, tipo: "dieta" as const, clave: d.clave, nombre: d.boton })),
  ...BOTONES_BIENESTAR.map((t) => ({ codigo: `bienestar-${t.clave}`, tipo: "bienestar" as const, clave: t.clave, nombre: t.boton })),
];
export const hojaEditable = (codigo: string | undefined) => HOJAS_EDITABLES.find((h) => h.codigo === codigo) ?? null;

// Claves de ?c= que pertenecen a cada hoja. «indicaciones» es de cada paciente: nunca va en la versión.
const DE_PAUSAS = /^(intro|frec\d+|z\d+[ed]\d+|reglas)$/;
export function soloDeLaHoja(h: HojaEditable, cambios: Cambios): Cambios {
  const propia = (k: string) => k !== "indicaciones" && (h.tipo === "dieta" ? true : h.clave === "pausas" ? DE_PAUSAS.test(k) : k.startsWith(`${h.clave}-`));
  return Object.fromEntries(Object.entries(cambios).filter(([k]) => propia(k)));
}

// Las señales de alarma («Busque ayuda», «Acuda a emergencia»…) no se pueden quitar de la versión del servicio: un
// grupo de alarma cambiado no puede quedar vacío ni con renglones en blanco (Analizar #286)
export const SIN_ALARMAS = "Las señales de alarma no se pueden quitar. Puedes cambiar su texto, pero cada grupo de alarma debe tener al menos un renglón.";
export function alarmasQuitadas(h: HojaEditable, cambios: Cambios): boolean {
  if (h.tipo !== "bienestar") return false;
  const tema = TEMAS.find((t) => t.clave === h.clave);
  return !!tema?.grupos.some((g, i) => {
    const v = cambios[`${h.clave}-${i}`];
    return g.alarma && Array.isArray(v) && (!v.length || v.some((x) => !x.trim()));
  });
}

// Cambios con los que sale una hoja: versión de la organización y, encima, los del paciente (?c=)
export function conVersion(versiones: Versiones | null | undefined, hoja: { dieta?: string; temas?: string[] }, delPaciente: Cambios = {}): Cambios {
  const codigos = hoja.temas ? hoja.temas.map((t) => `bienestar-${t}`) : [`dieta-${dietaDe(hoja.dieta).clave}`];
  return Object.assign({}, ...codigos.map((c) => versiones?.[c] ?? {}), delPaciente);
}

// Para el buscador de Bienestar en «Hojas para el paciente»: cada tema en su área
export const AREAS_BIENESTAR: { titulo: string; claves: string[] }[] = [
  { titulo: "Dolor y articulaciones", claves: ["pausas", "lumbalgia", "cuello", "escoliosis", "hombro", "codo", "muneca", "rodilla", "pie", "hernias", "venas"] },
  { titulo: "Heridas y piel", claves: ["heridas", "quemaduras"] },
  { titulo: "Salud mental", claves: ["higiene", "estres", "ansiedad", "animo", "meditacion", "emocional", "sobrecarga", "acoso"] },
  { titulo: "Estilo de vida", claves: ["vida-sana", "sueno"] },
  { titulo: "Para gerentes y supervisores", claves: ["gerentes"] },
];
// Ningún tema queda sin área (si se agrega uno nuevo, sale en «Otros»)
export const areasBienestar = () => {
  const usados = new Set(AREAS_BIENESTAR.flatMap((a) => a.claves));
  const otros = TEMAS.map((t) => t.clave).filter((c) => !usados.has(c));
  return otros.length ? [...AREAS_BIENESTAR, { titulo: "Otros", claves: otros }] : AREAS_BIENESTAR;
};
