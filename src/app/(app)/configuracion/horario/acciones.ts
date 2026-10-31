"use server";

import { revalidatePath } from "next/cache";
import { hoyCaracas } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

type Resultado = { ok: boolean; mensaje: string };
export type Tramo = { dia: number; desde: string; hasta: string };

const HORA = /^\d{2}:\d{2}$/;
const sinPermiso = (e: { code?: string; message: string }) => (e.code === "42501" ? "Tu rol no permite cambiar la disponibilidad." : e.message);

// Horario semanal completo (reemplaza el anterior). Se escribe por la tabla: en el escritorio funciona sin internet.
export async function guardarHorario(tramos: Tramo[], minutos: number, cupos: number): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  if (!(minutos >= 10 && minutos <= 240)) return { ok: false, mensaje: "Cada turno dura entre 10 y 240 minutos." };
  if (!(cupos >= 1 && cupos <= 50)) return { ok: false, mensaje: "Entre 1 y 50 personas por turno." };
  for (const t of tramos) {
    if (!(t.dia >= 1 && t.dia <= 7) || !HORA.test(t.desde) || !HORA.test(t.hasta)) return { ok: false, mensaje: "Revisa las horas." };
    if (t.hasta <= t.desde) return { ok: false, mensaje: "En cada tramo, la hora final va después de la inicial." };
  }
  const supabase = await crearClienteServidor();
  // Primero lo nuevo y después se quita lo viejo: si algo falla a mitad, queda el horario anterior completo
  const { data: viejos, error: e1 } = await supabase.from("horario_atencion").select("id").eq("org_id", sesion.orgId);
  if (e1) return { ok: false, mensaje: sinPermiso(e1) };
  if (tramos.length) {
    const { error } = await supabase.from("horario_atencion").insert(tramos.map((t) => ({ org_id: sesion.orgId, dia: t.dia, desde: t.desde, hasta: t.hasta, minutos, cupos })));
    if (error) return { ok: false, mensaje: sinPermiso(error) };
  }
  if (viejos?.length) {
    const { error } = await supabase.from("horario_atencion").delete().in("id", viejos.map((v) => v.id));
    if (error) return { ok: false, mensaje: sinPermiso(error) };
  }
  revalidatePath("/configuracion/horario");
  return { ok: true, mensaje: tramos.length ? "Horario guardado. RR. HH. ya ve solo las horas libres." : "Horario quitado: RR. HH. vuelve a escribir la hora libremente." };
}

export async function agregarBloqueo(b: { fecha: string; desde: string | null; hasta: string | null; motivo: string | null }): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  if (!b.fecha) return { ok: false, mensaje: "Indica el día." };
  if (b.fecha < hoyCaracas()) return { ok: false, mensaje: "Ese día ya pasó." };
  if ((b.desde || b.hasta) && (!b.desde || !b.hasta || b.hasta <= b.desde)) return { ok: false, mensaje: "Indica desde y hasta (la final después de la inicial), o marca «Todo el día»." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("bloqueos_agenda").insert({ org_id: sesion.orgId, fecha: b.fecha, desde: b.desde, hasta: b.hasta, motivo: b.motivo?.trim().slice(0, 200) || null });
  if (error) return { ok: false, mensaje: sinPermiso(error) };
  revalidatePath("/configuracion/horario");
  return { ok: true, mensaje: "Bloqueado. RR. HH. ya no ve esas horas." };
}

export async function quitarBloqueo(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("bloqueos_agenda").delete().eq("id", id);
  if (error) return { ok: false, mensaje: sinPermiso(error) };
  revalidatePath("/configuracion/horario");
  return { ok: true, mensaje: "" };
}
