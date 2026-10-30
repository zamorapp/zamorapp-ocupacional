"use server";

import { revalidatePath } from "next/cache";
import type { EstadoCita } from "@/lib/citas";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ahora } from "@/lib/fecha";

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

// Confirma una solicitud de la empresa, opcionalmente con otra fecha u hora
export async function confirmarSolicitud(id: string, fecha: string, hora: string | null): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("citas").update({ estado: "citado", fecha, hora: hora || null }).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "" };
}
