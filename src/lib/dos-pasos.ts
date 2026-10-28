"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

// Verificación en dos pasos (código de 6 dígitos de una app autenticadora, TOTP de Supabase Auth).
// Obligatoria para administradores y gerentes médicos; la exige el middleware antes de abrir el panel.

export type Paso =
  | { tipo: "cargando" }
  | { tipo: "activar"; factorId: string; qr: string; secreto: string }
  | { tipo: "codigo"; factorId: string }
  | { tipo: "error"; mensaje: string };

/** Busca el autenticador ya activado; si no hay, prepara uno nuevo (código QR) para activarlo. */
export async function prepararDosPasos(supabase: SupabaseClient): Promise<Paso> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { tipo: "error", mensaje: "No se pudo consultar tu verificación en dos pasos. Vuelve a entrar." };
  const activo = data.totp.find((f) => f.status === "verified");
  if (activo) return { tipo: "codigo", factorId: activo.id };
  // Un QR que quedó sin confirmar (se cerró la página a medias) se descarta y se crea otro
  for (const f of data.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const nuevo = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "zamorApp", friendlyName: `Teléfono ${new Date().toLocaleDateString("es-VE")}` });
  if (nuevo.error || !nuevo.data) return { tipo: "error", mensaje: "No se pudo preparar el código QR. Intenta de nuevo en un momento." };
  return { tipo: "activar", factorId: nuevo.data.id, qr: nuevo.data.totp.qr_code, secreto: nuevo.data.totp.secret };
}

/** Confirma el código de 6 dígitos. Si es correcto, la sesión queda verificada (aal2). */
export async function confirmarCodigo(supabase: SupabaseClient, factorId: string, codigo: string): Promise<string | null> {
  const limpio = codigo.replace(/\D/g, "");
  if (limpio.length !== 6) return "El código tiene 6 dígitos.";
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: limpio });
  if (!error) return null;
  if (error.status === 429) return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
  if (error.status === 503) return error.message; // programa de escritorio sin internet (aviso de la puerta)
  if (error.code === "mfa_verification_failed" || error.code === "mfa_challenge_expired") return "El código no es correcto o ya cambió. Escribe el que muestra ahora la app.";
  return "No se pudo verificar el código. Revisa la hora del teléfono (automática) e intenta de nuevo.";
}

/** Autenticadores ya activados en la cuenta (para "Mi perfil"). */
export async function autenticadores(supabase: SupabaseClient) {
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.filter((f) => f.status === "verified") ?? [];
}
