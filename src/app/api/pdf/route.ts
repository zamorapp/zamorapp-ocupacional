import { cookies } from "next/headers";
import { pdfConNavegador } from "@/lib/pdf-navegador";
import { crearClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Única función con Chromium (ver pdf-servidor.ts). La llaman las acciones del propio servidor con las cookies de
// quien envía; el Chromium abre las páginas de /imprimir con esa sesión y la RLS decide qué datos salen.
export async function POST(req: Request) {
  // Desde un navegador solo se acepta el mismo sitio (las acciones del servidor no mandan Origin)
  const origen = req.headers.get("origin");
  if (origen && new URL(origen).host !== new URL(req.url).host) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "La sesión venció: vuelve a entrar y repite el envío." }, { status: 401 });

  const { rutas } = await req.json().catch(() => ({ rutas: null }));
  if (!Array.isArray(rutas) || !rutas.length || rutas.length > 4 || rutas.some((r) => typeof r !== "string" || !r.startsWith("/imprimir/") || r.includes(".."))) {
    return Response.json({ error: "Rutas no válidas" }, { status: 400 });
  }
  try {
    const pdfs = await pdfConNavegador(rutas, (await cookies()).getAll());
    return Response.json({ pdfs: pdfs.map((p) => p.toString("base64")) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo preparar el documento." }, { status: 500 });
  }
}
