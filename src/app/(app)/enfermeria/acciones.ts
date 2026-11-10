"use server";

import { revalidatePath } from "next/cache";
import { hoyCaracas } from "@/lib/fecha";
import { SIGNOS_ENFERMERIA, TIPOS_ENFERMERIA, tipoEnfermeria } from "@/lib/enfermeria-tipos";
import { olvidar } from "@/lib/memo";
import { invalidarSesion, obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string };

const texto = (d: FormData, k: string, max = 2000) => String(d.get(k) ?? "").trim().slice(0, max) || null;

export async function registrarAtencion(_: Resultado | null, datos: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud registra atenciones de enfermería." };
  const tipo = texto(datos, "tipo");
  if (!tipo || !TIPOS_ENFERMERIA.some((t) => t.k === tipo)) return { ok: false, mensaje: "Elige qué atención hiciste." };
  const trabajadorId = texto(datos, "trabajador_id");
  const empresaId = texto(datos, "empresa_id");
  if (!trabajadorId && !tipoEnfermeria(tipo).sinTrabajador) return { ok: false, mensaje: "Busca y elige al trabajador atendido." };
  if (!trabajadorId && !empresaId) return { ok: false, mensaje: "Elige la empresa." };
  const fecha = texto(datos, "fecha") ?? hoyCaracas();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, mensaje: "Revisa la fecha." };
  if (fecha > hoyCaracas()) return { ok: false, mensaje: "La fecha no puede ser futura." };

  const signos: Record<string, string> = {};
  for (const s of SIGNOS_ENFERMERIA) {
    const v = texto(datos, `s_${s.k}`, 12);
    if (v) signos[s.k] = v.replace(",", ".");
  }
  if (signos.ta && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(signos.ta)) return { ok: false, mensaje: "Escribe la tensión así: 120/80." };
  if (signos.ta) signos.ta = signos.ta.replace(/\s/g, "");
  const cie10 = texto(datos, "cie10", 8);

  const supabase = await crearClienteServidor();
  let empresa = empresaId;
  if (trabajadorId) {
    const { data: t } = await supabase.from("trabajadores").select("empresa_id").eq("id", trabajadorId).maybeSingle();
    if (!t) return { ok: false, mensaje: "No encuentro a ese trabajador (o no es de tu empresa)." };
    empresa = t.empresa_id;
  }
  const { error } = await supabase.from("atenciones_enfermeria").insert({
    org_id: sesion.orgId,
    empresa_id: empresa,
    trabajador_id: trabajadorId,
    fecha,
    tipo,
    motivo: texto(datos, "motivo", 200),
    cie10: cie10 && /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/.test(cie10) ? cie10 : null,
    signos,
    tratamiento: texto(datos, "tratamiento", 1000),
    nota: texto(datos, "nota", 2000),
    referido_medico: datos.get("referido") === "on",
  });
  if (error) return { ok: false, mensaje: `No se guardó: ${error.message}` };
  olvidar("reporte");
  revalidatePath("/enfermeria");
  return { ok: true, mensaje: "Atención guardada." };
}

export async function borrarAtencion(id: string): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("atenciones_enfermeria").delete().eq("id", id).select("id");
  if (error) return { ok: false, mensaje: `No se borró: ${error.message}` };
  if (!data?.length) return { ok: false, mensaje: "Quien la registró puede borrarla solo el mismo día (24 horas); después, el gerente médico o el administrador." };
  olvidar("reporte");
  revalidatePath("/enfermeria");
  return { ok: true, mensaje: "Atención borrada." };
}

// Orden del médico cumplida (tabla de «Indicación o récipe»: el disparador anota quién y cuándo)
export async function cumplirOrden(id: string, nota: string): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud marca órdenes cumplidas." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("indicaciones")
    .update({ estado: "cumplida", nota_cumplimiento: nota.trim().slice(0, 500) || null })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");
  if (error) return { ok: false, mensaje: `No se marcó: ${error.message}` };
  if (!data?.length) return { ok: false, mensaje: "Esa orden ya no está pendiente." };
  revalidatePath("/enfermeria");
  return { ok: true, mensaje: "Orden cumplida." };
}

// Las dos decisiones del médico: unir morbilidades y llevar los indicadores de enfermería a la vigilancia
export async function guardarDecision(clave: "enfermeria_unida" | "enfermeria_vigilancia", valor: boolean): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (sesion.rol !== "administrador") return { ok: false, mensaje: "Solo el administrador cambia esta decisión." };
  if (clave !== "enfermeria_unida" && clave !== "enfermeria_vigilancia") return { ok: false, mensaje: "Opción desconocida." };
  const supabase = await crearClienteServidor();
  const { data: actual, error: e0 } = await supabase.from("organizaciones").select("ajustes").eq("id", sesion.orgId).maybeSingle();
  if (e0) return { ok: false, mensaje: e0.message };
  const ajustes = { ...((actual?.ajustes ?? {}) as Record<string, unknown>), [clave]: valor === true };
  const { error } = await supabase.from("organizaciones").update({ ajustes }).eq("id", sesion.orgId);
  if (error) return { ok: false, mensaje: `No se guardó: ${error.message}` };
  invalidarSesion();
  olvidar("reporte");
  revalidatePath("/enfermeria");
  revalidatePath("/reportes", "layout");
  return { ok: true, mensaje: valor ? "Activado." : "Desactivado." };
}
