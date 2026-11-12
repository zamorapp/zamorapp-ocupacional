"use server";

import { revalidatePath } from "next/cache";
import { hoyCaracas } from "@/lib/fecha";
import { CLAVES_DECISION_ENFERMERIA, SIGNOS_ENFERMERIA, TIPOS_ENFERMERIA, tipoEnfermeria, type ClaveDecisionEnfermeria } from "@/lib/enfermeria-tipos";
import { olvidar } from "@/lib/memo";
import { listarConsultas } from "@/lib/consultas";
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
  const consultaId = texto(datos, "consulta_id", 36);
  if (consultaId && (!trabajadorId || !/^[0-9a-f-]{36}$/i.test(consultaId))) return { ok: false, mensaje: "Revisa la consulta elegida." };
  if (tipo === "evolucion" && !texto(datos, "nota")) return { ok: false, mensaje: "Escribe la evolución de enfermería." };

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
    consulta_id: consultaId,
  });
  if (error) return { ok: false, mensaje: `No se guardó: ${error.message}` };
  olvidar("reporte");
  revalidatePath("/enfermeria");
  if (consultaId) revalidatePath(`/atencion/${consultaId}`);
  if (trabajadorId) revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: consultaId ? "Evolución guardada en la consulta del médico." : "Atención guardada." };
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

// Decisiones del médico: unir morbilidades, indicadores de enfermería en la vigilancia y tasas de su morbilidad
export async function guardarDecision(clave: ClaveDecisionEnfermeria, valor: boolean): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (sesion.rol !== "administrador" && sesion.rol !== "gerente_medico") return { ok: false, mensaje: "Solo el administrador o el gerente médico cambian esta decisión." };
  if (!CLAVES_DECISION_ENFERMERIA.includes(clave)) return { ok: false, mensaje: "Opción desconocida." };
  const supabase = await crearClienteServidor();
  // Solo cambia esa clave en la base (no reescribe los demás ajustes)
  const { error } = await supabase.rpc("guardar_decision_enfermeria", { p_org: sesion.orgId, p_clave: clave, p_valor: valor === true });
  if (error) return { ok: false, mensaje: `No se guardó: ${error.message}` };
  invalidarSesion();
  olvidar("reporte");
  revalidatePath("/enfermeria");
  revalidatePath("/configuracion/enfermeria");
  revalidatePath("/reportes", "layout");
  return { ok: true, mensaje: valor ? "Activado." : "Desactivado." };
}

// Consultas del médico de un trabajador, para que enfermería las lea (solo lectura) y anote su evolución en una
export type ConsultaParaLeer = { id: string; fecha: string; motivo: string; estado: string };
export async function consultasDelTrabajador(trabajadorId: string): Promise<ConsultaParaLeer[]> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico || !/^[0-9a-f-]{36}$/i.test(trabajadorId)) return [];
  const lista = await listarConsultas({ trabajadorId, limite: 6 }).catch(() => []);
  return lista.map((c) => ({ id: c.id, fecha: c.fecha, motivo: c.motivo ?? "Consulta", estado: c.estado }));
}
