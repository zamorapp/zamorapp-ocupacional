"use server";

import { revalidatePath } from "next/cache";
import type { Puesto } from "@/lib/puestos-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

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
