"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EMPRESA } from "@/lib/empresa-activa";
import { avisarAlServicio } from "@/lib/aviso-servicio";
import { TOKEN_INVITACION } from "@/lib/invitaciones";
import { invalidarSesion } from "@/lib/sesion";
import { esRolEmpresa, nombreRolInvitado, type Rol } from "@/lib/sesion-roles";
import { crearClienteServidor } from "@/lib/supabase/server";

// Acepta la invitación con la cuenta de la sesión: queda con el rol del enlace (RR. HH., enfermería, médico…).
// Los roles de empresa entran a su portal; los del servicio, al panel (enfermería, a su pantalla).
export async function aceptar(token: string): Promise<{ ok: false; mensaje: string }> {
  if (!TOKEN_INVITACION.test(token)) return { ok: false, mensaje: "El enlace no es válido." };
  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const usuario = claims?.claims?.sub;
  if (!usuario) return { ok: false, mensaje: "Ingrese con su cuenta para aceptar." };
  const { data: empresaId, error } = await supabase.rpc("aceptar_invitacion", { p_token: token });
  if (error) return { ok: false, mensaje: error.message };
  invalidarSesion(usuario);
  const { data: filas } = await supabase.rpc("ver_invitacion", { p_token: token });
  const rol = (((filas as { rol: string | null }[] | null)?.[0]?.rol) ?? "gerente_empresa") as Rol;
  const deEmpresa = esRolEmpresa(rol);
  const cookiesActuales = await cookies();
  if (empresaId) cookiesActuales.set(COOKIE_EMPRESA, String(empresaId), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // Al servicio ya le llega el aviso de la base (campana); el push y el correo son del portal de empresas
  if (!deEmpresa || !empresaId) redirect(rol === "enfermeria" ? "/enfermeria" : "/panel");
  const [{ data: emp }, { data: perfil }] = await Promise.all([
    supabase.from("empresas").select("razon_social").eq("id", String(empresaId)).maybeSingle(),
    supabase.from("perfiles").select("nombre_completo").eq("id", usuario).maybeSingle(),
  ]);
  avisarAlServicio({
    rol,
    empresaId: String(empresaId),
    asunto: `${nombreRolInvitado(rol)} se registró · ${emp?.razon_social ?? "empresa"}`,
    lineas: [`${perfil?.nombre_completo || claims?.claims?.email || "Una persona"} aceptó la invitación y ya entra al portal de ${emp?.razon_social ?? "su empresa"}.`],
    ruta: "/configuracion/usuarios#invitar",
  });
  redirect("/portal");
}

// Quien abrió el enlace con otra cuenta del servicio abierta: cierra solo esta sesión y vuelve al paso 1 del enlace
export async function salirParaRegistrarse(token: string): Promise<void> {
  if (!TOKEN_INVITACION.test(token)) redirect("/login");
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut({ scope: "local" });
  redirect(`/invitacion/${token}`);
}
