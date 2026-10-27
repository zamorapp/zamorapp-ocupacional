import "server-only";
import type { AjustesDocumentos } from "@/lib/documentos";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Datos comunes de los documentos que no salen de una consulta (accidentes, investigación, notificaciones, inspección)
export type DocumentoBase = {
  orgId: string;
  org: { nombre: string; rif: string | null; direccion: string | null; telefono: string | null; correo: string | null; logo: string | null; ajustes: AjustesDocumentos };
  empresa: { razon_social: string; rif: string; logo: string | null };
  impreso: { por: string; el: string };
};

export async function documentoBase(sesion: Sesion): Promise<Omit<DocumentoBase, "empresa">> {
  const supabase = await crearClienteServidor();
  const { data: org } = await supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, ajustes, logo").eq("id", sesion.orgId!).single();
  return {
    orgId: sesion.orgId!,
    org: { ...(org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    impreso: { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date()) },
  };
}
