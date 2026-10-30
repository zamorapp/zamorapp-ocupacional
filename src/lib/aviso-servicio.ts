import "server-only";
import { after } from "next/server";
import { correoConfigurado, enviarCorreo, remitente } from "@/lib/correo";
import { ahora } from "@/lib/fecha";
import { URL_PUBLICA } from "@/lib/invitaciones";
import { esRolEmpresa, type Rol } from "@/lib/sesion-roles";

const HORA = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h12" });

// Aviso al celular del servicio: un correo corto al Gmail remitente (el del servicio) cuando RR. HH. hace algo desde el
// portal (entra por invitación, pide citas, registra trabajadores nuevos o hace una solicitud). Sale de la nube aunque
// la PC del consultorio esté apagada. Nunca bloquea ni hace fallar la acción: corre con after() y se traga los errores.
export function avisarAlServicio(m: { rol: Rol | null; asunto: string; lineas: string[]; ruta: string }) {
  if (!esRolEmpresa(m.rol) || !correoConfigurado()) return;
  // La hora se toma al ocurrir el hecho, en la nube (la hora de la PC de Cesar puede estar cambiada)
  const cuando = HORA.format(new Date(ahora()));
  after(async () => {
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
