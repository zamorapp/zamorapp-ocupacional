"use server";

import { revalidatePath } from "next/cache";
import type { Puesto } from "@/lib/puestos-tipos";
import { obtenerSesion } from "@/lib/sesion";

import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas } from "@/lib/fecha";

export type Resultado = { ok: boolean; mensaje: string };

const ROLES = ["administrador", "coordinador_sst", "gerente_medico"];

async function contexto() {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "En modo demo no se guardan datos." } as const;
  if (!sesion.rol || !ROLES.includes(sesion.rol)) return { error: "Tu rol no permite modificar puestos." } as const;
  return { sesion, supabase: await crearClienteServidor() } as const;
}

export async function guardarPuesto(empresaId: string, p: Puesto): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!p.nombre.trim()) return { ok: false, mensaje: "Escribe el nombre del puesto." };

  // Solo se guardan valoraciones de agentes que siguen marcados
  const marcados = new Set(Object.entries(p.riesgos).flatMap(([g, lista]) => (lista ?? []).map((a) => `${g}|${a}`)));
  const evaluacion = Object.fromEntries(Object.entries(p.evaluacion).filter(([k]) => marcados.has(k)));

  const campos = {
    nombre: p.nombre.trim(),
    codigo: p.codigo || null,
    dependencia_id: p.dependenciaId,
    descripcion: p.descripcion || null,
    tareas: p.tareas || null,
    herramientas: p.herramientas || null,
    turno: p.turno || null,
    riesgos: p.riesgos,
    evaluacion,
    epp: p.epp.trim() || null,
    recomendaciones: p.recomendaciones.trim() || null,
    // Quien guarda la valoración firma el informe de evaluación del puesto
    ...(Object.values(evaluacion).some((v) => v.p && v.s) ? { evaluado_por: c.sesion.usuarioId, evaluado_en: hoyCaracas() } : {}),
  };
  const { error } = p.id
    ? await c.supabase.from("puestos").update(campos).eq("id", p.id)
    : await c.supabase.from("puestos").insert({ ...campos, org_id: c.sesion.orgId!, empresa_id: empresaId });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath(`/empresas/${empresaId}`);
  return { ok: true, mensaje: "Puesto guardado." };
}

export async function desactivarPuesto(empresaId: string, id: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { error } = await c.supabase.from("puestos").update({ activo: false }).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath(`/empresas/${empresaId}`);
  return { ok: true, mensaje: "" };
}

export async function crearDependencia(empresaId: string, nombre: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!nombre.trim()) return { ok: false, mensaje: "Escribe el nombre." };
  const { error } = await c.supabase.from("dependencias").insert({ org_id: c.sesion.orgId!, empresa_id: empresaId, nombre: nombre.trim() });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Solo un administrador puede crear dependencias." : error.message };
  revalidatePath(`/empresas/${empresaId}`);
  return { ok: true, mensaje: "" };
}

export async function renombrarDependencia(empresaId: string, id: string, nombre: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { error } = await c.supabase.from("dependencias").update({ nombre: nombre.trim() }).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath(`/empresas/${empresaId}`);
  return { ok: true, mensaje: "" };
}

export async function guardarHoras(
  empresaId: string,
  filas: { mes: string; horas: number | null; trabajadores: number | null; metodo: "nomina" | "estimado" }[],
): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const registros = filas
    .filter((f) => f.horas !== null && f.horas >= 0)
    .map((f) => ({ org_id: c.sesion.orgId!, empresa_id: empresaId, mes: f.mes, horas: f.horas!, trabajadores: f.trabajadores, metodo: f.metodo }));
  if (!registros.length) return { ok: false, mensaje: "No hay horas para guardar." };
  const { error } = await c.supabase.from("horas_trabajadas").upsert(registros, { onConflict: "empresa_id,mes" });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath(`/empresas/${empresaId}`);
  return { ok: true, mensaje: `${registros.length} meses guardados.` };
}
