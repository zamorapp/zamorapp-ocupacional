import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { correoConfigurado, enviarCorreo } from "@/lib/correo";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { ahora } from "@/lib/fecha";
import { URL_PUBLICA } from "@/lib/invitaciones";
import { claveAvisos, pushConfigurado } from "@/lib/push";

// Correo diario de constancias a RR. HH. (envío automático por empresa, Cesar 31-oct). Lo llama el workflow «Avisos al
// celular» cada 15 minutos; la base decide a qué empresa ya le toca (pasó su hora y no se le envió hoy) y entrega sus
// constancias listas solo con la clave del servidor. Sin la llave de servicio. No devuelve datos: solo cuántas salieron.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Fila = { empresa_id: string; empresa: string; destinatarios: string[]; consulta_id: string; trabajador: string; nombre: string; contenido_base64: string };

const POR_LLAMADA = 4; // empresas por latido: el resto sale en el siguiente (15 min)
const momento = () =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(ahora()));

export async function GET() {
  if (ESCRITORIO || !pushConfigurado() || !correoConfigurado()) return NextResponse.json({ ok: true, enviadas: 0 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clave = claveAvisos();
  let enviadas = 0;
  let fallos = 0;
  const vistas = new Set<string>();
  for (let i = 0; i < POR_LLAMADA; i++) {
    const { data, error } = await supabase.rpc("constancias_del_dia", { p_clave: clave });
    if (error) return NextResponse.json({ ok: false }, { status: 500 });
    const todas = (data ?? []) as Fila[];
    if (!todas.length) break;
    // Gmail acepta hasta 25 MB por correo: lo que no quepa en 20 MB queda reservado y sale en el siguiente latido
    let peso = 0;
    const filas = todas.filter((f, i) => (peso += (f.contenido_base64.length * 3) / 4) <= 20 * 1024 * 1024 || i === 0);
    const { empresa_id: empresaId, empresa, destinatarios } = filas[0];
    // Si el correo de esta empresa falló en esta vuelta, no se reintenta hasta el siguiente latido
    if (vistas.has(empresaId)) break;
    vistas.add(empresaId);
    const lista = filas.map((f) => `• ${f.trabajador}`).join("\n");
    try {
      await enviarCorreo({
        para: destinatarios.join(", "),
        asunto: `Constancias de aptitud · ${empresa}`,
        texto: [
          `Adjunto ${filas.length === 1 ? "la constancia de aptitud" : `las ${filas.length} constancias de aptitud`} de las evaluaciones firmadas, enviado el ${momento()}:`,
          "",
          lista,
          "",
          "Recuerden resguardarlas en los expedientes respectivos.",
          `Para pedir otro documento: ${URL_PUBLICA}/portal`,
        ].join("\n"),
        nombreRemitente: "Servicio médico ocupacional",
        adjuntos: filas.map((f) => ({ nombre: f.nombre, contenido: Buffer.from(f.contenido_base64, "base64") })),
      });
    } catch (e) {
      fallos++;
      // Sin datos del correo en el registro (puede traer direcciones): solo el motivo corto
      console.error("constancias del día: el correo no salió:", (e as Error).message.slice(0, 120));
      continue;
    }
    const { data: n } = await supabase.rpc("marcar_constancias_enviadas", {
      p_clave: clave,
      p_empresa: empresaId,
      p_consultas: filas.map((f) => f.consulta_id),
      p_destinatarios: destinatarios,
    });
    enviadas += Number(n ?? 0);
  }
  return NextResponse.json({ ok: true, enviadas, fallos }, { headers: { "Cache-Control": "no-store" } });
}
