import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Sesion } from "@/lib/sesion";
import type { Medicamento } from "@/lib/consultas-tipos";

// Borradores que dejó un agente por la puerta (récipe u orden de exámenes, migración 20261030950000).
// Los lee solo el médico (RLS: administrador con acceso clínico, gerente médico y médico).

export type BorradorAgente = {
  id: string; tipo: "recipe" | "examenes"; trabajadorId: string; paciente: string; cedula: string; correoTrabajador: string | null;
  tratamiento: Medicamento[]; examenes: string[]; indicaciones: string; adjuntar: "suelto" | "consulta"; consultaId: string | null;
  envio: "imprimir" | "whatsapp" | "correo"; correo: string | null; agente: string; creadoEn: string; fecha: string | null;
};

const EMITEN = ["administrador", "gerente_medico", "medico"];
export const revisaBorradores = (s: Sesion) => !s.demo && Boolean(s.orgId) && s.clinico && EMITEN.includes(s.rol ?? "");

type Fila = {
  id: string; tipo: "recipe" | "examenes"; trabajador_id: string; tratamiento: Medicamento[] | null; examenes: string[] | null;
  indicaciones: string; adjuntar: "suelto" | "consulta"; consulta_id: string | null; envio: "imprimir" | "whatsapp" | "correo";
  correo: string | null; llave_nombre: string; creado_en: string; fecha: string | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string; correo: string | null } | null;
};

// Los que esperan al médico, del más reciente al más viejo. La misma regla que el contador del Inicio.
export async function borradoresPorRevisar(): Promise<BorradorAgente[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("agentes_borradores")
    .select("id, tipo, trabajador_id, tratamiento, examenes, indicaciones, adjuntar, consulta_id, envio, correo, llave_nombre, creado_en, fecha, trabajadores(nombres, apellidos, cedula, correo)")
    .eq("estado", "por_revisar").order("creado_en", { ascending: false }).limit(100);
  if (error || !data) return [];
  return (data as unknown as Fila[]).map((f) => ({
    id: f.id, tipo: f.tipo, trabajadorId: f.trabajador_id,
    paciente: f.trabajadores ? `${f.trabajadores.nombres} ${f.trabajadores.apellidos}` : "", cedula: f.trabajadores?.cedula ?? "",
    correoTrabajador: f.trabajadores?.correo ?? null,
    tratamiento: Array.isArray(f.tratamiento) ? f.tratamiento : [], examenes: Array.isArray(f.examenes) ? f.examenes : [],
    indicaciones: f.indicaciones, adjuntar: f.adjuntar, consultaId: f.consulta_id, envio: f.envio, correo: f.correo,
    agente: f.llave_nombre, creadoEn: f.creado_en, fecha: f.fecha,
  }));
}

// Contador del Inicio: cero si la base todavía no tiene la tabla (antes de aplicar la migración)
export async function contarBorradores(): Promise<number> {
  if (!supabaseConfigurado) return 0;
  const supabase = await crearClienteServidor();
  const { count, error } = await supabase.from("agentes_borradores").select("id", { count: "exact", head: true }).eq("estado", "por_revisar");
  return error ? 0 : count ?? 0;
}
