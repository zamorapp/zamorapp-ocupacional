import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";

import { type Rol } from "@/lib/sesion-roles";

export { ETIQUETA_ROL, type Rol } from "@/lib/sesion-roles";

export type Sesion = {
  demo: boolean;
  usuarioId: string;
  nombre: string;
  correo: string;
  orgId: string | null;
  organizacion: string;
  rol: Rol | null;
  clinico: boolean; // mismo criterio que es_clinico() en la base: rol de salud o acceso clínico activado
};

const SESION_DEMO: Sesion = {
  demo: true,
  usuarioId: "demo",
  nombre: "Usuario demo",
  correo: "",
  orgId: null,
  organizacion: "TIPURO SERVI MEDIC",
  rol: "gerente_medico",
  clinico: true,
};

// Perfil, organización y rol cambian muy poco: se guardan en memoria del servidor 2 minutos
// para no consultar Supabase en cada pantalla. Se invalidan al editar perfil, rol u organización.
type Datos = Omit<Sesion, "demo" | "usuarioId" | "correo">;
const MEMORIA = new Map<string, { datos: Datos; vence: number }>();
const DURACION = 2 * 60 * 1000;

export function invalidarSesion(usuarioId?: string) {
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

  const guardado = MEMORIA.get(usuarioId);
  if (guardado && guardado.vence > Date.now()) return { demo: false, usuarioId, correo, ...guardado.datos };

  const [{ data: perfil }, { data: miembro }] = await Promise.all([
    supabase.from("perfiles").select("nombre_completo").eq("id", usuarioId).maybeSingle(),
    supabase
      .from("miembros")
      .select("org_id, rol, acceso_clinico, organizaciones(nombre)")
      .eq("usuario_id", usuarioId)
      .eq("activo", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const org = miembro?.organizaciones as unknown as { nombre: string } | null;
  const datos: Datos = {
    nombre: perfil?.nombre_completo || correo,
    orgId: miembro?.org_id ?? null,
    organizacion: org?.nombre ?? "Sin organización",
    rol: (miembro?.rol as Rol) ?? null,
    clinico: Boolean(miembro && (["gerente_medico", "medico", "enfermeria"].includes(miembro.rol) || miembro.acceso_clinico)),
  };
  MEMORIA.set(usuarioId, { datos, vence: Date.now() + DURACION });
  return { demo: false, usuarioId, correo, ...datos };
});

export function primerNombre(nombre: string) {
  return nombre.split(/\s+/)[0] ?? nombre;
}
