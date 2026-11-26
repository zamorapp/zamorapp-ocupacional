"use server";

import { redirect } from "next/navigation";
import { TOKEN_DEPURACION, type EstadoNominaPortal } from "@/lib/depurar-nomina";
import { puedePortal } from "@/lib/permisos-portal";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function crearEnlaceNomina(empresa: string): Promise<string> {
  const sesion = await obtenerSesion();
  if (sesion.rol !== "gerente_empresa" || !sesion.orgId || sesion.demo || !puedePortal(sesion, "nomina")) {
    return "Tu cuenta no puede crear este enlace.";
  }
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("nomina_portal", { p_org: sesion.orgId, p_empresa: empresa, p_crear: true });
  if (error) return error.code === "42501"
    ? "Tu cuenta no tiene permiso para actualizar esa empresa."
    : "No se pudo crear el enlace. Revisa tu conexión y vuelve a intentarlo.";
  const estado = data as EstadoNominaPortal | null;
  if (estado?.estado === "borrador" && TOKEN_DEPURACION.test(estado.token)) redirect(`/portal/nomina/${estado.token}`);
  if (estado?.estado === "enviada" || estado?.estado === "enlace_servicio") redirect(`/portal/nomina?empresa=${encodeURIComponent(empresa)}`);
  return "No se pudo crear el enlace. Vuelve a intentarlo.";
}
