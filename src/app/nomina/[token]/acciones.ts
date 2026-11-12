"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { DISPOSITIVO, MOTIVOS_SALIDA, TOKEN_DEMO_NOMINA, TOKEN_DEPURACION, galletaNomina, type Agregado, type MotivoSalida, type VistaDepuracion } from "@/lib/depurar-nomina";
import { clienteAnonimo } from "@/lib/supabase/anonimo";

// RR. HH. sin cuenta. La única puerta son las funciones de la base, que validan en cada llamada el enlace (vigente, no
// anulado, no confirmado), el aparato amarrado (secreto en una galleta httpOnly que el navegador nunca ve) y que la
// persona sea de la nómina de esa empresa.
type R = { ok: boolean; mensaje: string };
const UUID = /^[0-9a-f-]{36}$/i;
const SIN_SERVICIO: R = { ok: false, mensaje: "El servicio no está disponible. Intente más tarde." };
const SIN_RED: R = { ok: false, mensaje: "No se guardó. Revise su conexión e inténtelo de nuevo." };

async function dispositivo(token: string) {
  const v = (await cookies()).get(galletaNomina(token))?.value ?? "";
  return DISPOSITIVO.test(v) ? v : null;
}

async function llamar(fn: string, token: string, args: Record<string, unknown>): Promise<R> {
  const supabase = clienteAnonimo();
  // Vista de muestra sin Supabase: responde como si guardara (no hay dónde)
  if (!supabase) return token === TOKEN_DEMO_NOMINA ? { ok: true, mensaje: "" } : SIN_SERVICIO;
  const disp = await dispositivo(token);
  if (!disp) return { ok: false, mensaje: "Abra de nuevo el enlace y escriba su teléfono." };
  const { data, error } = await supabase.rpc(fn, { p_token: token, p_dispositivo: disp, ...args });
  if (error) return SIN_RED;
  return data === "ok" ? { ok: true, mensaje: "" } : { ok: false, mensaje: String(data ?? "No se guardó.") };
}

/** Abre el enlace con el teléfono. Este aparato queda amarrado (galleta de 60 días, solo para /nomina). */
export async function abrir(token: string, telefono: string): Promise<R & { quedan?: number }> {
  if (!TOKEN_DEPURACION.test(token)) return { ok: false, mensaje: "Enlace no válido." };
  const supabase = clienteAnonimo();
  if (!supabase && token !== TOKEN_DEMO_NOMINA) return SIN_SERVICIO;
  const almacen = await cookies();
  const disp = (await dispositivo(token)) ?? randomBytes(32).toString("hex");
  // Vista de muestra sin Supabase: cualquier teléfono entra
  const { data, error } = supabase
    ? await supabase.rpc("abrir_depuracion_nomina", { p_token: token, p_telefono: String(telefono ?? "").slice(0, 30), p_dispositivo: disp })
    : { data: "ok", error: null };
  if (error) return { ok: false, mensaje: "No se pudo comprobar. Revise su conexión e inténtelo de nuevo." };
  // El secreto se guarda aunque falle, para que el mismo aparato siga contando como el mismo
  almacen.set(galletaNomina(token), disp, { path: "/nomina", maxAge: 60 * 60 * 24 * 60, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  const r = String(data ?? "");
  if (r === "ok") return { ok: true, mensaje: "" };
  if (r.startsWith("mal:")) {
    const quedan = Number(r.slice(4));
    return { ok: false, quedan, mensaje: `Ese no es el teléfono al que le enviamos el enlace. Le ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`}.` };
  }
  if (r === "otro_telefono") return { ok: false, mensaje: "Este enlace ya se abrió en otro teléfono. Si cambió de teléfono, pida al servicio médico que le permita usar este." };
  if (r === "bloqueado") return { ok: false, mensaje: "El enlace se bloqueó por varios intentos fallidos. Pida al servicio médico que lo desbloquee." };
  return { ok: false, mensaje: "El enlace venció o ya no está activo." };
}

export async function marcar(token: string, trabajador: string, estado: "si" | "no" | null, motivo: MotivoSalida | null): Promise<R> {
  if (!TOKEN_DEPURACION.test(token) || !UUID.test(trabajador)) return { ok: false, mensaje: "Enlace no válido." };
  if (estado !== null && estado !== "si" && estado !== "no") return { ok: false, mensaje: "Marca no válida." };
  if (motivo !== null && !MOTIVOS_SALIDA.includes(motivo)) return { ok: false, mensaje: "Motivo no válido." };
  return llamar("marcar_depuracion_nomina", token, { p_trabajador: trabajador, p_estado: estado, p_motivo: estado === "no" ? motivo : null });
}

export async function marcarResto(token: string): Promise<R> {
  if (!TOKEN_DEPURACION.test(token)) return { ok: false, mensaje: "Enlace no válido." };
  return llamar("marcar_resto_depuracion_nomina", token, {});
}

// Devuelve la lista de agregados como quedó en la base (con su número, para poder quitarlos)
export async function agregar(token: string, datos: { nombres: string; apellidos: string; cedula: string; cargo: string; trampa?: string }): Promise<R & { agregados?: Agregado[] }> {
  if (!TOKEN_DEPURACION.test(token)) return { ok: false, mensaje: "Enlace no válido." };
  // Campo trampa invisible: solo un robot lo llena
  if (datos.trampa) return { ok: true, mensaje: "" };
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const r = await llamar("agregar_depuracion_nomina", token, {
    p_nombres: t(datos.nombres, 80), p_apellidos: t(datos.apellidos, 80), p_cedula: t(datos.cedula, 20) || null, p_cargo: t(datos.cargo, 80) || null,
  });
  const supabase = clienteAnonimo();
  if (!r.ok || !supabase) return r;
  const { data } = await supabase.rpc("ver_depuracion_nomina", { p_token: token, p_dispositivo: await dispositivo(token) });
  return { ...r, agregados: (data as VistaDepuracion | null)?.agregados ?? [] };
}

export async function quitar(token: string, id: string): Promise<R> {
  if (!TOKEN_DEPURACION.test(token) || !UUID.test(id)) return { ok: false, mensaje: "Enlace no válido." };
  return llamar("quitar_agregado_depuracion_nomina", token, { p_id: id });
}

export async function enviar(token: string): Promise<R> {
  if (!TOKEN_DEPURACION.test(token)) return { ok: false, mensaje: "Enlace no válido." };
  return llamar("enviar_depuracion_nomina", token, {});
}
