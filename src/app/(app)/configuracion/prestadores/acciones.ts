"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function guardarPrestador(datos: FormData): Promise<string | null> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !sesion.clinico || !["administrador", "gerente_medico"].includes(sesion.rol ?? "")) {
    return "Tu cuenta no puede editar el directorio.";
  }
  const id = String(datos.get("id") ?? "");
  const nombre = String(datos.get("nombre") ?? "").trim();
  const correo = String(datos.get("correo") ?? "").trim().toLowerCase();
  const activo = datos.get("activo") === "on";
  if (!nombre || nombre.length > 120 || correo.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(correo)) {
    return "Indica el nombre y un solo correo del prestador.";
  }

  const supabase = await crearClienteServidor();
  const fila = { nombre, correo, activo };
  const tabla = supabase.from("prestadores_examenes");
  const guarda = id ? tabla.update(fila).eq("id", id).eq("org_id", sesion.orgId) : tabla.insert({ org_id: sesion.orgId, ...fila });
  const { data, error } = await guarda.select("id").maybeSingle();
  if (error?.code === "23505") return "Ese correo ya está registrado en el directorio.";
  if (!data || error) return "No se pudo guardar el prestador. Verifica el correo, tus permisos y la conexión.";
  revalidatePath("/configuracion/prestadores");
  return null;
}
