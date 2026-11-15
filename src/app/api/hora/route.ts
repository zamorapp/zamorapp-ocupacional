import { NextResponse } from "next/server";

// Hora de la nube para el celular sin internet (src/lib/movil): la cabecera Date de esta respuesta ancla su reloj,
// igual que la PC con la de Supabase (que el navegador no deja leer desde otro dominio). Sin base ni datos.
// También dice qué versión de la web está publicada, para que una pestaña o app abierta sepa que hay una nueva.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, version: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) }, { headers: { "Cache-Control": "no-store" } });
}
