import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Sesion } from "@/lib/sesion";

export const revisaCambiosCitas = (s: Sesion) => !s.demo && Boolean(s.orgId) && s.rol === "administrador";

export type CambioCitaAgente = {
  id: string;
  trabajador: string;
  empresa: string;
  operacion: "reprogramar" | "cancelar";
  fecha_anterior: string;
  hora_anterior: string | null;
  estado_anterior: "citado" | "solicitada";
  fecha_nueva: string | null;
  hora_nueva: string | null;
  agente: string;
};

export async function cambiosCitasPorRevisar(s: Sesion): Promise<CambioCitaAgente[] | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("agentes_cambios_citas")
    .select("id, trabajador, empresa, operacion, fecha_anterior, hora_anterior, estado_anterior, fecha_nueva, hora_nueva, agente")
    .eq("org_id", s.orgId!).eq("estado", "pendiente").order("creado_en", { ascending: false }).limit(100);
  return error ? null : (data ?? []) as CambioCitaAgente[];
}

export async function contarCambiosCitas(s: Sesion): Promise<number> {
  const supabase = await crearClienteServidor();
  const { count } = await supabase.from("agentes_cambios_citas").select("id", { count: "exact", head: true })
    .eq("org_id", s.orgId!).eq("estado", "pendiente");
  return count ?? 0;
}
