"use server";

import { revalidatePath } from "next/cache";
import { contenidoDePuesto, type PuestoFuente } from "@/lib/notificacion-riesgos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string; ids?: string[] };

// Registra la entrega de la notificación de riesgos del puesto actual a uno o varios trabajadores
export async function notificarRiesgos(trabajadorIds: string[]): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!trabajadorIds.length) return { ok: false, mensaje: "No hay trabajadores para notificar." };
  const supabase = await crearClienteServidor();
  const { data, error: e1 } = await supabase
    .from("trabajadores")
    .select("id, empresa_id, puesto_id, puestos(nombre, turno, tareas, herramientas, epp, recomendaciones, evaluado_en, riesgos, evaluacion, dependencias(nombre))")
    .in("id", trabajadorIds.slice(0, 500));
  if (e1) return { ok: false, mensaje: e1.message };
  const filas = (data ?? []) as unknown as { id: string; empresa_id: string; puesto_id: string | null; puestos: PuestoFuente | null }[];
  const conPuesto = filas.filter((t) => t.puesto_id && t.puestos);
  if (!conPuesto.length) return { ok: false, mensaje: "El trabajador no tiene puesto asignado: asígnalo para notificar sus riesgos." };
  const { data: creadas, error } = await supabase
    .from("notificaciones_riesgo")
    .insert(conPuesto.map((t) => ({
      org_id: sesion.orgId,
      empresa_id: t.empresa_id,
      trabajador_id: t.id,
      puesto_id: t.puesto_id,
      puesto: t.puestos!.nombre,
      contenido: contenidoDePuesto(t.puestos!),
    })))
    .select("id");
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu rol no permite registrar notificaciones de riesgos." : error.message };
  revalidatePath("/pacientes", "layout");
  const omitidos = filas.length - conPuesto.length;
  return {
    ok: true,
    mensaje: `${creadas.length === 1 ? "Notificación registrada" : `${creadas.length} notificaciones registradas`}${omitidos ? `; ${omitidos} sin puesto asignado` : ""}. Imprímela y que el trabajador firme el acuse.`,
    ids: creadas.map((c) => c.id),
  };
}

// Todos los trabajadores activos (o en reposo) del puesto
export async function notificarPuesto(puestoId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("trabajadores").select("id").eq("puesto_id", puestoId).in("estado", ["activo", "reposo"]).limit(500);
  return notificarRiesgos((data ?? []).map((t) => t.id));
}

export async function marcarFirmada(id: string, firmada: boolean): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  const supabase = await crearClienteServidor();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
  const { error } = await supabase.from("notificaciones_riesgo").update({ firmada_en: firmada ? hoy : null }).eq("id", id);
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu rol no permite cambiar la notificación." : error.message };
  revalidatePath("/pacientes", "layout");
  return { ok: true, mensaje: firmada ? "Acuse firmado registrado." : "Firma quitada." };
}
