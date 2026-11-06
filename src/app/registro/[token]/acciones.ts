"use server";

import { revalidatePath } from "next/cache";
import { TOKEN_REGISTRO } from "@/lib/solicitudes-paciente";
import { clienteAnonimo } from "@/lib/supabase/anonimo";

// El paciente envía sus datos. La única puerta es la función de la base, que valida el token (vigente, una sola vez)
// y guarda solo los campos conocidos (antecedentes y hábitos, solo los del catálogo de la organización).
type Salud = { antecedentes: { id: string; detalle: string }[]; habitos: { clave: string; valor: string }[] };
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

// documentos: el servicio le dejó documentos para descargar (la página se recarga y los muestra)
export async function enviarRegistro(token: string, datos: Record<string, string>, salud?: Salud): Promise<{ ok: boolean; mensaje: string; documentos?: boolean }> {
  if (!TOKEN_REGISTRO.test(token)) return { ok: false, mensaje: "Enlace no válido." };
  // Campo trampa invisible: solo un robot lo llena. Se le responde «listo» sin guardar nada.
  if (datos.sitio_web) return { ok: true, mensaje: "" };
  const limpio: Record<string, unknown> = Object.fromEntries(Object.entries(datos).filter(([k, v]) => k !== "sitio_web" && typeof v === "string" && v.length <= 1000));
  if (salud) {
    limpio.antecedentes = (Array.isArray(salud.antecedentes) ? salud.antecedentes : []).slice(0, 60)
      .map((a) => ({ id: texto(a?.id, 36), detalle: texto(a?.detalle, 200) })).filter((a) => /^[0-9a-f-]{36}$/i.test(a.id));
    limpio.habitos = (Array.isArray(salud.habitos) ? salud.habitos : []).slice(0, 30)
      .map((h) => ({ clave: texto(h?.clave, 60), valor: texto(h?.valor, 120) })).filter((h) => h.clave && h.valor.trim());
  }
  const supabase = clienteAnonimo();
  if (!supabase) return { ok: false, mensaje: "El servicio no está disponible. Intenta más tarde." };
  const { data, error } = await supabase.rpc("enviar_solicitud_paciente", { p_token: token, p_datos: limpio });
  if (error) return { ok: false, mensaje: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo." };
  if (data !== "ok") return { ok: false, mensaje: String(data ?? "No se pudo enviar.") };
  const { data: docs } = await supabase.rpc("documentos_registro_paciente", { p_token: token });
  return { ok: true, mensaje: "", documentos: Boolean(docs) };
}

// Resultados: la base reserva la ruta exacta (30 min); el navegador sube el archivo a esa ruta con la llave pública y
// luego se confirma. La base revisa el tipo y el tamaño que guardó Storage antes de pasarlo a la historia.
export async function reservarResultado(token: string, tipo: string): Promise<{ ruta?: string; error?: string }> {
  if (!TOKEN_REGISTRO.test(token)) return { error: "Enlace no válido." };
  const supabase = clienteAnonimo();
  if (!supabase) return { error: "El servicio no está disponible. Intenta más tarde." };
  const { data, error } = await supabase.rpc("reservar_resultado_paciente", { p_token: token, p_tipo_mime: tipo });
  if (error) return { error: "No se pudo preparar la subida. Revisa tu conexión." };
  return data as { ruta?: string; error?: string };
}

export async function confirmarResultado(token: string, ruta: string, nombre: string): Promise<{ ok: boolean; mensaje: string }> {
  if (!TOKEN_REGISTRO.test(token) || typeof ruta !== "string" || ruta.length > 200) return { ok: false, mensaje: "Enlace no válido." };
  const supabase = clienteAnonimo();
  if (!supabase) return { ok: false, mensaje: "El servicio no está disponible. Intenta más tarde." };
  const { data, error } = await supabase.rpc("confirmar_resultado_paciente", { p_token: token, p_ruta: ruta, p_nombre: texto(nombre, 120) });
  if (error) return { ok: false, mensaje: "No se pudo registrar el archivo. Inténtalo de nuevo." };
  revalidatePath(`/registro/${token}`);
  return data === "ok" ? { ok: true, mensaje: "" } : { ok: false, mensaje: String(data) };
}

// Primer «Descargar PDF»: abre la ventana de 30 minutos para bajar las hojas; después el enlace queda solo para subir
// resultados (20261030915000). Si falla, igual se deja descargar: la base vuelve a marcar en el próximo intento.
export async function marcarDescarga(token: string): Promise<void> {
  if (!TOKEN_REGISTRO.test(token)) return;
  const supabase = clienteAnonimo();
  if (supabase) await supabase.rpc("marcar_descarga_registro", { p_token: token });
}
