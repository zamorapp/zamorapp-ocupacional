import "server-only";
import { after } from "next/server";
import { correoConfigurado, enviarCorreo, remitente } from "@/lib/correo";
import { ahora } from "@/lib/fecha";
import { URL_PUBLICA } from "@/lib/invitaciones";
import { avisarCelulares, pushConfigurado } from "@/lib/push";
import { esRolEmpresa, type Rol } from "@/lib/sesion-roles";
import { crearClienteServidor } from "@/lib/supabase/server";

const HORA = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h12" });

// Aviso al celular del servicio cuando RR. HH. hace algo desde el portal (entra por invitación, pide citas, registra
// trabajadores nuevos o hace una solicitud): notificación push a cada celular con «Activar avisos» (lib/push.ts) y un
// correo corto al Gmail remitente (el del servicio). Sale de la nube aunque la PC del consultorio esté apagada.
// Nunca bloquea ni hace fallar la acción: corre con after() y se traga los errores.
export function avisarAlServicio(m: { rol: Rol | null; empresaId: string; asunto: string; lineas: string[]; ruta: string }) {
  if (!esRolEmpresa(m.rol)) return;
  // La hora se toma al ocurrir el hecho, en la nube (la hora de la PC de Cesar puede estar cambiada)
  const cuando = HORA.format(new Date(ahora()));
  if (pushConfigurado()) after(async () => {
    try {
      // La sesión es la de RR. HH.: la base le da solo a quién avisar de su empresa, con la clave del servidor
      await avisarCelulares(await crearClienteServidor(), m.empresaId, { titulo: m.asunto, cuerpo: m.lineas[0] ?? "", ruta: m.ruta });
    } catch (e) {
      console.error("avisarCelulares:", e instanceof Error ? e.message : e);
    }
  });
  if (correoConfigurado()) after(async () => {
    try {
      await enviarCorreo({
        para: remitente(),
        asunto: `zamorApp · ${m.asunto}`,
        texto: [...m.lineas, "", `Hora: ${cuando}`, `Ver en zamorApp: ${URL_PUBLICA}${m.ruta}`].join("\n"),
        nombreRemitente: "zamorApp avisos",
        adjuntos: [],
      });
    } catch (e) {
      console.error("avisarAlServicio:", e instanceof Error ? e.message : e);
    }
  });
}
