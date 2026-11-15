"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ES_ESCRITORIO } from "@/lib/huella";

// Entrar con correo O con usuario corto («cesar»), como en el SAME. El usuario corto lo asigna el administrador
// en Configuración > Usuarios y la clave es la misma de la cuenta.
// - Web: la nube cambia usuario + clave por el correo (correo_para_ingreso) solo si la clave es correcta, y luego
//   se entra con el correo como siempre (con la verificación en dos pasos si el rol la exige).
// - Escritorio: el usuario corto va tal cual a la puerta local, que lo resuelve con la nube o, sin internet,
//   con lo que recuerda de esta PC.

const ULTIMO = "zamorapp.ultimo-usuario";

export const esUsuarioCorto = (texto: string) => !texto.includes("@");

type ErrorIngreso = { message: string; code?: string; status?: number; name?: string };

export async function correoParaEntrar(supabase: SupabaseClient, texto: string, clave: string): Promise<{ correo: string } | { error: ErrorIngreso }> {
  const limpio = texto.trim().toLowerCase();
  if (!esUsuarioCorto(limpio) || ES_ESCRITORIO) return { correo: limpio };
  const { data, error } = await supabase.rpc("correo_para_ingreso", { p_usuario: limpio, p_clave: clave });
  if (error) {
    if (error.code === "P0429") {
      const min = Number(error.hint) || 15;
      return { error: { message: `Demasiados intentos. Espera ${min} min y vuelve a probar (o entra con tu correo).`, code: "over_request_rate_limit", status: 429 } };
    }
    // Sin respuesta del servicio (sin internet): el mismo aviso de conexión del ingreso con correo
    return { error: { message: error.message, code: error.code, status: error.code ? 500 : undefined, name: error.code ? undefined : "AuthRetryableFetchError" } };
  }
  if (!data) return { error: { message: "Invalid login credentials", code: "invalid_credentials", status: 400 } };
  return { correo: String(data) };
}

// Se recuerda el último usuario con el que se entró (no la clave), en el escritorio y en la web: así se escribe
// solo la contraseña o se entra directo con la huella
export function ultimoUsuario(): string {
  try { return localStorage.getItem(ULTIMO) ?? ""; } catch { return ""; }
}
export function recordarUsuario(texto: string) {
  try { localStorage.setItem(ULTIMO, texto.trim().toLowerCase()); } catch { /* sin almacenamiento */ }
}
