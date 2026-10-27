// Recordatorio de paraclínicos sin resultado: recordar_resultados() crea los avisos de la campana
// (solo del médico que llama, cada N días según el ajuste de la organización). Nunca bloquea la página.
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function recordarResultados(sesion: Pick<Sesion, "demo" | "clinico" | "rol">) {
  if (sesion.demo || !sesion.clinico || sesion.rol === "enfermeria" || sesion.rol === "recepcion") return;
  try {
    const supabase = await crearClienteServidor();
    await supabase.rpc("recordar_resultados");
  } catch {
    // Es solo un aviso: si falla, la página carga igual
  }
}
