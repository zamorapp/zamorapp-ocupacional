"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion, type Rol } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { leerDatosPlantilla, type DatosPlantilla } from "@/lib/plantillas";

export type Resultado = { ok: boolean; mensaje: string };

const ROLES: Rol[] = ["administrador", "gerente_medico"];

// Guarda la plantilla de un motivo (una por motivo y organización): la crea si aún no existe
export async function guardarPlantilla(motivo: string, datos: DatosPlantilla, activo: boolean): Promise<Resultado> {
  try {
    const sesion = await obtenerSesion();
    if (sesion.demo) return { ok: false, mensaje: "En modo demo no se guardan datos." };
    if (!sesion.orgId) return { ok: false, mensaje: "Tu usuario no tiene organización asignada." };
    if (!sesion.rol || !ROLES.includes(sesion.rol)) return { ok: false, mensaje: "Solo el administrador o el gerente médico editan las plantillas." };
    const supabase = await crearClienteServidor();

    const { data: m } = await supabase.from("lista_items").select("nombre, orden")
      .eq("org_id", sesion.orgId).eq("lista", "motivo_consulta").eq("codigo", motivo).maybeSingle();
    if (!m) return { ok: false, mensaje: "Ese motivo de consulta no existe en tu organización." };

    // Se normaliza en el servidor: lo que llegue del navegador no se guarda tal cual
    const limpio = leerDatosPlantilla(datos);
    const { data: actual } = await supabase.from("lista_items").select("id")
      .eq("org_id", sesion.orgId).eq("lista", "plantilla_examen").eq("codigo", motivo).maybeSingle();
    const { error } = actual
      ? await supabase.from("lista_items").update({ datos: limpio, activo, nombre: m.nombre }).eq("id", actual.id).eq("org_id", sesion.orgId)
      : await supabase.from("lista_items").insert({ org_id: sesion.orgId, lista: "plantilla_examen", codigo: motivo, nombre: m.nombre, orden: m.orden, datos: limpio, activo });
    if (error) throw error;
    revalidatePath("/configuracion/plantillas");
    revalidatePath("/configuracion/clinica");
    revalidatePath("/atencion", "layout");
    return { ok: true, mensaje: "Plantilla guardada." };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}
