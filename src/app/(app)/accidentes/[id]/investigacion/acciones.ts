"use server";

import { revalidatePath } from "next/cache";
import { faltantes, type Investigacion } from "@/lib/investigacion-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas } from "@/lib/fecha";

export type Resultado = { ok: boolean; mensaje: string; id?: string; terminadoEn?: string | null };

// Guarda el informe NT-02; «terminar» exige las nueve partes y anota la entrega en el evento si no tenía fecha.
export async function guardarInvestigacion(inv: Investigacion, accion: "guardar" | "terminar" | "reabrir"): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!sesion.clinico) return { ok: false, mensaje: "El informe de investigación lo elabora el personal de salud." };
  if (accion === "terminar") {
    const f = faltantes(inv.secciones);
    if (f.length) return { ok: false, mensaje: `Falta completar: ${f.join(", ")}.` };
    if (Object.values(inv.secciones).some((t) => t?.includes("[por completar]"))) {
      return { ok: false, mensaje: "Quedan textos «[por completar]» en el informe. Complétalos o bórralos antes de terminar." };
    }
  }
  const hoy = hoyCaracas();
  const terminadoEn = accion === "terminar" ? hoy : accion === "reabrir" ? null : inv.terminadoEn;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("investigaciones")
    .upsert({
      ...(inv.id ? { id: inv.id } : {}),
      org_id: sesion.orgId,
      evento_id: inv.eventoId,
      trabajador_id: inv.trabajadorId,
      secciones: inv.secciones,
      participantes: inv.participantes.filter((p) => p.nombre.trim()),
      estado: accion === "terminar" ? "terminado" : accion === "reabrir" ? "borrador" : inv.estado,
      terminado_en: terminadoEn,
    }, { onConflict: "evento_id" })
    .select("id")
    .single();
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu rol no permite editar este informe." : error.message };
  if (accion === "terminar") {
    await supabase.from("eventos").update({ fecha_informe_nt02: hoy }).eq("id", inv.eventoId).is("fecha_informe_nt02", null);
  }
  revalidatePath(`/accidentes/${inv.eventoId}`, "layout");
  return { ok: true, mensaje: accion === "terminar" ? "Informe terminado." : accion === "reabrir" ? "Informe reabierto." : "Guardado.", id: data.id, terminadoEn };
}
