"use server";

import { TOKEN_REGISTRO } from "@/lib/solicitudes-paciente";
import { clienteAnonimo } from "@/lib/supabase/anonimo";

// El paciente envía sus datos. La única puerta es la función de la base, que valida el token (vigente, una sola vez)
// y guarda solo los campos conocidos.

export async function enviarRegistro(token: string, datos: Record<string, string>): Promise<{ ok: boolean; mensaje: string }> {
  if (!TOKEN_REGISTRO.test(token)) return { ok: false, mensaje: "Enlace no válido." };
  // Campo trampa invisible: solo un robot lo llena. Se le responde «listo» sin guardar nada.
  if (datos.sitio_web) return { ok: true, mensaje: "" };
  const limpio = Object.fromEntries(Object.entries(datos).filter(([k, v]) => k !== "sitio_web" && typeof v === "string" && v.length <= 600));
  const supabase = clienteAnonimo();
  if (!supabase) return { ok: false, mensaje: "El servicio no está disponible. Intenta más tarde." };
  const { data, error } = await supabase.rpc("enviar_solicitud_paciente", { p_token: token, p_datos: limpio });
  if (error) return { ok: false, mensaje: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo." };
  return data === "ok" ? { ok: true, mensaje: "" } : { ok: false, mensaje: String(data ?? "No se pudo enviar.") };
}
