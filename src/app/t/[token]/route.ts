import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const html = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Si el enlace existió, dice a quién pedírselo (nombre y teléfono del servicio, de Configuración › Organización)
const paginaNoValido = (servicio?: string | null, telefono?: string | null) => {
  const a = servicio ? `a ${html(servicio)}${telefono ? `, ${html(telefono)}` : ""}` : "al servicio médico";
  const tel = telefono?.replace(/[^\d+]/g, "");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Enlace no disponible</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0;padding:16px;background:#f6f8f8;color:#1d2a2c}main{max-width:420px;text-align:center}h1{font-size:20px}a{color:#0b6b62}</style></head>
<body><main><h1>Este enlace ya no está disponible</h1><p>Venció (dura 7 días) o el servicio médico lo anuló. Pídeselo de nuevo ${a}.</p>${tel ? `<p><a href="tel:${tel}">Llamar</a></p>` : ""}</main></body></html>`;
};

// Documento personal que el servicio médico le envió al trabajador por WhatsApp (récipe, indicaciones, dieta…).
// Igual que /e/<token>: la función abrir_enlace_trabajador valida vencimiento y anulación y anota la apertura.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cabeceras = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    return new Response(paginaNoValido(), { status: 404, headers: { ...cabeceras, "Content-Type": "text/html; charset=utf-8" } });
  }
  const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.rpc("abrir_enlace_trabajador", { p_token: token, p_agente: request.headers.get("user-agent") });
  const archivo = (data as { nombre: string | null; contenido_base64: string | null; servicio: string | null; telefono_servicio: string | null }[] | null)?.[0];
  if (!archivo?.contenido_base64 || !archivo.nombre)
    return new Response(paginaNoValido(archivo?.servicio, archivo?.telefono_servicio), { status: 404, headers: { ...cabeceras, "Content-Type": "text/html; charset=utf-8" } });
  return new Response(Buffer.from(archivo.contenido_base64, "base64"), {
    headers: {
      ...cabeceras,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
    },
  });
}
