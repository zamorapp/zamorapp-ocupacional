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
  // Correos que pueden recibir lo clínico: el del paciente y el personal de salud registrado de su empresa (Analizar, 14-nov)
  correosAutorizados: string[];
};

const EMITEN = ["administrador", "gerente_medico", "medico"];
export const revisaBorradores = (s: Sesion) => !s.demo && Boolean(s.orgId) && s.clinico && EMITEN.includes(s.rol ?? "");

type Fila = {
  id: string; tipo: "recipe" | "examenes"; trabajador_id: string; tratamiento: Medicamento[] | null; examenes: string[] | null;
  indicaciones: string; adjuntar: "suelto" | "consulta"; consulta_id: string | null; envio: "imprimir" | "whatsapp" | "correo";
  correo: string | null; llave_nombre: string; creado_en: string; fecha: string | null; empresa_id: string | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string; correo: string | null } | null;
};

// Los que esperan al médico, del más reciente al más viejo. La misma regla que el contador del Inicio.
export async function borradoresPorRevisar(): Promise<BorradorAgente[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("agentes_borradores")
    .select("id, tipo, trabajador_id, tratamiento, examenes, indicaciones, adjuntar, consulta_id, envio, correo, llave_nombre, creado_en, fecha, empresa_id, trabajadores(nombres, apellidos, cedula, correo)")
    .eq("estado", "por_revisar").order("creado_en", { ascending: false }).limit(100);
  if (error || !data) return [];
  const filas = data as unknown as Fila[];
  const empresas = [...new Set(filas.filter((f) => f.envio === "correo" && f.empresa_id).map((f) => f.empresa_id as string))];
  const { data: contactos } = empresas.length
    ? await supabase.from("empresa_contactos").select("empresa_id, correo").in("empresa_id", empresas).eq("activo", true).eq("recibe_consulta", true)
    : { data: [] };
  const salud = new Map<string, string[]>();
  for (const c of (contactos ?? []) as { empresa_id: string; correo: string | null }[]) {
    if (c.correo) salud.set(c.empresa_id, [...(salud.get(c.empresa_id) ?? []), c.correo.trim().toLowerCase()]);
  }
  return filas.map((f) => ({
    id: f.id, tipo: f.tipo, trabajadorId: f.trabajador_id,
    paciente: f.trabajadores ? `${f.trabajadores.nombres} ${f.trabajadores.apellidos}` : "", cedula: f.trabajadores?.cedula ?? "",
    correoTrabajador: f.trabajadores?.correo ?? null,
    tratamiento: Array.isArray(f.tratamiento) ? f.tratamiento : [], examenes: Array.isArray(f.examenes) ? f.examenes : [],
    indicaciones: f.indicaciones, adjuntar: f.adjuntar, consultaId: f.consulta_id, envio: f.envio, correo: f.correo,
    agente: f.llave_nombre, creadoEn: f.creado_en, fecha: f.fecha,
    correosAutorizados: [...(f.trabajadores?.correo ? [f.trabajadores.correo.trim().toLowerCase()] : []), ...(f.empresa_id ? salud.get(f.empresa_id) ?? [] : [])],
  }));
}

// Contador del Inicio: cero si la base todavía no tiene la tabla (antes de aplicar la migración)
export async function contarBorradores(): Promise<number> {
  if (!supabaseConfigurado) return 0;
  const supabase = await crearClienteServidor();
  const { count, error } = await supabase.from("agentes_borradores").select("id", { count: "exact", head: true }).eq("estado", "por_revisar");
  return error ? 0 : count ?? 0;
}
