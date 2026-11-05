"use server";

import { revalidatePath } from "next/cache";
import { APARTADOS, ROLES_PSICOSOCIAL, TOTAL_PREGUNTAS, type Medida } from "@/lib/psicosocial";
import type { Grupo } from "@/lib/psicosocial-datos";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Evaluación de riesgos psicosociales (20261030898000). Todo con la sesión del servicio: la RLS y las funciones de la
// base deciden. Las respuestas no se leen nunca una por una: solo resultados_psicosociales() agregados.

export type Resultado = { ok: boolean; mensaje: string; id?: string };

const corto = (t: unknown, max = 2000) => (typeof t === "string" ? t.trim().slice(0, max) : "");
const SIN_FILA = "No se guardó: la evaluación ya no existe o no tienes permiso sobre ella. Recarga la página.";
const SIN_INTERNET = "Requiere internet: la evaluación psicosocial vive en la nube. Conéctate y vuelve a intentarlo.";
const explicar = (e: { message: string; code?: string }) =>
  ESCRITORIO && /fetch|network|ECONN|internet|timeout/i.test(e.message) ? SIN_INTERNET
  : e.code === "42501" && !/cerrada|reabrir|borra|permiso/i.test(e.message) ? "No tienes permiso sobre esta empresa." : e.message;

async function contexto() {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "En modo demo no se guardan datos." } as const;
  if (!sesion.rol || !ROLES_PSICOSOCIAL.includes(sesion.rol)) return { error: "Tu rol no permite manejar evaluaciones psicosociales." } as const;
  return { sesion, supabase: await crearClienteServidor() } as const;
}

function limpiarGrupos(gs: Grupo[]): Grupo[] {
  const vistos = new Set<string>();
  return (Array.isArray(gs) ? gs : []).slice(0, 40)
    .map((g) => ({ id: corto(g.id, 12).toLowerCase(), nombre: corto(g.nombre, 120) }))
    .filter((g) => /^[a-z0-9]{1,12}$/.test(g.id) && g.nombre && !vistos.has(g.id) && vistos.add(g.id));
}

export async function crearPsicosocial(x: { empresaId: string; titulo: string; trabajadores: number | null; grupos: Grupo[] }): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!x.empresaId) return { ok: false, mensaje: "Elige la empresa." };
  const titulo = corto(x.titulo, 160);
  if (titulo.length < 3) return { ok: false, mensaje: "Escribe un nombre para la evaluación (por ejemplo «Riesgos psicosociales 2026»)." };
  const { data, error } = await c.supabase.from("evaluaciones_psicosociales").insert({
    org_id: c.sesion.orgId!, empresa_id: x.empresaId, titulo,
    trabajadores: Number.isInteger(x.trabajadores) && x.trabajadores! > 0 ? x.trabajadores : null,
    grupos: limpiarGrupos(x.grupos),
  }).select("id").single();
  if (error) return { ok: false, mensaje: explicar(error) };
  revalidatePath("/psicosocial");
  return { ok: true, mensaje: "", id: data.id as string };
}

export type Cambios = {
  titulo: string; trabajadores: number | null; minimo: number; grupos: Grupo[];
  acuerdoFecha: string | null; acuerdoNota: string; conclusiones: string; medidas: Medida[];
};

function limpiarMedidas(ms: Medida[]): Medida[] {
  return (Array.isArray(ms) ? ms : []).slice(0, 60).map((m) => ({
    id: corto(m.id, 40) || crypto.randomUUID(),
    apartado: Number.isInteger(m.apartado) && m.apartado >= 1 && m.apartado <= APARTADOS.length ? m.apartado : 1,
    medida: corto(m.medida, 1000), responsable: corto(m.responsable, 160), plazo: corto(m.plazo, 60),
  })).filter((m) => m.medida);
}

export async function guardarPsicosocial(id: string, x: Cambios, cerrada: boolean): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  // Cerrada: solo cambian conclusiones y medidas (la base lo exige igual)
  const cambios = cerrada
    ? { conclusiones: corto(x.conclusiones, 8000) || null, medidas: limpiarMedidas(x.medidas) }
    : {
        titulo: corto(x.titulo, 160),
        trabajadores: Number.isInteger(x.trabajadores) && x.trabajadores! > 0 ? x.trabajadores : null,
        minimo_grupo: Number.isInteger(x.minimo) && x.minimo >= 3 && x.minimo <= 50 ? x.minimo : 5,
        grupos: limpiarGrupos(x.grupos),
        acuerdo_fecha: x.acuerdoFecha && /^\d{4}-\d{2}-\d{2}$/.test(x.acuerdoFecha) ? x.acuerdoFecha : null,
        acuerdo_nota: corto(x.acuerdoNota, 1000) || null,
        conclusiones: corto(x.conclusiones, 8000) || null,
        medidas: limpiarMedidas(x.medidas),
      };
  if (!cerrada && (cambios as { titulo: string }).titulo.length < 3) return { ok: false, mensaje: "El nombre de la evaluación es muy corto." };
  const { data, error } = await c.supabase.from("evaluaciones_psicosociales").update(cambios).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath(`/psicosocial/${id}`);
  revalidatePath("/psicosocial");
  return { ok: true, mensaje: "Guardado." };
}

export async function cambiarEstadoPsicosocial(id: string, estado: "abierta" | "cerrada"): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data, error } = await c.supabase.from("evaluaciones_psicosociales").update({ estado }).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath(`/psicosocial/${id}`);
  revalidatePath("/psicosocial");
  return { ok: true, mensaje: estado === "cerrada" ? "Evaluación cerrada: la empresa ya puede ver el informe agregado." : "Evaluación reabierta." };
}

export async function generarCodigos(id: string, cantidad: number): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 500) return { ok: false, mensaje: "Entre 1 y 500 códigos por vez." };
  const { data, error } = await c.supabase.rpc("generar_codigos_psicosociales", { p_evaluacion: id, p_cantidad: cantidad });
  if (error) return { ok: false, mensaje: explicar(error) };
  revalidatePath(`/psicosocial/${id}`);
  return { ok: true, mensaje: `${data} códigos nuevos listos para repartir.` };
}

// Cuestionario respondido en papel: el servicio lo transcribe. Tampoco guarda quién lo cargó ni cuándo.
export async function cargarPapel(id: string, grupo: string | null, respuestas: number[]): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!Array.isArray(respuestas) || respuestas.length !== TOTAL_PREGUNTAS || respuestas.some((r) => !Number.isInteger(r) || r < 0 || r > 4)) {
    return { ok: false, mensaje: "Faltan respuestas: marca las 38." };
  }
  const { data, error } = await c.supabase.rpc("cargar_respuesta_psicosocial", { p_evaluacion: id, p_grupo: grupo, p_respuestas: respuestas });
  if (error) return { ok: false, mensaje: explicar(error) };
  if (data !== "ok") return { ok: false, mensaje: String(data) };
  revalidatePath(`/psicosocial/${id}`);
  return { ok: true, mensaje: "Cuestionario cargado." };
}

// Borrar solo se puede si nadie respondió todavía (la base lo exige)
export async function borrarPsicosocial(id: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data, error } = await c.supabase.from("evaluaciones_psicosociales").delete().eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath("/psicosocial");
  return { ok: true, mensaje: "Evaluación borrada." };
}
