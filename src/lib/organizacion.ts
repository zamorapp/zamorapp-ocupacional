import "server-only";
import { cache } from "react";
import { supabaseConfigurado } from "@/lib/config";
import type { AjustesDocumentos } from "@/lib/documentos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Nombre y ajustes de la organización (plantillas de mensajes, textos de documentos)
export const datosOrganizacion = cache(async (): Promise<{ nombre: string; ajustes: AjustesDocumentos }> => {
  const sesion = await obtenerSesion();
  if (!supabaseConfigurado || sesion.demo || !sesion.orgId) return { nombre: sesion.organizacion, ajustes: {} };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("organizaciones").select("nombre, ajustes").eq("id", sesion.orgId).single();
  return { nombre: data?.nombre ?? sesion.organizacion, ajustes: (data?.ajustes ?? {}) as AjustesDocumentos };
});
