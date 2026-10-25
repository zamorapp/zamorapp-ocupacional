import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Rol =
  | "administrador"
  | "gerente_medico"
  | "medico"
  | "enfermeria"
  | "recepcion"
  | "coordinador_sst"
  | "gerente_empresa"
  | "supervisor"
  | "delegado_prevencion"
  | "trabajador"
  | "auditor";

export const ETIQUETA_ROL: Record<Rol, string> = {
  administrador: "Administrador",
  gerente_medico: "Gerente médico",
  medico: "Médico",
  enfermeria: "Enfermería",
  recepcion: "Recepción",
  coordinador_sst: "Coordinador SST",
  gerente_empresa: "Gerente de empresa",
  supervisor: "Supervisor",
  delegado_prevencion: "Delegado de prevención",
  trabajador: "Trabajador",
  auditor: "Auditor",
};

export type Sesion = {
  demo: boolean;
  usuarioId: string;
  nombre: string;
  correo: string;
  orgId: string | null;
  organizacion: string;
  rol: Rol | null;
};

const SESION_DEMO: Sesion = {
  demo: true,
  usuarioId: "demo",
  nombre: "Usuario demo",
  correo: "",
  orgId: null,
  organizacion: "TIPURO SERVI MEDIC",
  rol: "gerente_medico",
};

// Usuario, organización y rol de quien navega. Se calcula una vez por petición.
export const obtenerSesion = cache(async (): Promise<Sesion> => {
  if (!supabaseConfigurado) return SESION_DEMO;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const [{ data: perfil }, { data: miembro }] = await Promise.all([
    supabase.from("perfiles").select("nombre_completo").eq("id", data.user.id).maybeSingle(),
    supabase
      .from("miembros")
      .select("org_id, rol, organizaciones(nombre)")
      .eq("usuario_id", data.user.id)
      .eq("activo", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const org = miembro?.organizaciones as unknown as { nombre: string } | null;
  return {
    demo: false,
    usuarioId: data.user.id,
    nombre: perfil?.nombre_completo || data.user.email || "",
    correo: data.user.email ?? "",
    orgId: miembro?.org_id ?? null,
    organizacion: org?.nombre ?? "Sin organización",
    rol: (miembro?.rol as Rol) ?? null,
  };
});

export function primerNombre(nombre: string) {
  return nombre.split(/\s+/)[0] ?? nombre;
}
