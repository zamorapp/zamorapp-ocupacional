// Función de Supabase: entrega enlaces firmados de 10 minutos para respaldar los archivos (adjuntos, solicitudes).
// No pide sesión de usuario: pide un pase de un solo uso que el respaldo de la PC deja en public.pases_respaldo con la
// clave de la base. La service_role la pone Supabase en el entorno de la función y nunca sale de aquí.
// Publicar: npx supabase functions deploy respaldo-archivos --no-verify-jwt --project-ref xgsoryzvyrsddgkxkzeb
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MINUTOS = 10;
const LOTE = 100;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Solo POST" }, 405);
  const { pase, desde } = await req.json().catch(() => ({}));
  if (typeof pase !== "string" || pase.length < 32) return json({ error: "Falta el pase" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: valido, error: e1 } = await supabase.rpc("canjear_pase_respaldo", { p_pase: pase });
  if (e1) return json({ error: "No se pudo validar el pase" }, 500);
  if (!valido) return json({ error: "Pase inválido, usado o vencido" }, 403);

  const { data: archivos, error: e2 } = await supabase.rpc("archivos_para_respaldo", { p_desde: typeof desde === "string" ? desde : null });
  if (e2) return json({ error: "No se pudo listar los archivos" }, 500);

  // Enlaces firmados por bucket y de a 100: solo permiten bajar ese archivo durante 10 minutos
  const salida: { bucket: string; nombre: string; cambiado: string; bytes: number; url: string | null }[] = [];
  const porBucket = new Map<string, typeof archivos>();
  for (const a of archivos ?? []) porBucket.set(a.bucket, [...(porBucket.get(a.bucket) ?? []), a]);
  for (const [bucket, lista] of porBucket) {
    for (let i = 0; i < lista.length; i += LOTE) {
      const lote = lista.slice(i, i + LOTE);
      const { data: firmados } = await supabase.storage.from(bucket).createSignedUrls(lote.map((a) => a.nombre), MINUTOS * 60);
      lote.forEach((a, j) => salida.push({ ...a, url: firmados?.[j]?.signedUrl ?? null }));
    }
  }
  return json({ archivos: salida });
});

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
}
