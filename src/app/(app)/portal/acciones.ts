"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string };

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

// La empresa pide la cita; el servicio médico la confirma o reprograma
export async function solicitarCita(_: Resultado | null, datos: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  const trabajadorId = texto(datos, "trabajador_id");
  const fecha = texto(datos, "fecha");
  if (!trabajadorId || !fecha) return { ok: false, mensaje: "Elige el trabajador y la fecha." };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  if (fecha < hoy) return { ok: false, mensaje: "La fecha ya pasó." };

  const supabase = await crearClienteServidor();
  const { data: t } = await supabase.from("trabajadores").select("empresa_id").eq("id", trabajadorId).single();
  if (!t) return { ok: false, mensaje: "Trabajador no encontrado." };
  const { error } = await supabase.from("citas").insert({
    org_id: sesion.orgId,
    empresa_id: t.empresa_id,
    trabajador_id: trabajadorId,
    fecha,
    hora: texto(datos, "hora"),
    motivo_id: texto(datos, "motivo_id"),
    nota_empresa: texto(datos, "nota"),
    estado: "solicitada",
    origen: "portal",
    solicitada_por: sesion.usuarioId,
  });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu usuario no puede solicitar citas para esta empresa." : error.message };
  revalidatePath("/portal");
  return { ok: true, mensaje: "Solicitud enviada al servicio médico." };
}

export async function cancelarSolicitud(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("citas").update({ estado: "cancelada" }).eq("id", id).eq("estado", "solicitada");
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/portal");
  return { ok: true, mensaje: "" };
}
