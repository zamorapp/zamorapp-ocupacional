"use server";

import { revalidatePath } from "next/cache";
import { numeroWhatsApp } from "@/lib/mensajes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// El botón de WhatsApp de la agenda, cuando la ficha no tiene teléfono, pide el número al momento y
// ofrece guardarlo (pedido de Cesar, 19-nov-2026). 584141234567 (normalizado) → 0414-1234567 (ficha)
const formatoFicha = (n: string) => (n.startsWith("58") && n.length === 12 ? `0${n.slice(2, 5)}-${n.slice(5)}` : `+${n}`);

export type ResultadoTelefono = { ok: boolean; mensaje: string };

export async function guardarTelefonoTrabajador(trabajadorId: string, telefono: string): Promise<ResultadoTelefono> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para guardar el teléfono." };
  if (!sesion.rol || !["administrador", "gerente_medico", "medico", "enfermeria", "recepcion"].includes(sesion.rol))
    return { ok: false, mensaje: "Tu rol no permite editar la ficha." };
  if (!/^[0-9a-f-]{36}$/i.test(trabajadorId)) return { ok: false, mensaje: "Paciente no válido." };
  const normal = numeroWhatsApp(telefono);
  if (!normal) return { ok: false, mensaje: "Revisa el celular (ejemplo: 0414-1234567)." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("trabajadores")
    .update({ telefono: formatoFicha(normal) })
    .eq("id", trabajadorId)
    .eq("org_id", sesion.orgId)
    .select("id");
  if (error) return { ok: false, mensaje: error.message };
  if (!data?.length) return { ok: false, mensaje: "No se guardó: recarga la página." };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "" };
}
