import { NextResponse } from "next/server";
import { actualizarTasaBcv } from "@/lib/tasa-bcv-actualizar";

// Tasa BCV automática (Cesar, 05-nov-2026). La llaman pg_cron en Supabase cada 30 minutos (20261030909000), el cron
// diario de Vercel (vercel.json, 18:30–19:30 de Caracas) de respaldo y GitHub cada hora. Solo sale al BCV si falta la
// tasa. No devuelve montos.
export const dynamic = "force-dynamic";
export const maxDuration = 40;

export async function GET() {
  const r = await actualizarTasaBcv();
  return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "sin lectura" ? 502 : 500 });
}
