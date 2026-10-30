// Recordatorio de paraclínicos sin resultado: recordar_resultados() crea los avisos de la campana
// (solo del médico que llama, cada N días según el ajuste de la organización). recordar_alertas() avisa las
// «Alertas para la próxima evaluación» con fecha cercana o vencida (todo el personal clínico). Nunca bloquea la página:
// corre con after(), cuando la respuesta ya salió. Las cookies se leen antes (en after() no se puede).
import { after } from "next/server";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function recordarResultados(sesion: Pick<Sesion, "demo" | "clinico" | "rol">) {
  if (sesion.demo || !sesion.clinico || sesion.rol === "recepcion") return;
  const medico = sesion.rol !== "enfermeria";
  try {
    const supabase = await crearClienteServidor();
    after(async () => {
      try {
        await Promise.all([medico ? supabase.rpc("recordar_resultados") : null, supabase.rpc("recordar_alertas")]);
      } catch {
        // Es solo un aviso: si falla, no pasa nada
      }
    });
  } catch {
    // Sin cliente no hay aviso; la página carga igual
  }
}
