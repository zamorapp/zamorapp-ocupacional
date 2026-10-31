"use server";

import { revalidatePath } from "next/cache";
import type { EstadoCita } from "@/lib/citas";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ahora, hoyCaracas } from "@/lib/fecha";
import { supabaseConfigurado } from "@/lib/config";
import type { ModoPropuesta } from "@/lib/propuesta";

export type Resultado = { ok: boolean; mensaje: string };

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

export async function crearCita(_: Resultado | null, datos: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para registrar citas." };
  const trabajadorId = texto(datos, "trabajador_id");
  const fecha = texto(datos, "fecha");
  if (!trabajadorId) return { ok: false, mensaje: "Elige el paciente." };
  if (!fecha) return { ok: false, mensaje: "Indica la fecha." };

  const supabase = await crearClienteServidor();
  const { data: t } = await supabase.from("trabajadores").select("empresa_id").eq("id", trabajadorId).single();
  if (!t) return { ok: false, mensaje: "Paciente no encontrado." };
  // "Llegó ahora": entra directo a la cola de espera
  const llegoYa = datos.get("en_espera") === "on";
  const { error } = await supabase.from("citas").insert({
    org_id: sesion.orgId,
    empresa_id: t.empresa_id,
    trabajador_id: trabajadorId,
    fecha,
    hora: texto(datos, "hora"),
    motivo_id: texto(datos, "motivo_id"),
    observacion: texto(datos, "observacion"),
    ...(llegoYa ? { estado: "en_espera", llegada: new Date(ahora()).toISOString() } : {}),
  });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu rol no permite agendar citas." : error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: llegoYa ? "Paciente en la cola de espera." : "Cita agendada." };
}

export async function cambiarEstadoCita(id: string, estado: EstadoCita): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("citas")
    .update({ estado, ...(estado === "en_espera" ? { llegada: new Date(ahora()).toISOString() } : {}) })
    .eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "" };
}

export type FilaCitaLote = { trabajadorId: string; fecha: string; hora: string | null; motivoId: string | null };

export async function importarCitas(filas: FilaCitaLote[]): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para registrar citas." };
  if (!filas.length) return { ok: false, mensaje: "No hay filas válidas." };
  const supabase = await crearClienteServidor();
  const ids = [...new Set(filas.map((f) => f.trabajadorId))];
  const { data: trab } = await supabase.from("trabajadores").select("id, empresa_id").in("id", ids);
  const empresaDe = new Map((trab ?? []).map((t) => [t.id, t.empresa_id]));
  const registros = filas
    .filter((f) => empresaDe.has(f.trabajadorId))
    .map((f) => ({
      org_id: sesion.orgId!,
      empresa_id: empresaDe.get(f.trabajadorId)!,
      trabajador_id: f.trabajadorId,
      fecha: f.fecha,
      hora: f.hora,
      motivo_id: f.motivoId,
      origen: "lote" as const,
    }));
  const { error } = await supabase.from("citas").insert(registros);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: `${registros.length} citas agendadas.` };
}

// Busca trabajadores por cédula para validar la carga por lote
export async function trabajadoresPorCedula(cedulas: string[]): Promise<Record<string, { id: string; nombre: string }>> {
  if (!cedulas.length) return {};
  const supabase = await crearClienteServidor();
  const salida: Record<string, { id: string; nombre: string }> = {};
  for (let i = 0; i < cedulas.length; i += 500) {
    const { data } = await supabase.from("trabajadores").select("id, cedula, nombres, apellidos").in("cedula", cedulas.slice(i, i + 500));
    for (const t of data ?? []) salida[t.cedula] = { id: t.id, nombre: `${t.nombres} ${t.apellidos}` };
  }
  return salida;
}

// ─── Disponibilidad (20261030790000) ───────────────────────

export type PropuestaNueva = { fecha: string; modo: ModoPropuesta; desde: string; hasta: string | null; nota: string | null };

// «Proponer otra hora»: queda en la misma solicitud; RR. HH. recibe el aviso en la campana, su celular y su correo.
// Se escribe por la tabla: en el escritorio funciona sin internet y sube con la sincronía.
export async function proponerHora(ids: string[], p: PropuestaNueva): Promise<Resultado> {
  if (!ids.length) return { ok: false, mensaje: "Nada que proponer." };
  if (!p.fecha || !p.desde) return { ok: false, mensaje: "Indica el día y la hora." };
  if (p.fecha < hoyCaracas()) return { ok: false, mensaje: "Ese día ya pasó." };
  if (p.modo === "rango" && (!p.hasta || p.hasta <= p.desde)) return { ok: false, mensaje: "La hora final debe ser después de la inicial." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("citas").update({
    propuesta_fecha: p.fecha,
    propuesta_desde: p.desde,
    propuesta_hasta: p.modo === "rango" ? p.hasta : null,
    propuesta_modo: p.modo,
    propuesta_nota: p.nota?.trim().slice(0, 300) || null,
  }).in("id", ids).eq("estado", "solicitada");
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu rol no permite proponer horas." : error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Propuesta enviada a RR. HH." };
}

export async function anularPropuesta(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("citas").update({ propuesta_fecha: null }).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "" };
}

// Aviso de choque: solo informa (otras citas a esa hora, bloqueos, fuera del horario). Nunca impide confirmar.
export async function choquesAgenda(fecha: string, hora: string | null, excluir: string | null): Promise<string[]> {
  if (!fecha) return [];
  if (!supabaseConfigurado) return hora === "08:00" ? ["2 citas de Empresa demo a esa hora"] : [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("choques_agenda", { p_fecha: fecha, p_hora: hora || null, p_excluir: excluir });
  return (data as string[] | null) ?? [];
}

export type Agenda = { configurado: boolean; horas?: { hora: string; libres: number }[]; dias?: { fecha: string; libres: number }[] };

// Horas libres de un día y próximos días con cupo (solo cifras): para RR. HH. al pedir y para el servicio al proponer
export async function agendaDelDia(empresaId: string, fecha: string): Promise<Agenda> {
  if (!supabaseConfigurado) return { configurado: true, horas: ["08:00", "08:30", "09:00", "09:30", "10:00"].map((hora, i) => ({ hora, libres: [0, 1, 2, 2, 1][i] })) };
  if (!empresaId || !fecha) return { configurado: false };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("agenda_portal", { p_empresa: empresaId, p_fecha: fecha });
  return (data as Agenda | null) ?? { configurado: false };
}

// Confirmar o reprogramar de una vez todos los trabajadores de una misma solicitud
export async function confirmarSolicitudes(ids: string[], fecha: string, hora: string | null): Promise<Resultado> {
  if (!ids.length || !fecha) return { ok: false, mensaje: "Indica el día." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("citas").update({ estado: "citado", fecha, hora: hora || null, propuesta_fecha: null }).in("id", ids).eq("estado", "solicitada");
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "" };
}

export async function rechazarSolicitudes(ids: string[]): Promise<Resultado> {
  if (!ids.length) return { ok: false, mensaje: "Nada que rechazar." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("citas").update({ estado: "cancelada", propuesta_fecha: null }).in("id", ids).eq("estado", "solicitada");
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "" };
}
