import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// Latido de la app: lo llama el workflow «Calentar» cada 5 min en horario de consulta para que la función de
// Vercel (plan gratuito) no se duerma entre pantallas, y sirve de chequeo de salud: responde cuánto tardó la
// base con una función pública de fecha que no consulta datos de usuarios ni empresas.
export const dynamic = "force-dynamic";

export async function GET() {
  const inicio = performance.now();
  let base: number | null = null;
  try {
    const supabase = await crearClienteServidor();
    const t0 = performance.now();
    const { data, error } = await supabase.rpc("hoy_caracas");
    if (!error && typeof data === "string") base = performance.now() - t0;
  } catch {
    base = null;
  }
  return NextResponse.json(
    { ok: base !== null, base_ms: base, total_ms: performance.now() - inicio, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local" },
    { status: base === null ? 503 : 200,
      headers: { "Cache-Control": "no-store", ...(base !== null ? { "Server-Timing": `base;dur=${base}` } : {}) } },
  );
}
