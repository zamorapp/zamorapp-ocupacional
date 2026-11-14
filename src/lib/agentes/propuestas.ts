import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { Sesion } from "@/lib/sesion";
import { ROLES_PROPUESTAS } from "@/lib/agentes/roles";
import { crearClienteServidor } from "@/lib/supabase/server";

// Bandeja de propuestas de agentes (public.agentes_propuestas, 20261030960000): lo que un agente PROPONE y el
// médico aprueba o descarta. Aprobar = public.aplicar_propuesta con la sesión de quien aprueba.

export type Propuesta = {
  id: string;
  tipo: string;
  titulo: string;
  empresa_id: string | null;
  empresa: string | null;
  llave_nombre: string;
  antes: Record<string, unknown> | null;
  propuesto: Record<string, unknown>;
  motivo: string | null;
  estado: "pendiente" | "aprobada" | "descartada";
  creado_en: string;
  resuelto_en: string | null;
  // Solo en el borrador de informe: lo que el médico ya tiene escrito para ese período
  actual?: { secciones: Record<string, string>; analisis: Record<string, string> };
};

// Secciones del informe que un agente puede proponer (la «Visión del médico» es solo tuya)
export const SECCIONES_PROPUESTA: [string, string][] = [
  ["resumen", "Resumen ejecutivo"],
  ["conclusiones", "Análisis y conclusiones médico-ocupacionales"],
  ["recomendaciones_medicas", "Recomendaciones médico-ocupacionales"],
  ["recomendaciones", "Recomendaciones de seguridad y salud en el trabajo"],
  ["factores_riesgo", "Factores de riesgo, procesos peligrosos y efectos en la salud"],
  ["medidas_control", "Medidas de control en la fuente, el ambiente y los trabajadores"],
];

// Mismo criterio que la regla RLS: administrador, gerente médico y médico. Enfermería no (solo edita lo suyo)
export const revisaPropuestas = (s: Sesion) => !s.demo && Boolean(s.orgId) && ROLES_PROPUESTAS.includes(s.rol ?? "");

export async function contarPropuestas(empresaId?: string | null): Promise<number> {
  if (!supabaseConfigurado) return 0;
  const supabase = await crearClienteServidor();
  let q = supabase.from("agentes_propuestas" as never).select("id", { count: "exact", head: true }).eq("estado", "pendiente");
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { count, error } = await q;
  return error ? 0 : count ?? 0;
}

export async function propuestas(): Promise<{ pendientes: Propuesta[]; resueltas: Propuesta[] }> {
  if (!supabaseConfigurado) return { pendientes: [], resueltas: [] };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("agentes_propuestas" as never)
    .select("id, tipo, titulo, empresa_id, llave_nombre, antes, propuesto, motivo, estado, creado_en, resuelto_en, empresas(razon_social, nombre_comercial)")
    .order("creado_en", { ascending: false }).limit(80);
  if (error || !data) return { pendientes: [], resueltas: [] };
  type Fila = Omit<Propuesta, "empresa" | "actual"> & { empresas: { razon_social: string; nombre_comercial: string | null } | null };
  const lista: Propuesta[] = (data as unknown as Fila[]).map(({ empresas, ...p }) => ({ ...p, empresa: empresas ? empresas.nombre_comercial || empresas.razon_social : null }));
  const pendientes = lista.filter((p) => p.estado === "pendiente");
  // Borradores de informe: se trae lo ya escrito en ese período para compararlo sección por sección
  for (const p of pendientes.filter((x) => x.tipo === "informe_vigilancia" && x.empresa_id)) {
    const { data: i } = await supabase.from("informes_vigilancia")
      .select("resumen, conclusiones, recomendaciones_medicas, recomendaciones, factores_riesgo, medidas_control, analisis")
      .eq("empresa_id", p.empresa_id!).eq("desde", String(p.propuesto.desde)).eq("hasta", String(p.propuesto.hasta)).maybeSingle();
    const fila = (i ?? {}) as Record<string, unknown>;
    p.actual = {
      secciones: Object.fromEntries(SECCIONES_PROPUESTA.map(([k]) => [k, typeof fila[k] === "string" ? (fila[k] as string) : ""])),
      analisis: (fila.analisis ?? {}) as Record<string, string>,
    };
  }
  return { pendientes, resueltas: lista.filter((p) => p.estado !== "pendiente").slice(0, 15) };
}
