import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// Latido de la app: lo llama el workflow «Calentar» cada 5 min en horario de consulta para que la función de
// Vercel (plan gratuito) no se duerma entre pantallas, y sirve de chequeo de salud: responde cuánto tardó la
// base. No expone datos: la consulta corre como anónimo y RLS no devuelve filas.
export const dynamic = "force-dynamic";

export async function GET() {
  // eslint-disable-next-line no-restricted-syntax -- duración o caché en memoria, no es una fecha de negocio
  const inicio = Date.now();
  let base: number | null = null;
  try {
    const supabase = await crearClienteServidor();
    // eslint-disable-next-line no-restricted-syntax -- duración o caché en memoria, no es una fecha de negocio
    const t0 = Date.now();
    await supabase.from("empresas").select("id", { head: true, count: "exact" }).limit(1);
    // eslint-disable-next-line no-restricted-syntax -- duración o caché en memoria, no es una fecha de negocio
    base = Date.now() - t0;
  } catch {
    base = null;
  }
  return NextResponse.json(
    // eslint-disable-next-line no-restricted-syntax -- duración o caché en memoria, no es una fecha de negocio
    { ok: true, base_ms: base, total_ms: Date.now() - inicio, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local" },
    { headers: { "Cache-Control": "no-store", "Server-Timing": `base;dur=${base ?? 0}` } },
  );
}
