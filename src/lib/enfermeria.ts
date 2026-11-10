import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { AjustesEnfermeria } from "@/lib/enfermeria-tipos";
import { datosOrganizacion } from "@/lib/organizacion";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type AtencionEnfermeria = {
  id: string;
  fecha: string;
  tipo: string;
  motivo: string | null;
  cie10: string | null;
  signos: Record<string, string>;
  tratamiento: string | null;
  nota: string | null;
  referido: boolean;
  trabajador: { id: string; nombre: string; cedula: string } | null;
  empresa: string;
  registradoPor: string | null;
  mia: boolean;
  consultaId: string | null;
};

export type IndicadoresEnfermeria = {
  atenciones: number;
  pacientes: number;
  dias_enfermeria: number;
  dias_medico: number;
  referidos: number;
  inspecciones: number;
  por_tipo: { nombre: string; n: number }[];
  causas: { nombre: string; n: number }[];
};

export type OrdenEnfermeria = { id: string; fecha: string; paciente: string; cedula: string; texto: string; indicadoPor: string | null };

export async function ajustesEnfermeria(): Promise<AjustesEnfermeria> {
  const { ajustes } = await datosOrganizacion();
  const a = ajustes as AjustesEnfermeria;
  return { enfermeria_unida: a.enfermeria_unida === true, enfermeria_vigilancia: a.enfermeria_vigilancia === true };
}

type Filtro = { empresaId?: string | null; desde?: string; hasta?: string; trabajadorId?: string; consultaId?: string };

// Atenciones de un día (o de un rango corto), de una empresa o de todas las que el usuario ve
export async function listarAtenciones(empresaId: string | null, desde: string, hasta = desde): Promise<AtencionEnfermeria[]> {
  return buscarAtenciones({ empresaId, desde, hasta });
}

// Lo de enfermería de un trabajador (su historia) o lo anotado en una consulta del médico
export async function atencionesDeTrabajador(trabajadorId: string) {
  return buscarAtenciones({ trabajadorId });
}
export async function notasDeConsulta(consultaId: string) {
  return buscarAtenciones({ consultaId });
}

async function buscarAtenciones(f: Filtro): Promise<AtencionEnfermeria[]> {
  const sesion = await obtenerSesion();
  if (!supabaseConfigurado || sesion.demo || !sesion.clinico) return [];
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("atenciones_enfermeria")
    .select("id, fecha, tipo, motivo, cie10, signos, tratamiento, nota, referido_medico, registrado_por, creado_en, consulta_id, trabajadores(id, nombres, apellidos, cedula), empresas(razon_social)")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(300);
  if (f.desde) q = q.gte("fecha", f.desde);
  if (f.hasta) q = q.lte("fecha", f.hasta);
  if (f.empresaId) q = q.eq("empresa_id", f.empresaId);
  if (f.trabajadorId) q = q.eq("trabajador_id", f.trabajadorId);
  if (f.consultaId) q = q.eq("consulta_id", f.consultaId);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer las atenciones de enfermería: ${error.message}`);
  const ids = [...new Set((data ?? []).map((a) => a.registrado_por).filter(Boolean))] as string[];
  const { data: perfiles } = ids.length ? await supabase.from("perfiles").select("id, nombre_completo").in("id", ids) : { data: [] };
  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo]));
  return (data ?? []).map((a) => {
    const t = a.trabajadores as unknown as { id: string; nombres: string; apellidos: string; cedula: string } | null;
    const e = a.empresas as unknown as { razon_social: string } | null;
    return {
      id: a.id,
      fecha: a.fecha,
      tipo: a.tipo,
      motivo: a.motivo,
      cie10: a.cie10,
      signos: (a.signos ?? {}) as Record<string, string>,
      tratamiento: a.tratamiento,
      nota: a.nota,
      referido: a.referido_medico,
      trabajador: t ? { id: t.id, nombre: `${t.nombres} ${t.apellidos}`, cedula: t.cedula } : null,
      empresa: e?.razon_social ?? "",
      registradoPor: a.registrado_por ? nombre.get(a.registrado_por) || null : null,
      mia: a.registrado_por === sesion.usuarioId,
      consultaId: a.consulta_id,
    };
  });
}

export async function indicadoresEnfermeria(empresaId: string | null, desde: string, hasta: string): Promise<IndicadoresEnfermeria | null> {
  const sesion = await obtenerSesion();
  if (!supabaseConfigurado || sesion.demo || !sesion.clinico) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reporte_enfermeria", { p_tipo: "indicadores", p_empresa: empresaId, p_desde: desde, p_hasta: hasta, p_opciones: {} });
  if (error) return null;
  return data as IndicadoresEnfermeria;
}

// Órdenes del médico a enfermería sin cumplir (las crea «Indicación o récipe»). Si esa función todavía no está
// publicada en esta base, la lista sale vacía sin error.
export async function ordenesPendientes(empresaId: string | null): Promise<OrdenEnfermeria[]> {
  const sesion = await obtenerSesion();
  if (!supabaseConfigurado || sesion.demo || !sesion.clinico) return [];
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("indicaciones")
    .select("id, fecha, indicaciones, indicado_por, tratamiento, trabajadores(nombres, apellidos, cedula)")
    .eq("tipo", "enfermeria")
    .eq("estado", "pendiente")
    .order("fecha", { ascending: true })
    .limit(50);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((o) => {
    const t = o.trabajadores as unknown as { nombres: string; apellidos: string; cedula: string } | null;
    const meds = Array.isArray(o.tratamiento)
      ? (o.tratamiento as { medicina?: string; nombre?: string; dosis?: string; via?: string }[]).map((m) => [m.medicina ?? m.nombre, m.dosis, m.via].filter(Boolean).join(" ")).filter(Boolean)
      : [];
    return {
      id: o.id,
      fecha: o.fecha,
      paciente: t ? `${t.nombres} ${t.apellidos}` : "",
      cedula: t?.cedula ?? "",
      texto: [meds.join("; "), o.indicaciones].filter(Boolean).join(" · "),
      indicadoPor: o.indicado_por,
    };
  });
}
