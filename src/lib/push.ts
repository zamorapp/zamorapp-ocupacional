import "server-only";
import { createHmac } from "node:crypto";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { URL_PUBLICA } from "@/lib/invitaciones";
import { VAPID_PUBLICA } from "@/lib/push-publica";

// Avisos push al celular del servicio (Web Push con llaves VAPID). La llave pública va en el código; la privada vive SOLO
// en Vercel (VAPID_PRIVADA), nunca en el repo ni en el instalador del escritorio. De ella sale la clave compartida con la
// base (suscripciones_para_aviso): así la sesión de RR. HH. puede pedir a quién avisar sin poder leer las suscripciones.
export const pushConfigurado = () => Boolean(process.env.VAPID_PRIVADA);

export function claveAvisos() {
  return createHmac("sha256", process.env.VAPID_PRIVADA ?? "").update("zamorapp-avisos-push").digest("hex");
}

export type Suscripcion = { endpoint: string; p256dh: string; auth: string };
export type Aviso = { titulo: string; cuerpo: string; ruta: string };

// Envía a cada celular; devuelve los endpoints que el servicio de push dio por muertos (410/404) para borrarlos.
export async function enviarPush(subs: Suscripcion[], aviso: Aviso): Promise<{ enviados: number; vencidos: string[] }> {
  if (!pushConfigurado() || !subs.length) return { enviados: 0, vencidos: [] };
  const datos = JSON.stringify({ titulo: aviso.titulo, cuerpo: aviso.cuerpo.slice(0, 240), url: aviso.ruta });
  const opciones = {
    vapidDetails: { subject: URL_PUBLICA, publicKey: VAPID_PUBLICA, privateKey: process.env.VAPID_PRIVADA ?? "" },
    TTL: 60 * 60 * 24, // si el celular está apagado, el aviso espera hasta un día
    urgency: "high" as const,
  };
  const vencidos: string[] = [];
  let enviados = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, datos, opciones);
      enviados++;
    } catch (e) {
      const codigo = (e as { statusCode?: number }).statusCode;
      if (codigo === 404 || codigo === 410) vencidos.push(s.endpoint);
      else console.error("enviarPush:", codigo ?? (e instanceof Error ? e.message : e));
    }
  }));
  return { enviados, vencidos };
}

// Aviso a los celulares del servicio por un hecho de RR. HH. en esa empresa (la sesión es la de RR. HH.).
export async function avisarCelulares(supabase: SupabaseClient, empresaId: string, aviso: Aviso) {
  if (!pushConfigurado()) return;
  const clave = claveAvisos();
  const { data, error } = await supabase.rpc("suscripciones_para_aviso", { p_empresa: empresaId, p_clave: clave });
  if (error) throw new Error(error.message);
  const { vencidos } = await enviarPush((data ?? []) as Suscripcion[], aviso);
  await Promise.all(vencidos.map((endpoint) =>
    supabase.rpc("quitar_suscripcion_vencida", { p_empresa: empresaId, p_endpoint: endpoint, p_clave: clave })));
}
