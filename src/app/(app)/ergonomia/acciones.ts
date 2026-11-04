"use server";

import { revalidatePath } from "next/cache";
import { DEPARTAMENTOS, METODOS, ROLES_ERGONOMIA, type ClaveMetodo, type Hallazgo, type Respuestas } from "@/lib/ergonomia";
import type { Foto } from "@/lib/ergonomia-datos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string; id?: string };

const DEPTOS = new Set(DEPARTAMENTOS.map((d) => d.clave));
const corto = (t: unknown, max = 2000) => (typeof t === "string" ? t.trim().slice(0, max) : "");
const uno5 = (n: unknown) => (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5 ? (n as number) : 0);

async function contexto() {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "En modo demo no se guardan datos." } as const;
  if (!sesion.rol || !ROLES_ERGONOMIA.includes(sesion.rol)) return { error: "Tu rol no permite hacer evaluaciones ergonómicas." } as const;
  return { sesion, supabase: await crearClienteServidor() } as const;
}

// Ninguna fila cambió: la evaluación no existe o no está en tu alcance (RLS no da error, solo no toca nada)
const SIN_FILA = "No se guardó: la evaluación ya no existe o no tienes permiso sobre ella. Recarga la página.";

// Mensaje claro para los errores de la base (cerrada, permisos, puesto de otra empresa)
const explicar = (e: { message: string; code?: string }) =>
  e.code === "42501" && !/cerrada|reabrir/i.test(e.message) ? "No tienes permiso sobre esta empresa." : e.message;

export async function crearEvaluacion(datos: { empresaId: string; puestoId: string | null; puesto: string; tarea: string; metodo: ClaveMetodo }): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!datos.empresaId) return { ok: false, mensaje: "Elige la empresa." };
  if (!corto(datos.puesto, 200)) return { ok: false, mensaje: "Elige o escribe el puesto que vas a evaluar." };
  if (!["rula", "reba", "libre"].includes(datos.metodo)) return { ok: false, mensaje: "Ese método todavía no está disponible." };
  const { data, error } = await c.supabase
    .from("evaluaciones_ergonomicas")
    .insert({ org_id: c.sesion.orgId!, empresa_id: datos.empresaId, puesto_id: datos.puestoId || null, puesto: corto(datos.puesto, 200), tarea: corto(datos.tarea) || null, metodo: datos.metodo })
    .select("id")
    .single();
  if (error) return { ok: false, mensaje: explicar(error) };
  revalidatePath("/ergonomia");
  return { ok: true, mensaje: "", id: data.id as string };
}

export type Cambios = {
  puesto: string; tarea: string; lado: "derecho" | "izquierdo" | "ambos" | null; fecha: string; trabajadoresObservados: number | null;
  datos: Respuestas; hallazgos: Hallazgo[]; fotos: Foto[]; conclusion: string; observaciones: string;
};

// Limpia lo que llega del navegador: el puntaje lo calcula el servidor con las mismas tablas del método
function limpiar(metodo: ClaveMetodo, x: Cambios, carpeta: string) {
  const m = metodo === "rula" || metodo === "reba" ? METODOS[metodo] : null;
  const claves = new Set(m?.secciones.flatMap((s) => s.preguntas.map((p) => p.clave)) ?? []);
  const datos: Respuestas = {};
  for (const [k, val] of Object.entries(x.datos ?? {})) if (claves.has(k) && Number.isInteger(val) && Math.abs(val) <= 4) datos[k] = val;
  const hallazgos = (Array.isArray(x.hallazgos) ? x.hallazgos : []).slice(0, 60).map((h) => ({
    id: corto(h.id, 40) || crypto.randomUUID(),
    factor: corto(h.factor, 200), detalle: corto(h.detalle, 500), p: uno5(h.p), s: uno5(h.s),
    consecuencia: corto(h.consecuencia, 500), medida: corto(h.medida, 1500),
    departamento: DEPTOS.has(h.departamento) ? h.departamento : "sst",
    plazo: corto(h.plazo, 60), origen: h.origen === "metodo" || h.origen === "checklist" ? h.origen : "manual",
  })).filter((h) => h.factor || h.medida);
  const fotos = (Array.isArray(x.fotos) ? x.fotos : []).slice(0, 12).filter((f) => typeof f.ruta === "string" && f.ruta.startsWith(carpeta) && f.ruta.split("/").length === 3 && !f.ruta.includes("..")).map((f) => ({ ruta: f.ruta, nota: corto(f.nota, 300) }));
  return {
    puesto: corto(x.puesto, 200), tarea: corto(x.tarea) || null,
    lado: x.lado === "derecho" || x.lado === "izquierdo" || x.lado === "ambos" ? x.lado : null,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : undefined,
    trabajadores_observados: Number.isInteger(x.trabajadoresObservados) && x.trabajadoresObservados! >= 0 ? x.trabajadoresObservados : null,
    datos, resultado: m ? m.calcular(datos) : {}, hallazgos, fotos,
    conclusion: corto(x.conclusion, 4000) || null, observaciones: corto(x.observaciones, 4000) || null,
  };
}

export async function guardarEvaluacion(id: string, metodo: ClaveMetodo, x: Cambios, cerrar = false): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  // Solo fotos de la carpeta de ESTA evaluación (<org>/<evaluación>/…): no se puede enlazar la foto de otra
  const campos = limpiar(metodo, x, `${c.sesion.orgId}/${id}/`);
  if (!campos.puesto) return { ok: false, mensaje: "Escribe el nombre del puesto." };
  if (cerrar) {
    const r = campos.resultado as { completo?: boolean };
    if ((metodo === "rula" || metodo === "reba") && !r.completo) return { ok: false, mensaje: "Faltan posturas por marcar: completa brazo, antebrazo, muñeca, cuello, tronco y piernas antes de cerrar." };
    if (campos.hallazgos.some((h) => !h.p || !h.s)) return { ok: false, mensaje: "Hay hallazgos sin probabilidad o severidad: valóralos antes de cerrar." };
  }
  const { data, error } = await c.supabase.from("evaluaciones_ergonomicas").update({ ...campos, ...(cerrar ? { estado: "cerrada" } : {}) }).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath("/ergonomia");
  revalidatePath(`/ergonomia/${id}`);
  return { ok: true, mensaje: cerrar ? "Evaluación cerrada. Ya puedes imprimir los informes." : "Guardado." };
}

export async function guardarObservaciones(id: string, observaciones: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data, error } = await c.supabase.from("evaluaciones_ergonomicas").update({ observaciones: corto(observaciones, 4000) || null }).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath(`/ergonomia/${id}`);
  return { ok: true, mensaje: "Observaciones guardadas." };
}

export async function reabrirEvaluacion(id: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data, error } = await c.supabase.from("evaluaciones_ergonomicas").update({ estado: "borrador" }).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath(`/ergonomia/${id}`);
  revalidatePath("/ergonomia");
  return { ok: true, mensaje: "Reabierta: ya puedes corregirla." };
}

// Solo borradores (la base rechaza borrar una cerrada); las fotos se quitan del bucket después
export async function borrarEvaluacion(id: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data: ev } = await c.supabase.from("evaluaciones_ergonomicas").select("estado, fotos").eq("id", id).maybeSingle();
  if (!ev) return { ok: false, mensaje: "La evaluación ya no existe." };
  if (ev.estado === "cerrada") return { ok: false, mensaje: "Una evaluación cerrada no se borra." };
  // Primero las fotos: el permiso del bucket exige que la evaluación exista y sea borrador
  const rutas = ((ev.fotos as Foto[] | null) ?? []).map((f) => f.ruta);
  if (rutas.length) await c.supabase.storage.from("ergonomia").remove(rutas);
  const { data, error } = await c.supabase.from("evaluaciones_ergonomicas").delete().eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath("/ergonomia");
  return { ok: true, mensaje: "Borrada." };
}
