import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { ahora, hoyCaracas } from "@/lib/fecha";
import { claveAvisos, pushConfigurado } from "@/lib/push";
import { leerTasaBcv } from "@/lib/tasa-bcv";

// Tasa BCV automática (Cesar, 05-nov-2026). La llama pg_cron en Supabase cada 30 minutos, pero solo va al
// BCV cuando hace falta: si ya está guardada la tasa de un día posterior a hoy (la que el BCV publica en la tarde), no
// hace nada. Antes de las 3 p. m. de Caracas solo busca si falta la de hoy. Sin sesión ni llave de servicio: la base
// reconoce la organización por la clave del servidor. No devuelve montos.
export const dynamic = "force-dynamic";
export const maxDuration = 40;

export async function GET() {
  if (ESCRITORIO || !pushConfigurado()) return NextResponse.json({ ok: true, guardada: false, motivo: "sin clave" });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clave = claveAvisos();
  const hoy = hoyCaracas();
  const hora = Number(new Date(ahora()).toLocaleString("en-US", { timeZone: "America/Caracas", hour: "numeric", hour12: false }));
  const { data: ultima, error } = await supabase.rpc("tasa_bcv_ultima_fecha", { p_clave: clave });
  if (error) return NextResponse.json({ ok: false, motivo: "base" }, { status: 500 });
  const u = (ultima as string | null) ?? "";
  if (u > hoy || (u === hoy && hora < 15)) return NextResponse.json({ ok: true, guardada: false, motivo: "al día" });

  // Freno: como mucho un intento cada 10 minutos aunque llamen la ruta muchas veces
  const { data: toca } = await supabase.rpc("tasa_bcv_reservar_intento", { p_clave: clave });
  if (!toca) return NextResponse.json({ ok: true, guardada: false, motivo: "intento reciente" });

  const { tasa, fallas } = await leerTasaBcv();
  if (!tasa) {
    console.error("tasa-bcv: no se pudo leer", fallas.join(" | "));
    return NextResponse.json({ ok: false, guardada: false, motivo: "sin lectura" }, { status: 502 });
  }
  // Lo mismo que ya está guardado (el BCV aún no publica la de mañana): nada que hacer
  if (tasa.fecha <= u) return NextResponse.json({ ok: true, guardada: false, motivo: "sin novedad", fecha: tasa.fecha });
  const { data: n, error: e2 } = await supabase.rpc("guardar_tasa_bcv_auto", { p_clave: clave, p_fecha: tasa.fecha, p_tasa: tasa.tasa, p_fuente: tasa.fuente });
  if (e2) {
    console.error("tasa-bcv: no se guardó", e2.message.slice(0, 160));
    return NextResponse.json({ ok: false, guardada: false, motivo: "rechazada" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, guardada: (n as number) > 0, fecha: tasa.fecha, fuente: tasa.fuente });
}
