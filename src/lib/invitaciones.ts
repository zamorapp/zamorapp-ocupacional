import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

// Invitaciones por enlace para RR. HH. de cada empresa. El enlace se arma una sola vez al crearlas (la base guarda
// solo el sha256 del token), así que la lista muestra el estado, no el enlace.

export const URL_PUBLICA = (process.env.ZAMORAPP_URL_PUBLICA || "https://zamorapp-ocupacional.vercel.app").replace(/\/$/, "");
export const TOKEN_INVITACION = /^[A-Za-z0-9_-]{40,60}$/;

export type Invitacion = {
  id: string;
  empresa: string;
  nombre: string | null;
  telefono: string | null;
  estado: "vigente" | "usada" | "vencida" | "anulada";
  vence: string;
  usadaEn: string | null;
  creadoEn: string;
};

export async function listarInvitaciones(limite = 30): Promise<Invitacion[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("invitaciones")
    .select("id, nombre, telefono, vence, usada_en, revocada_en, creado_en, empresas(razon_social, nombre_comercial)")
    .order("creado_en", { ascending: false })
    .limit(limite);
  type Fila = { id: string; nombre: string | null; telefono: string | null; vence: string; usada_en: string | null; revocada_en: string | null; creado_en: string; empresas: { razon_social: string; nombre_comercial: string | null } | null };
  return ((data ?? []) as unknown as Fila[]).map((i) => ({
    id: i.id,
    empresa: i.empresas ? i.empresas.nombre_comercial || i.empresas.razon_social : "—",
    nombre: i.nombre,
    telefono: i.telefono,
    estado: i.revocada_en ? "anulada" : i.usada_en ? "usada" : new Date(i.vence) < new Date() ? "vencida" : "vigente",
    vence: i.vence,
    usadaEn: i.usada_en,
    creadoEn: i.creado_en,
  }));
}
