import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { claveAvisos, pushConfigurado } from "@/lib/push";

// Acuse de un aviso push (20261030932000): el service worker del aparato lo manda al recibirlo. Así la campana sabe si
// un celular dejó de recibir los avisos (ahorro de batería, notificaciones apagadas) en vez de suponer que llegaron.
// Sin sesión: la base solo acepta el acuse con la clave del servidor, y solo toca la suscripción de ese endpoint.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!pushConfigurado() || process.env.NEXT_PUBLIC_ESCRITORIO === "1") return new NextResponse(null, { status: 204 });
  const cuerpo = (await request.json().catch(() => null)) as { endpoint?: unknown; mostrado?: unknown } | null;
  const endpoint = typeof cuerpo?.endpoint === "string" ? cuerpo.endpoint : "";
  if (!/^https:\/\/[^\s]{10,900}$/.test(endpoint)) return new NextResponse(null, { status: 400 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc("acuse_aviso_push", { p_endpoint: endpoint, p_clave: claveAvisos(), p_mostrado: cuerpo?.mostrado !== false });
  if (error) console.error("acuse_aviso_push:", error.message);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
