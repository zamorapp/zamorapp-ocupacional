import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";

import type { PermisoPortal } from "@/lib/permisos-portal";
import { type Rol } from "@/lib/sesion-roles";
import { esVistaMenu, type VistaMenu } from "@/lib/vista-menu";

export { ETIQUETA_ROL, type Rol } from "@/lib/sesion-roles";

export type Sesion = {
  demo: boolean;
  usuarioId: string;
  nombre: string;
  correo: string;
  orgId: string | null;
  organizacion: string;
  // Médico titular del servicio (Configuración › Organización › «Médico titular»): sale bajo la marca en la barra
  titular: string | null;
  rol: Rol | null;
  clinico: boolean; // mismo criterio que es_clinico() en la base: rol de salud o acceso clínico activado
  permisos: PermisoPortal[] | null; // portal de empresa: qué puede hacer (null = todo); ver lib/permisos-portal
  // Vista del menú guardada en la cuenta (user_metadata.vista_menu, lib/vista-menu.ts); null = nunca se eligió
  vistaMenu: VistaMenu | null;
};

const SESION_DEMO: Sesion = {
  demo: true,
  usuarioId: "demo",
  nombre: "Usuario demo",
  correo: "",
  orgId: null,
  organizacion: "OcupaVida Salud Ocupacional",
  titular: "Dr. César Zamora",
  rol: "gerente_medico",
  clinico: true,
  permisos: null,
  vistaMenu: null,
};

// Perfil, organización y rol cambian muy poco: se guardan en memoria del servidor 2 minutos
// para no consultar Supabase en cada pantalla. Se invalidan al editar perfil, rol u organización.
type Datos = Omit<Sesion, "demo" | "usuarioId" | "correo" | "vistaMenu">;
const MEMORIA = new Map<string, { datos: Datos; vence: number }>();
const DURACION = 2 * 60 * 1000;
// Generación: una lectura que empezó antes de invalidar no vuelve a guardar datos viejos (ver empresas.ts)
let generacion = 0;

export function invalidarSesion(usuarioId?: string) {
  generacion += 1;
  if (usuarioId) MEMORIA.delete(usuarioId);
  else MEMORIA.clear();
}

// Usuario, organización y rol de quien navega. Se calcula una vez por petición.
export const obtenerSesion = cache(async (): Promise<Sesion> => {
  if (!supabaseConfigurado) return SESION_DEMO;
  const supabase = await crearClienteServidor();
  // getClaims verifica el token localmente con la clave pública del proyecto (sin ir al servidor)
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const usuarioId = claims.sub;
  const correo = (claims.email as string | undefined) ?? "";
  const vista = (claims.user_metadata as { vista_menu?: unknown } | undefined)?.vista_menu;
  const vistaMenu = esVistaMenu(vista) ? vista : null;

  const guardado = MEMORIA.get(usuarioId);
  if (guardado && guardado.vence > performance.now()) return { demo: false, usuarioId, correo, vistaMenu, ...guardado.datos };

  const desde = generacion;
  const [{ data: perfil }, { data: miembro }] = await Promise.all([
    supabase.from("perfiles").select("nombre_completo").eq("id", usuarioId).maybeSingle(),
    supabase
      .from("miembros")
      .select("org_id, rol, acceso_clinico, permisos_portal, organizaciones(nombre, ajustes)")
      .eq("usuario_id", usuarioId)
      .eq("activo", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const org = miembro?.organizaciones as unknown as { nombre: string; ajustes: { membrete_titular?: string | null } | null } | null;
  const datos: Datos = {
    nombre: perfil?.nombre_completo || correo,
    orgId: miembro?.org_id ?? null,
    organizacion: org?.nombre ?? "Sin organización",
    titular: org?.ajustes?.membrete_titular?.trim() || null,
    rol: (miembro?.rol as Rol) ?? null,
    clinico: Boolean(miembro && (["gerente_medico", "medico", "enfermeria"].includes(miembro.rol) || miembro.acceso_clinico)),
    permisos: (miembro?.permisos_portal as PermisoPortal[] | null) ?? null,
  };
  if (desde === generacion) MEMORIA.set(usuarioId, { datos, vence: performance.now() + DURACION });
  return { demo: false, usuarioId, correo, vistaMenu, ...datos };
});

export function primerNombre(nombre: string) {
  return nombre.split(/\s+/)[0] ?? nombre;
}
