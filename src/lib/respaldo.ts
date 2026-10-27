import "server-only";
import type { Estado } from "@/lib/demo";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

type Registro = { fecha: string; estado: "ok" | "aviso" | "fallo"; archivo: string | null; tamano_kb: number | null; destinos: number | null; detalle: string | null };

export type EstadoRespaldo = { estado: Estado; titulo: string; detalle: string };

// Más de este tiempo sin respaldo correcto es aviso (el respaldo corre a diario a las 12:30 y al iniciar la PC)
const LIMITE_HORAS = 25;
const ZONA = "America/Caracas";

const hace = (fecha: string) => {
  const horas = (Date.now() - new Date(fecha).getTime()) / 36e5;
  if (horas < 1) return "hace menos de una hora";
  if (horas < 48) return `hace ${Math.floor(horas)} h`;
  return `hace ${Math.floor(horas / 24)} días`;
};
const cuando = (fecha: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: ZONA }).format(new Date(fecha));
const tamano = (kb: number | null) => (kb == null ? "" : kb >= 1024 ? `${(kb / 1024).toFixed(1).replace(".", ",")} MB` : `${kb} KB`);

// Solo administrador y gerente médico (la función de la base devuelve null a los demás)
export async function estadoRespaldo(sesion: Sesion): Promise<EstadoRespaldo | null> {
  if (sesion.demo || (sesion.rol !== "administrador" && sesion.rol !== "gerente_medico")) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("estado_respaldo");
  if (error || !data) return null;
  const { ultimo, ultimo_ok } = data as { ultimo: Registro | null; ultimo_ok: Registro | null };

  if (!ultimo_ok) {
    return { estado: "alerta", titulo: "Aún no hay respaldos registrados", detalle: "Programa el respaldo diario en la PC con «programar-respaldo.cmd»." };
  }
  const horas = (Date.now() - new Date(ultimo_ok.fecha).getTime()) / 36e5;
  const lugar = ultimo_ok.estado === "ok" ? "en la PC y en Google Drive" : "solo en la PC";
  const base = `${cuando(ultimo_ok.fecha)} · ${tamano(ultimo_ok.tamano_kb)} · ${lugar}`;
  const fallo = ultimo && ultimo.estado === "fallo" && ultimo.fecha > ultimo_ok.fecha ? ` · Último intento falló ${hace(ultimo.fecha)}${ultimo.detalle ? `: ${ultimo.detalle}` : ""}` : "";

  if (horas > LIMITE_HORAS) {
    return { estado: "alerta", titulo: `Sin respaldo correcto desde ${hace(ultimo_ok.fecha)}`, detalle: `Último: ${base}${fallo}. Enciende la PC con Google Drive abierto o corre scripts\\respaldo.ps1.` };
  }
  if (ultimo_ok.estado === "aviso" || fallo) {
    return { estado: "aviso", titulo: `Respaldo ${hace(ultimo_ok.fecha)}, con aviso`, detalle: `${base}${fallo}${ultimo_ok.detalle && !fallo ? ` · ${ultimo_ok.detalle}` : ""}` };
  }
  return { estado: "ok", titulo: `Respaldo al día (${hace(ultimo_ok.fecha)})`, detalle: base };
}
