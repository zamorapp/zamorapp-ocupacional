"use server";

import { obtenerSesion } from "@/lib/sesion";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { crearClienteServidor } from "@/lib/supabase/server";
import { claveAvisos, enviarPush, estadoVapid, vapidPublica, type Suscripcion } from "@/lib/push";

type Resultado = { ok: boolean; mensaje: string };

// Llave pública para suscribir este celular (sale de la privada de Vercel; null si falta o no sirve)
export async function llaveAvisos(): Promise<string | null> {
  return vapidPublica();
}

// Activar avisos en este celular: solo el personal del servicio (la base lo vuelve a exigir en guardar_suscripcion_push)
export async function activarAvisos(s: Suscripcion & { equipo: string; prueba?: string }): Promise<Resultado & { guardada?: boolean }> {
  const vapid = estadoVapid();
  if (vapid === "falta") return { ok: false, mensaje: "Falta un paso en Vercel (VAPID_PRIVADA). Pídele a Claude la guía." };
  if (vapid !== "ok") return { ok: false, mensaje: "La llave VAPID_PRIVADA de Vercel no es válida. Pídele a Claude que la renueve." };
  const sesion = await obtenerSesion();
  if (!sesion.orgId || esRolEmpresa(sesion.rol)) return { ok: false, mensaje: "Los avisos son para el personal del servicio." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_suscripcion_push", {
    p_org: sesion.orgId, p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_equipo: s.equipo.slice(0, 120), p_clave: claveAvisos(),
  });
  if (error) return { ok: false, mensaje: error.message };
  return { ...(await probarAviso(s.endpoint, s.prueba, "Avisos activos", "Así te llegarán los avisos de RR. HH. y de la campana.")), guardada: true };
}

// Aviso de prueba a este celular (el usuario solo lee sus propias suscripciones)
export async function probarAviso(endpoint: string, prueba?: string, titulo = "Aviso de prueba", cuerpo = "Si ves esto, los avisos funcionan en este celular."): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("suscripciones_push").select("endpoint, p256dh, auth").eq("endpoint", endpoint);
  if (!data?.length) return { ok: false, mensaje: "Este celular no tiene avisos activos." };
  const { enviados, vencidos, fallo } = await enviarPush(data, { titulo, cuerpo, ruta: "/panel", prueba: prueba?.slice(0, 40) });
  if (vencidos.length) await supabase.from("suscripciones_push").delete().in("endpoint", vencidos);
  return enviados ? { ok: true, mensaje: "El servidor envió el aviso de prueba." } : { ok: false, mensaje: `No se pudo enviar el aviso de prueba${fallo ? ` (el servicio de avisos respondió ${fallo.slice(0, 80)})` : ""}. Vuelve a activarlos.` };
}

export async function quitarAvisos(endpoint: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("suscripciones_push").delete().eq("endpoint", endpoint);
  return error ? { ok: false, mensaje: error.message } : { ok: true, mensaje: "Avisos desactivados en este celular." };
}
