"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EMPRESA } from "@/lib/empresa-activa";
import { TOKEN_INVITACION } from "@/lib/invitaciones";
import { invalidarSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Acepta la invitación con la cuenta de la sesión: queda como RR. HH. de la empresa y entra a su portal
export async function aceptar(token: string): Promise<{ ok: false; mensaje: string }> {
  if (!TOKEN_INVITACION.test(token)) return { ok: false, mensaje: "El enlace no es válido." };
  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const usuario = claims?.claims?.sub;
  if (!usuario) return { ok: false, mensaje: "Ingresa con tu cuenta para aceptar." };
  const { data: empresaId, error } = await supabase.rpc("aceptar_invitacion", { p_token: token });
  if (error) return { ok: false, mensaje: error.message };
  invalidarSesion(usuario);
  (await cookies()).set(COOKIE_EMPRESA, String(empresaId), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect("/portal");
}
