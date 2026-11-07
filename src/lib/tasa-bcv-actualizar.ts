import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { ahora, hoyCaracas } from "@/lib/fecha";
import { claveAvisos, pushConfigurado } from "@/lib/push";
import { leerTasaBcv } from "@/lib/tasa-bcv-fuentes";

export type ResultadoTasa = { ok: boolean; guardada: boolean; motivo?: string; fecha?: string; fuente?: string };

// Busca y guarda la tasa BCV solo si hace falta: si ya está la de un día posterior a hoy (la que el BCV publica en la
// tarde) no sale; antes de las 3 p. m. de Caracas solo busca si falta la de hoy; como mucho un intento cada 10 minutos.
// La usan la ruta /api/tasa-bcv (cron diario de Vercel y latido de GitHub) y Facturación al abrirse (después de
// responder). Sin sesión ni llave de servicio: la base reconoce la organización por la clave del servidor.
export async function actualizarTasaBcv(): Promise<ResultadoTasa> {
  if (ESCRITORIO || !pushConfigurado()) return { ok: true, guardada: false, motivo: "sin clave" };
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clave = claveAvisos();
  const hoy = hoyCaracas();
  const hora = Number(new Date(ahora()).toLocaleString("en-US", { timeZone: "America/Caracas", hour: "numeric", hour12: false }));
  const { data: ultima, error } = await supabase.rpc("tasa_bcv_ultima_fecha", { p_clave: clave });
  if (error) return { ok: false, guardada: false, motivo: "base" };
  const u = (ultima as string | null) ?? "";
  if (u > hoy || (u === hoy && hora < 15)) return { ok: true, guardada: false, motivo: "al día" };

  const { data: toca } = await supabase.rpc("tasa_bcv_reservar_intento", { p_clave: clave });
  if (!toca) return { ok: true, guardada: false, motivo: "intento reciente" };

  const { tasa, fallas } = await leerTasaBcv();
  // Si el BCV falló y se usó el respaldo, queda el motivo en el registro (solo la de hoy llega por el respaldo)
  if (fallas.length) console.warn("tasa-bcv:", fallas.join(" | "));
  if (!tasa) {
    console.error("tasa-bcv: no se pudo leer", fallas.join(" | "));
    return { ok: false, guardada: false, motivo: "sin lectura" };
  }
  if (tasa.fecha <= u) return { ok: true, guardada: false, motivo: "sin novedad", fecha: tasa.fecha };
  const { data: n, error: e2 } = await supabase.rpc("guardar_tasa_bcv_auto", { p_clave: clave, p_fecha: tasa.fecha, p_tasa: tasa.tasa, p_fuente: tasa.fuente });
  if (e2) {
    console.error("tasa-bcv: no se guardó", e2.message.slice(0, 160));
    return { ok: false, guardada: false, motivo: "rechazada" };
  }
  return { ok: true, guardada: (n as number) > 0, fecha: tasa.fecha, fuente: tasa.fuente };
}
