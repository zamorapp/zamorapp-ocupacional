"use server";

import { revalidatePath } from "next/cache";
import { URL_PUBLICA } from "@/lib/agentes/puerta";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type LlaveNueva = { ok: true; llave: string; direccion: string; nombre: string; permiso: "consultar" | "crear"; vence: string } | { ok: false; mensaje: string };

function explicar(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "Solo el administrador maneja la puerta para agentes.";
  if (error.code === "PGRST202") return "Falta aplicar la actualización de la base (puerta para agentes).";
  if (/fetch failed|network|timeout/i.test(error.message)) return "Sin internet no se puede: la puerta vive en la nube.";
  return error.message;
}

async function organizacion(): Promise<{ org: string } | { no: string }> {
  const s = await obtenerSesion();
  if (s.demo || !s.orgId) return { no: "En modo demo no hay puerta para agentes." };
  if (s.rol !== "administrador") return { no: "Solo el administrador maneja la puerta para agentes." };
  return { org: s.orgId };
}

// La llave se devuelve UNA vez a la pantalla de quien la creó; la base guarda solo su huella
export async function crearLlave(nombre: string, permiso: "consultar" | "crear", dias: number): Promise<LlaveNueva> {
  const o = await organizacion();
  if ("no" in o) return { ok: false, mensaje: o.no };
  const limpio = nombre.trim().slice(0, 60);
  if (limpio.length < 2) return { ok: false, mensaje: "Escribe un nombre para la llave (por ejemplo «Claude»)." };
  if (!["consultar", "crear"].includes(permiso) || ![7, 30, 90].includes(dias)) return { ok: false, mensaje: "Opción no válida." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_llave_agente" as never, { p_org: o.org, p_nombre: limpio, p_permiso: permiso, p_dias: dias } as never);
  if (error) return { ok: false, mensaje: explicar(error) };
  const d = data as unknown as { llave: string; vence_en: string };
  revalidatePath("/configuracion/agentes");
  return { ok: true, llave: d.llave, direccion: `${URL_PUBLICA}/api/agentes/mcp/${d.llave}`, nombre: limpio, permiso, vence: d.vence_en };
}

export async function apagarLlave(id: string): Promise<{ ok: boolean; mensaje: string }> {
  const o = await organizacion();
  if ("no" in o) return { ok: false, mensaje: o.no };
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, mensaje: "Llave no válida." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("revocar_llave_agente" as never, { p_id: id } as never);
  if (error) return { ok: false, mensaje: explicar(error) };
  revalidatePath("/configuracion/agentes");
  return { ok: true, mensaje: "Llave apagada." };
}
