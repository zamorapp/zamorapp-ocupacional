import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Lista = { codigo: string; nombre: string; descripcion: string | null; total: number };

export type Item = {
  id: string;
  codigo: string | null;
  nombre: string;
  grupo: string | null;
  texto: string | null;
  orden: number;
  activo: boolean;
};

// Agrupa las listas en secciones para la pantalla de Configuración
export const SECCIONES_LISTAS: { titulo: string; codigos: string[] }[] = [
  { titulo: "Pacientes y empresas", codigos: ["tipo_paciente", "turno", "tipo_riesgo"] },
  { titulo: "Consulta", codigos: ["motivo_consulta", "antecedente_medico", "habito", "examen_funcional", "perfil_examen_funcional", "examen_fisico", "perfil_examen_fisico", "paraclinico", "grupo_paraclinicos", "sistema_organico", "especialidad"] },
  { titulo: "Aptitud y reposo", codigos: ["clasificacion_aptitud", "recomendacion_aptitud", "limitacion_ocupacional", "resultado_reubicacion", "causa_reposo", "ente_emisor_reposo"] },
  { titulo: "Recomendaciones", codigos: ["recomendacion_empresa", "recomendacion_paciente"] },
  { titulo: "Tratamiento", codigos: ["medicina", "presentacion_medicina", "via_administracion", "frecuencia_dosis", "duracion_tratamiento"] },
];

export async function listarListas(orgId: string | null): Promise<Lista[]> {
  if (!supabaseConfigurado || !orgId) return [];
  const supabase = await crearClienteServidor();
  const [{ data: listas }, { data: items }] = await Promise.all([
    supabase.from("listas").select("codigo, nombre, descripcion").order("nombre"),
    supabase.from("lista_items").select("lista").eq("org_id", orgId).eq("activo", true).limit(20000),
  ]);
  const cuenta = new Map<string, number>();
  for (const i of items ?? []) cuenta.set(i.lista, (cuenta.get(i.lista) ?? 0) + 1);
  return (listas ?? []).map((l) => ({ ...l, total: cuenta.get(l.codigo) ?? 0 }));
}

export async function itemsDeLista(orgId: string | null, lista: string, soloActivos = false): Promise<Item[]> {
  if (!supabaseConfigurado || !orgId) return [];
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("lista_items")
    .select("id, codigo, nombre, grupo, texto, orden, activo")
    .eq("org_id", orgId)
    .eq("lista", lista)
    .order("orden")
    .order("nombre");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q;
  return data ?? [];
}

// Varias listas a la vez, solo activas: para llenar formularios
export async function opciones(orgId: string | null, listas: string[]): Promise<Record<string, Item[]>> {
  const salida: Record<string, Item[]> = Object.fromEntries(listas.map((l) => [l, []]));
  if (!supabaseConfigurado || !orgId) return salida;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("lista_items")
    .select("id, lista, codigo, nombre, grupo, texto, orden, activo")
    .eq("org_id", orgId)
    .eq("activo", true)
    .in("lista", listas)
    .order("orden")
    .order("nombre");
  for (const i of data ?? []) salida[i.lista].push(i);
  return salida;
}
