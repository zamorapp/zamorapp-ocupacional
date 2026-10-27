import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const PAGINA_NO_VALIDO = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Enlace no disponible</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0;padding:16px;background:#f6f8f8;color:#1d2a2c}main{max-width:420px;text-align:center}h1{font-size:20px}</style></head>
<body><main><h1>Este enlace ya no está disponible</h1><p>Venció (dura 7 días) o el servicio médico lo anuló. Pide uno nuevo al servicio médico.</p></main></body></html>`;

// Documento enviado por WhatsApp: valida el token en la base (vencimiento, revocación) y anota la apertura.
// Nunca usa una URL firmada de Storage ni service_role: la función abrir_enlace es la única puerta.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cabeceras = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    return new Response(PAGINA_NO_VALIDO, { status: 404, headers: { ...cabeceras, "Content-Type": "text/html; charset=utf-8" } });
  }
  const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.rpc("abrir_enlace", { p_token: token, p_agente: request.headers.get("user-agent") });
  const archivo = (data as { nombre: string; contenido_base64: string }[] | null)?.[0];
  if (!archivo) return new Response(PAGINA_NO_VALIDO, { status: 404, headers: { ...cabeceras, "Content-Type": "text/html; charset=utf-8" } });
  return new Response(Buffer.from(archivo.contenido_base64, "base64"), {
    headers: {
      ...cabeceras,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
    },
  });
}
