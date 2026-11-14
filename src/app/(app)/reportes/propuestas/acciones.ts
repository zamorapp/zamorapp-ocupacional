"use server";

import { revalidatePath } from "next/cache";
import { SECCIONES_PROPUESTA } from "@/lib/agentes/propuestas";
import { olvidar } from "@/lib/memo";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { SECCIONES_ANALISIS } from "@/lib/vigilancia-analisis";

export type Resultado = { ok: boolean; mensaje: string };

const ID = /^[0-9a-f-]{36}$/;
const SECCIONES = new Set(SECCIONES_PROPUESTA.map(([k]) => k));
const ANALISIS = new Set<string>(SECCIONES_ANALISIS.map(([k]) => k));

function explicar(e: { code?: string; message: string }): string {
  if (e.code === "42501") return "No tienes permiso para aprobar esto en esta empresa.";
  if (e.code === "PGRST202") return "Falta aplicar la actualización de la base (vigilancia con agentes).";
  if (/fetch failed|network|timeout/i.test(e.message)) return "Sin internet no se aprueba: inténtalo cuando vuelva la conexión.";
  return e.message;
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Aprobar. En el borrador de informe llegan solo las secciones y análisis elegidos (con lo que el médico corrigió)
export async function aprobarPropuesta(id: string, eleccion?: { secciones: Record<string, string>; analisis: Record<string, string> }): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!ID.test(id)) return { ok: false, mensaje: "Propuesta no válida." };
  let datos: Record<string, unknown> | null = null;
  if (eleccion) {
    const secciones = Object.fromEntries(Object.entries(eleccion.secciones ?? {}).filter(([k]) => SECCIONES.has(k)).map(([k, v]) => [k, texto(v, 8000)]));
    const analisis = Object.fromEntries(Object.entries(eleccion.analisis ?? {}).filter(([k, v]) => ANALISIS.has(k) && texto(v, 4000)).map(([k, v]) => [k, texto(v, 4000)]));
    if (!Object.keys(secciones).length && !Object.keys(analisis).length) return { ok: false, mensaje: "Elige al menos una sección para usar, o descarta el borrador." };
    datos = { secciones, analisis };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("aplicar_propuesta" as never, { p_id: id, p_datos: datos } as never);
  if (error) return { ok: false, mensaje: explicar(error) };
  olvidar("");
  revalidatePath("/reportes", "layout");
  revalidatePath("/empresas", "layout");
  return { ok: true, mensaje: eleccion ? "Listo: el informe ya tiene lo que elegiste. Revísalo en Vigilancia antes de imprimir." : "Aprobada." };
}

export async function descartarPropuesta(id: string): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!ID.test(id)) return { ok: false, mensaje: "Propuesta no válida." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("descartar_propuesta" as never, { p_id: id } as never);
  if (error) return { ok: false, mensaje: explicar(error) };
  revalidatePath("/reportes", "layout");
  return { ok: true, mensaje: "Descartada." };
}
