// Centinela de plazos legales: centinela_legal() crea los avisos de la campana (declaración ante el INPSASEL,
// informe NT-02, investigación del accidente) y deja los correos en cola. Si quien entra es administrador o
// gerente médico y el correo está configurado, se envían aquí. Nunca bloquea la página: corre con after().
import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { correoConfigurado, enviarCorreo } from "@/lib/correo";
import { URL_PUBLICA } from "@/lib/invitaciones";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

const ROLES = new Set(["administrador", "gerente_medico", "medico", "enfermeria", "coordinador_sst"]);
const DESPACHAN = new Set(["administrador", "gerente_medico"]);

type Pendiente = { id: string; correo: string; titulo: string; texto: string; enlace: string };

export async function vigilarPlazos(sesion: Pick<Sesion, "demo" | "rol" | "organizacion">) {
  if (sesion.demo || !sesion.rol || !ROLES.has(sesion.rol)) return;
  try {
    // Un prefetch (pasar el mouse por un enlace) no es una visita: no revisa plazos ni envía correos
    if ((await headers()).get("next-router-prefetch")) return;
    const supabase = await crearClienteServidor();
    after(async () => {
      try {
        await supabase.rpc("centinela_legal");
        if (!DESPACHAN.has(sesion.rol!) || !correoConfigurado()) return;
        const { data } = await supabase.rpc("centinela_correos_pendientes");
        const enviados: string[] = [];
        for (const c of (data ?? []) as Pendiente[]) {
          try {
            await enviarCorreo({
              para: c.correo,
              asunto: `zamorApp · ${c.titulo}`,
              texto: `${c.titulo}\n${c.texto}\n\nÁbrelo aquí: ${URL_PUBLICA}${c.enlace}\n\nAviso automático del centinela de plazos legales de ${sesion.organizacion}.`,
              nombreRemitente: sesion.organizacion,
              adjuntos: [],
            });
            enviados.push(c.id);
          } catch {
            // Queda en cola: se reintenta la próxima vez
          }
        }
        if (enviados.length) await supabase.rpc("centinela_correos_enviados", { p_ids: enviados });
      } catch {
        // Es solo un aviso: si falla, no pasa nada
      }
    });
  } catch {
    // Sin cliente no hay aviso; la página carga igual
  }
}
