import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { claveAvisos, enviarPush, pushConfigurado, type Suscripcion } from "@/lib/push";
import { correoConfigurado, enviarCorreo } from "@/lib/correo";
import { URL_PUBLICA } from "@/lib/invitaciones";

// Latido de los avisos de la campana al celular: lo llama el workflow «Avisos al celular» cada 15 minutos (también
// con la laptop apagada). Sin sesión: la base solo responde con la clave del servidor (VAPID_PRIVADA, solo en Vercel)
// y cada aviso sale una vez, así que llamarlo de más no repite nada. No devuelve datos: solo cuántos avisos salieron.
export const dynamic = "force-dynamic";

type Fila = Suscripcion & { titulo: string; cuerpo: string | null; ruta: string };

export async function GET() {
  if (!pushConfigurado() || process.env.NEXT_PUBLIC_ESCRITORIO === "1") return NextResponse.json({ ok: true, enviados: 0 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clave = claveAvisos();
  const { data, error } = await supabase.rpc("avisos_campana_para_celular", { p_clave: clave });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  let enviados = 0;
  for (const f of (data ?? []) as Fila[]) {
    const r = await enviarPush([f], { titulo: f.titulo, cuerpo: f.cuerpo ?? "", ruta: f.ruta });
    enviados += r.enviados;
    for (const endpoint of r.vencidos) await supabase.rpc("quitar_suscripcion_vencida_clave", { p_endpoint: endpoint, p_clave: clave });
  }
  // Correo a RR. HH. y a los contactos de la empresa por cada hora propuesta (20261030790000): sale una vez por propuesta
  let correos = 0;
  if (correoConfigurado()) {
    const { data: porEnviar } = await supabase.rpc("correos_propuestas_por_enviar", { p_clave: clave });
    for (const c of (porEnviar ?? []) as { para: string[]; asunto: string; texto: string }[]) {
      for (const para of c.para ?? []) {
        try {
          await enviarCorreo({ para, asunto: c.asunto, texto: `${c.texto}\n${URL_PUBLICA}/portal#propuestas`, nombreRemitente: "zamorApp avisos", adjuntos: [] });
          correos++;
        } catch (e) {
          console.error("correo de propuesta:", e instanceof Error ? e.message : e);
        }
      }
    }
  }
  return NextResponse.json({ ok: true, enviados, correos }, { headers: { "Cache-Control": "no-store" } });
}
