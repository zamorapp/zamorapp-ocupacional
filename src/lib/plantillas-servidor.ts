import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { leerDatosPlantilla, type Plantilla } from "@/lib/plantillas";
import { crearClienteServidor } from "@/lib/supabase/server";

// Plantillas de examen de la organización (activas o todas, para Configuración)
export async function plantillasDeOrg(orgId: string | null, soloActivas = true): Promise<Plantilla[]> {
  if (!supabaseConfigurado || !orgId) return [];
  const supabase = await crearClienteServidor();
  let q = supabase.from("lista_items").select("id, codigo, nombre, activo, datos").eq("org_id", orgId).eq("lista", "plantilla_examen").order("orden");
  if (soloActivas) q = q.eq("activo", true);
  const { data } = await q;
  return (data ?? []).filter((i) => i.codigo).map((i) => ({ id: i.id, motivo: i.codigo!, nombre: i.nombre, activo: i.activo, datos: leerDatosPlantilla(i.datos) }));
}
