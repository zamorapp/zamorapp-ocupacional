"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

// Entrar con huella (o rostro / PIN del equipo) en vez de escribir la contraseña.
// - Web, celular y tablet: llaves de acceso (passkeys) de Supabase Auth. La llave vive en el equipo y la
//   protege su huella; la nube solo guarda la parte pública.
// - Programa de escritorio: Windows Hello. La ventana pide la huella a Windows y la puerta local entrega la
//   sesión de esta PC (sirve también sin internet). La página nunca recibe comandos nativos: avisa a la
//   ventana navegando a una dirección que el programa intercepta, y el programa responde con un evento.

export const ES_ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO === "1";
const PUERTA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const MARCA = "zamorapp.huella"; // este navegador ya tiene una llave de acceso de esta cuenta
const NO_OFRECER = "zamorapp.huella.no-ofrecer";
/** Marca para la pantalla de dos pasos: se llega desde Windows Hello con internet (la nube pide el código). */
export const MOTIVO_HELLO = "zamorapp.dos-pasos.hello";

export type Resultado = { ok: true } | { ok: false; mensaje: string };

function leer(clave: string) {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function escribir(clave: string, valor: string | null) {
  try { if (valor === null) localStorage.removeItem(clave); else localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ }
}

/** ¿Este equipo puede usar huella / Windows Hello? En escritorio, además, la puerta debe conocer la función. */
export async function huellaDisponible(): Promise<boolean> {
  if (ES_ESCRITORIO) return (await estadoEscritorio()) !== null;
  try {
    return typeof window !== "undefined" && "PublicKeyCredential" in window
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

/** ¿Ya hay una huella activada para entrar desde este equipo? */
export async function huellaActivaAqui(): Promise<boolean> {
  if (ES_ESCRITORIO) return ((await estadoEscritorio())?.usuarios ?? 0) > 0;
  return leer(MARCA) === "1";
}

// En escritorio el «Ahora no» vale solo para esta instalación: la memoria de la ventana (WebView2) sobrevive a
// desinstalar el programa, y en una PC reinstalada hay que volver a ofrecer Windows Hello.
const claveNoOfrecer = async () => ES_ESCRITORIO ? `${NO_OFRECER}.${(await estadoEscritorio())?.instalacion ?? ""}` : NO_OFRECER;
export const ofrecerHuella = async () => leer(await claveNoOfrecer()) !== "1" && (ES_ESCRITORIO || leer(MARCA) !== "1");
export const noOfrecerHuella = async () => escribir(await claveNoOfrecer(), "1");

/**
 * ¿Se le puede ofrecer la huella ahora? No mientras falte el código de dos pasos: con la sesión sin ese paso
 * la nube rechaza registrar una llave (y el aviso confundía). Se ofrece después, en la pantalla del código.
 */
export async function puedeOfrecerHuella(supabase: SupabaseClient): Promise<boolean> {
  if (!(await ofrecerHuella()) || !(await huellaDisponible()) || (await huellaActivaAqui())) return false;
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.aal === "aal1") {
    const { data: requiere } = await supabase.rpc("falta_segundo_paso");
    if (requiere === true) return false;
  }
  if (ES_ESCRITORIO) return true;
  // Web: si la cuenta ya tiene una llave registrada en el servidor, no se ofrece crear otra (cada intento deja una
  // llave nueva en el gestor de Google o de Windows). Si la lista no se puede leer, tampoco se ofrece.
  const llaves = await listarHuellas(supabase);
  return Array.isArray(llaves) && llaves.length === 0;
}

/** Asocia la huella de este equipo a la cuenta con la que se acaba de entrar. */
export async function activarHuella(supabase: SupabaseClient): Promise<Resultado> {
  if (ES_ESCRITORIO) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, mensaje: "Vuelve a entrar con tu contraseña y activa la huella." };
    const r = await fetch(`${PUERTA}/zamorapp/huella/preparar`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    const cuerpo = r?.ok ? await r.json().catch(() => null) : null;
    if (!cuerpo?.codigo) return { ok: false, mensaje: "No se pudo preparar la huella en esta PC. Cierra y vuelve a abrir zamorApp." };
    const v = await pedirAVentana("activar", cuerpo.codigo);
    return v.ok ? { ok: true } : v;
  }
  // Sin el segundo paso no se registran llaves (la oferta ya sale después del código; esto cubre «Mi perfil»)
  const { data: falta } = await supabase.rpc("falta_segundo_paso");
  if (falta === true) return { ok: false, mensaje: "Primero escribe el código de verificación en dos pasos; después activa la huella." };
  const { error } = await supabase.auth.registerPasskey();
  if (error) return { ok: false, mensaje: mensajeError(error) };
  escribir(MARCA, "1");
  return { ok: true };
}

/** Entra con la huella. Deja la sesión abierta en el cliente de Supabase. */
export async function entrarConHuella(supabase: SupabaseClient): Promise<Resultado> {
  if (ES_ESCRITORIO) {
    const v = await pedirAVentana("entrar");
    if (!v.ok) return v;
    const r = await fetch(`${PUERTA}/auth/v1/token?grant_type=hello`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: v.codigo }),
    }).catch(() => null);
    const sesion = r ? await r.json().catch(() => null) : null;
    if (!r?.ok || !sesion?.access_token) return { ok: false, mensaje: sesion?.msg ?? "No se pudo entrar con la huella. Usa tu contraseña." };
    if (sesion.dos_pasos) { try { sessionStorage.setItem(MOTIVO_HELLO, "1"); } catch { /* sin almacenamiento */ } }
    const { error } = await supabase.auth.setSession({ access_token: sesion.access_token, refresh_token: sesion.refresh_token });
    return error ? { ok: false, mensaje: "No se pudo abrir la sesión. Usa tu contraseña." } : { ok: true };
  }
  const { error } = await supabase.auth.signInWithPasskey();
  if (error) return { ok: false, mensaje: mensajeError(error) };
  escribir(MARCA, "1");
  return { ok: true };
}

/** Llaves de acceso de la cuenta (solo web). */
export async function listarHuellas(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.passkey.list();
  return error ? null : data;
}

export async function quitarHuella(supabase: SupabaseClient, id: string, quedan: number): Promise<Resultado> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
  if (error) return { ok: false, mensaje: mensajeError(error) };
  if (quedan === 0) escribir(MARCA, null);
  return { ok: true };
}

/** Escritorio: deja de entrar con huella en esta PC (la cuenta sigue igual). */
export async function quitarHuellaEscritorio(supabase: SupabaseClient): Promise<Resultado> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`${PUERTA}/zamorapp/huella/quitar`, { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } }).catch(() => null);
  return r?.ok ? { ok: true } : { ok: false, mensaje: "No se pudo quitar la huella de esta PC." };
}

/** Escritorio: si la huella está activa para la cuenta abierta en esta PC. */
export async function huellaActivaEscritorio(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`${PUERTA}/zamorapp/huella/mia`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } }).catch(() => null);
  return Boolean(r?.ok && (await r.json().catch(() => null))?.activa);
}

async function estadoEscritorio(): Promise<{ usuarios: number; instalacion?: string } | null> {
  const r = await fetch(`${PUERTA}/zamorapp/huella/estado`).catch(() => null);
  return r?.ok ? await r.json().catch(() => null) : null;
}

type RespuestaVentana = { ok: true; codigo?: string } | { ok: false; mensaje: string };

// Avisa a la ventana del programa navegando a una dirección de la puerta que el programa intercepta (la página
// no cambia). El programa contesta con el evento "zamorapp-huella". Si en 5 s no confirma que recibió el pedido,
// es una versión del programa sin huella.
function pedirAVentana(accion: "activar" | "entrar", codigo?: string): Promise<RespuestaVentana> {
  return new Promise((resolver) => {
    let recibido = false;
    const fin = (r: RespuestaVentana) => { window.removeEventListener("zamorapp-huella", escuchar); clearTimeout(espera); resolver(r); };
    const escuchar = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.accion !== accion) return;
      if (d.estado === "pidiendo") { recibido = true; clearTimeout(espera); espera = setTimeout(() => fin({ ok: false, mensaje: "Windows no respondió. Intenta de nuevo." }), 120_000); return; }
      fin(d.ok ? { ok: true, codigo: d.codigo } : { ok: false, mensaje: d.mensaje || "No se pudo usar Windows Hello." });
    };
    let espera = setTimeout(() => { if (!recibido) fin({ ok: false, mensaje: "Actualiza zamorApp Escritorio para usar la huella." }); }, 5_000);
    window.addEventListener("zamorapp-huella", escuchar);
    window.location.assign(`${PUERTA}/zamorapp/huella/ventana/${accion}${codigo ? `?codigo=${encodeURIComponent(codigo)}` : ""}`);
  });
}

function mensajeError(error: { code?: string; name?: string; message?: string }) {
  const codigo = error.code ?? "";
  if (codigo === "passkey_disabled") return "La entrada con huella aún no está activada en zamorApp. Avísale al administrador.";
  if (codigo === "webauthn_credential_exists" || codigo === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "Este equipo ya tiene tu huella registrada.";
  if (codigo === "too_many_passkeys") return "Tu cuenta ya tiene el máximo de huellas. Quita una que no uses.";
  if (codigo === "webauthn_credential_not_found") return "Esta huella ya no está asociada a ninguna cuenta. Entra con tu contraseña y actívala de nuevo.";
  if (codigo.startsWith("webauthn_challenge")) return "Tardó demasiado. Intenta de nuevo.";
  if (codigo === "user_banned") return "Tu acceso fue desactivado. Habla con el administrador.";
  if (codigo === "insufficient_aal") return "Primero escribe el código de verificación en dos pasos; después activa la huella.";
  // El navegador rechaza la llave si la dirección de zamorApp no coincide con la configurada en el servidor (RP ID)
  if (error.name === "SecurityError" || codigo === "webauthn_verification_failed")
    return `La huella no está configurada para esta dirección de zamorApp. Avísale al soporte (${codigo || error.name}).`;
  if (error.name === "NotAllowedError" || codigo === "ERROR_CEREMONY_ABORTED" || /cancel|not allowed/i.test(error.message ?? ""))
    return "Se canceló la huella. Puedes intentarlo de nuevo o usar tu contraseña.";
  // Con el código a la vista, soporte sabe qué pasó sin pedir capturas de la consola
  return `No se pudo usar la huella. Usa tu contraseña. (${[codigo, error.name, error.message].filter(Boolean).join(" · ").slice(0, 120)})`;
}
