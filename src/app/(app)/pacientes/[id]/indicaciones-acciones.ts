"use server";

import { revalidatePath } from "next/cache";
import type { Medicamento } from "@/lib/consultas-tipos";
import { opciones, type Item } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { faltantesMedicinas, textoFalta } from "@/lib/recipe";
import { limpiarExamenes, type TipoIndicacion } from "@/lib/indicaciones-sueltas";

type Resultado = { ok: boolean; mensaje: string; id?: string };

const EMITEN = ["administrador", "gerente_medico", "medico"];

// Listas del formulario: se piden al abrirlo (la ficha no carga el vademécum en cada visita)
export async function listasIndicacion(): Promise<Record<string, Item[]>> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !sesion.clinico) return {};
  return opciones(sesion.orgId, ["medicina", "presentacion_medicina", "via_administracion", "frecuencia_dosis", "duracion_tratamiento"]);
}

const limpiarMed = (m: Medicamento): Medicamento => ({
  medicina: (m.medicina ?? "").trim().slice(0, 200),
  concentracion: (m.concentracion ?? "").trim().slice(0, 100),
  presentacion: (m.presentacion ?? "").trim().slice(0, 100),
  via: (m.via ?? "").trim().slice(0, 100),
  dosis: (m.dosis ?? "").trim().slice(0, 100),
  frecuencia: (m.frecuencia ?? "").trim().slice(0, 100),
  duracion: (m.duracion ?? "").trim().slice(0, 100),
  observacion: (m.observacion ?? "").trim().slice(0, 300),
  ...(m.notaFarmacia?.trim() ? { notaFarmacia: m.notaFarmacia.trim().slice(0, 200) } : {}),
});

// Emite la orden a enfermería o el récipe. No crea consulta: no cuenta en morbilidad ni en estadísticas.
// examenes: orden de exámenes (14-nov). consultaId: el médico la adjunta a una consulta del paciente (si no, va suelta).
// borradorId: venía preparada por un agente (puerta para agentes): al emitirla, el borrador queda «emitido».
export async function emitirIndicacion(entrada: {
  trabajadorId: string; tipo: TipoIndicacion; tratamiento: Medicamento[]; indicaciones: string; indicadoPor: string;
  examenes?: string[]; consultaId?: string | null; borradorId?: string | null;
}): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase." };
  if (!sesion.clinico || !EMITEN.includes(sesion.rol ?? "")) return { ok: false, mensaje: "La indicación o el récipe los emite el médico." };
  if (!["enfermeria", "recipe", "examenes"].includes(entrada.tipo)) return { ok: false, mensaje: "Tipo no válido." };
  const uuid = /^[0-9a-f-]{36}$/i;
  const consultaId = entrada.consultaId && uuid.test(entrada.consultaId) ? entrada.consultaId : null;
  const borradorId = entrada.borradorId && uuid.test(entrada.borradorId) ? entrada.borradorId : null;
  const examenes = entrada.tipo === "examenes" ? limpiarExamenes(entrada.examenes ?? []) : [];
  const tratamiento = entrada.tipo === "examenes" ? [] : (entrada.tratamiento ?? []).map(limpiarMed).filter((m) => m.medicina).slice(0, 20);
  const indicaciones = (entrada.indicaciones ?? "").trim().slice(0, 2000);
  if (entrada.tipo === "recipe") {
    if (!tratamiento.length) return { ok: false, mensaje: "Agrega al menos una medicina." };
    // Res. MPPS 028/031: sin estos datos la farmacia no despacha; se avisa antes de guardar, no al imprimir
    const faltan = faltantesMedicinas(tratamiento);
    if (faltan.length) return { ok: false, mensaje: `Para el récipe falta: ${faltan.map(textoFalta).join("; ")}.` };
  } else if (entrada.tipo === "examenes") {
    if (!examenes.length) return { ok: false, mensaje: "Escribe al menos un examen." };
  } else if (!tratamiento.length && !indicaciones) {
    return { ok: false, mensaje: "Escribe la medicina o la indicación para enfermería." };
  }
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("indicaciones").insert({
    org_id: sesion.orgId, trabajador_id: entrada.trabajadorId, tipo: entrada.tipo, tratamiento, examenes, indicaciones,
    consulta_id: consultaId, indicado_por: entrada.tipo === "enfermeria" ? (entrada.indicadoPor ?? "").trim().slice(0, 200) || null : null,
  }).select("id").single();
  if (error) {
    return { ok: false, mensaje: error.code === "42501" ? "La indicación o el récipe los emite el médico."
      : error.message?.includes("consulta no es de este trabajador") ? "Esa consulta no es de este paciente." : "No se pudo guardar. Revisa los datos e intenta de nuevo." };
  }
  // El borrador del agente queda «emitido» con esta indicación. Si falla (ya lo revisó otra PC), la indicación vale igual.
  if (borradorId) {
    await supabase.from("agentes_borradores").update({ estado: "emitido", indicacion_id: data.id })
      .eq("id", borradorId).eq("trabajador_id", entrada.trabajadorId).eq("estado", "por_revisar");
    revalidatePath("/borradores");
  }
  revalidatePath(`/pacientes/${entrada.trabajadorId}`);
  return { ok: true, mensaje: entrada.tipo === "recipe" ? "Récipe emitido." : entrada.tipo === "examenes" ? "Orden de exámenes emitida." : "Orden enviada a enfermería.", id: data.id };
}

// Enfermería (o el médico) la marca «Cumplida», con una nota corta: dónde se colocó, reacción…
export async function cumplirIndicacion(id: string, trabajadorId: string, nota: string): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud la marca cumplida." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("indicaciones")
    .update({ estado: "cumplida", nota_cumplimiento: nota.trim().slice(0, 500) || null })
    .eq("id", id).eq("estado", "pendiente").select("estado").maybeSingle();
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Solo la orden de enfermería se marca cumplida." : "No se pudo guardar." };
  if (!data) return { ok: false, mensaje: "Ya estaba cumplida o anulada." };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "Marcada cumplida." };
}

// El médico la anula (error de dosis, ya no aplica): queda en el historial tachada, con el motivo
export async function anularIndicacion(id: string, trabajadorId: string, motivo: string): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !EMITEN.includes(sesion.rol ?? "")) return { ok: false, mensaje: "La anula el médico." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("indicaciones")
    .update({ estado: "anulada", motivo_anulacion: motivo.trim().slice(0, 300) || null })
    .eq("id", id).in("estado", ["pendiente", "emitida"]).select("estado").maybeSingle();
  if (error) return { ok: false, mensaje: error.code === "42501" ? "La anula el médico." : "No se pudo anular." };
  if (!data) return { ok: false, mensaje: "Ya estaba cumplida o anulada." };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "Anulada." };
}

// Consultas del paciente para «Adjuntar a una consulta» (las 12 más recientes; solo fecha y motivo)
export async function consultasParaAdjuntar(trabajadorId: string): Promise<{ id: string; fecha: string; estado: string }[]> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !sesion.clinico || !/^[0-9a-f-]{36}$/i.test(trabajadorId)) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("consultas").select("id, fecha, estado").eq("trabajador_id", trabajadorId)
    .order("fecha", { ascending: false }).limit(12);
  return (data ?? []) as { id: string; fecha: string; estado: string }[];
}
