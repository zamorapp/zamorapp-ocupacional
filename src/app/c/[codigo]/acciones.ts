"use server";

import { supabaseConfigurado } from "@/lib/config";
import { CODIGO_DEMO, CODIGO_PSICOSOCIAL, normalizarCodigo, TOTAL_PREGUNTAS } from "@/lib/psicosocial";
import { clienteAnonimo } from "@/lib/supabase/anonimo";

// El trabajador envía su cuestionario. La única puerta es la función de la base: valida el código (un solo uso),
// guarda la respuesta SIN unirla al código ni a la persona y gasta el código. No se guarda ni la hora ni la IP.
export async function enviarCuestionario(codigo: string, grupo: string | null, respuestas: number[]): Promise<{ ok: boolean; mensaje: string }> {
  const c = normalizarCodigo(codigo);
  if (!CODIGO_PSICOSOCIAL.test(c)) return { ok: false, mensaje: "Código no válido." };
  if (!Array.isArray(respuestas) || respuestas.length !== TOTAL_PREGUNTAS || respuestas.some((r) => !Number.isInteger(r) || r < 0 || r > 4)) {
    return { ok: false, mensaje: "Faltan respuestas: contesta las 38 preguntas." };
  }
  if (!supabaseConfigurado && c === CODIGO_DEMO) return { ok: true, mensaje: "" }; // demo: no guarda nada
  const supabase = clienteAnonimo();
  if (!supabase) return { ok: false, mensaje: "El servicio no está disponible. Intenta más tarde." };
  const { data, error } = await supabase.rpc("enviar_cuestionario_psicosocial", {
    p_codigo: c,
    p_grupo: typeof grupo === "string" && /^[a-z0-9]{1,12}$/.test(grupo) ? grupo : null,
    p_respuestas: respuestas,
  });
  if (error) return { ok: false, mensaje: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo: tus respuestas siguen aquí." };
  return data === "ok" ? { ok: true, mensaje: "" } : { ok: false, mensaje: String(data ?? "No se pudo enviar.") };
}
