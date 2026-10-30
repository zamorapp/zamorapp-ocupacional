import { NextResponse } from "next/server";

// Hora de la nube para el celular sin internet (src/lib/movil): la cabecera Date de esta respuesta ancla su reloj,
// igual que la PC con la de Supabase (que el navegador no deja leer desde otro dominio). Sin base ni datos.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
