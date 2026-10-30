import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// Latido de la app: lo llama el workflow «Calentar» cada 5 min en horario de consulta para que la función de
// Vercel (plan gratuito) no se duerma entre pantallas, y sirve de chequeo de salud: responde cuánto tardó la
// base. No expone datos: la consulta corre como anónimo y RLS no devuelve filas.
export const dynamic = "force-dynamic";

export async function GET() {
  const inicio = performance.now();
  let base: number | null = null;
  try {
    const supabase = await crearClienteServidor();
    const t0 = performance.now();
    await supabase.from("empresas").select("id", { head: true, count: "exact" }).limit(1);
    base = performance.now() - t0;
  } catch {
    base = null;
  }
  return NextResponse.json(
    { ok: true, base_ms: base, total_ms: performance.now() - inicio, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local" },
    { headers: { "Cache-Control": "no-store", "Server-Timing": `base;dur=${base ?? 0}` } },
  );
}
