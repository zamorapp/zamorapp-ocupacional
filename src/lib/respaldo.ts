import "server-only";
import type { Estado } from "@/lib/demo";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";

type Registro = { fecha: string; estado: "ok" | "aviso" | "fallo"; archivo: string | null; tamano_kb: number | null; destinos: number | null; detalle: string | null };

export type EstadoRespaldo = { estado: Estado; titulo: string; detalle: string };

// Más de este tiempo sin respaldo correcto es aviso (el respaldo corre a diario a las 12:30 y al iniciar la PC)
const LIMITE_HORAS = 25;
// La prueba de restauración corre una vez por semana desde el respaldo de la PC; con un día de holgura
const LIMITE_DIAS_RESTAURACION = 8;
const ZONA = "America/Caracas";

const hace = (fecha: string, ahora: number) => {
  const horas = (ahora - new Date(fecha).getTime()) / 36e5;
  if (horas < 1) return "hace menos de una hora";
  if (horas < 48) return `hace ${Math.floor(horas)} h`;
  return `hace ${Math.floor(horas / 24)} días`;
};
const cuando = (fecha: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: ZONA }).format(new Date(fecha));
// La franja es de un vistazo: el detalle largo (errores del registro) se recorta; el completo está en el registro de la PC
const corto = (texto: string, max = 140) => (texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto);
const tamano = (kb: number | null) => (kb == null ? "" : kb >= 1024 ? `${(kb / 1024).toFixed(1).replace(".", ",")} MB` : `${kb} KB`);

// En el escritorio este Next corre en la PC, con la fecha de Windows (Cesar la cambia por el SAME): se usa la hora
// anclada que manda la puerta. En la web (Vercel) la hora del servidor es fiable.
async function ahoraFiable(): Promise<number> {
  if (!ESCRITORIO) return Date.now();
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/zamorapp/estado`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
  const hora = Date.parse(r?.hora ?? "");
  return Number.isFinite(hora) ? hora : Date.now();
}

// Solo administrador y gerente médico (la función de la base devuelve null a los demás)
export async function estadoRespaldo(sesion: Sesion): Promise<EstadoRespaldo | null> {
  if (sesion.demo || (sesion.rol !== "administrador" && sesion.rol !== "gerente_medico")) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("estado_respaldo");
  if (error || !data) return null;
  const ahora = await ahoraFiable();
  const { ultimo, ultimo_ok, ultima_restauracion: prueba, ultimo_archivos: archivos } = data as {
    ultimo: Registro | null; ultimo_ok: Registro | null; ultima_restauracion?: Registro | null; ultimo_archivos?: Registro | null;
  };
  const falloArchivos = archivos?.estado === "fallo" ? ` · Falló el respaldo de archivos ${hace(archivos.fecha, ahora)}` : "";
  // ¿El respaldo sirve para recuperar los datos? Vencida o fallida, la franja pasa a aviso
  const pruebaMala = !!prueba && (prueba.estado === "fallo" || (ahora - new Date(prueba.fecha).getTime()) / 864e5 > LIMITE_DIAS_RESTAURACION);
  const restauracion = !prueba
    ? " · Restauración aún sin probar"
    : prueba.estado === "fallo"
      ? ` · La prueba de restauración falló ${hace(prueba.fecha, ahora)}${prueba.detalle ? `: ${prueba.detalle}` : ""}`
      : ` · Restauración probada ${hace(prueba.fecha, ahora)}${pruebaMala ? " (toca repetirla)" : ""}`;

  if (!ultimo_ok) {
    return { estado: "alerta", titulo: "Aún no hay respaldos registrados", detalle: "Programa el respaldo diario en la PC con «programar-respaldo.cmd»." };
  }
  const horas = (ahora - new Date(ultimo_ok.fecha).getTime()) / 36e5;
  const lugar = ultimo_ok.estado === "ok" ? "en la PC y en Google Drive" : "solo en la PC";
  const base = `${cuando(ultimo_ok.fecha)} · ${tamano(ultimo_ok.tamano_kb)} · ${lugar}`;
  const fallo = ultimo && ultimo.estado === "fallo" && ultimo.fecha > ultimo_ok.fecha ? ` · Último intento falló ${hace(ultimo.fecha, ahora)}${ultimo.detalle ? `: ${ultimo.detalle}` : ""}` : "";

  if (horas > LIMITE_HORAS) {
    return { estado: "alerta", titulo: `Sin respaldo correcto desde ${hace(ultimo_ok.fecha, ahora)}`, detalle: `${corto(`Último: ${base}${fallo}${falloArchivos}${restauracion}`)}. Enciende la PC con Google Drive abierto o corre scripts\\respaldo.ps1.` };
  }
  if (ultimo_ok.estado === "aviso" || fallo || falloArchivos) {
    return { estado: "aviso", titulo: `Respaldo ${hace(ultimo_ok.fecha, ahora)}, con aviso`, detalle: corto(`${base}${fallo}${falloArchivos}${ultimo_ok.detalle && !fallo ? ` · ${ultimo_ok.detalle}` : ""}${restauracion}`) };
  }
  // El respaldo está bien y el aviso viene solo de la prueba de restauración: título propio
  if (pruebaMala) {
    const titulo = prueba?.estado === "fallo" ? "Respaldo al día, pero falló la prueba de restauración" : "Respaldo al día, pero la restauración no está probada";
    return { estado: "aviso", titulo, detalle: corto(`${base}${restauracion}`) };
  }
  return { estado: "ok", titulo: `Respaldo al día (${hace(ultimo_ok.fecha, ahora)})`, detalle: corto(`${base}${restauracion}`) };
}

export type PruebaRestauracion = { estado: Estado; titulo: string; detalle: string };

// Pantalla Configuración › Respaldos: la última prueba de que la copia se abre y se restaura (restauracion_probada)
export async function pruebaRestauracion(sesion: Sesion): Promise<PruebaRestauracion | null> {
  if (sesion.demo) return { estado: "ok", titulo: "La copia se abre y se restaura", detalle: "Probado hace 3 días con la copia de Google Drive." };
  if (sesion.rol !== "administrador" && sesion.rol !== "gerente_medico") return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("estado_respaldo");
  if (error || !data) return null;
  const prueba = (data as { ultima_restauracion?: Registro | null }).ultima_restauracion;
  const ahora = await ahoraFiable();
  if (!prueba) return { estado: "aviso", titulo: "Aún no se ha probado abrir una copia", detalle: "Se prueba sola después de cada copia a Google Drive: elige la carpeta y la clave, y pulsa «Respaldar ahora»." };
  if (prueba.estado === "fallo") return { estado: "alerta", titulo: "Falló la prueba de abrir la copia", detalle: corto(`${cuando(prueba.fecha)}${prueba.detalle ? ` · ${prueba.detalle}` : ""}`) };
  const vencida = (ahora - new Date(prueba.fecha).getTime()) / 864e5 > LIMITE_DIAS_RESTAURACION;
  return vencida
    ? { estado: "aviso", titulo: "Toca repetir la prueba de abrir la copia", detalle: `La última fue ${hace(prueba.fecha, ahora)}.` }
    : { estado: "ok", titulo: "La copia se abre y se restaura", detalle: `Probado ${hace(prueba.fecha, ahora)}.` };
}
