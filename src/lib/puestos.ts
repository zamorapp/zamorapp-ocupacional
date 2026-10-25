import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { Puesto } from "@/lib/puestos-tipos";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Dependencia = { id: string; nombre: string; trabajadores: number; puestos: number };

export async function estructuraEmpresa(empresaId: string): Promise<{ dependencias: Dependencia[]; puestos: Puesto[] }> {
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(empresaId)) return { dependencias: [], puestos: [] };
  const supabase = await crearClienteServidor();
  const [{ data: deps }, { data: pts }, { data: trab }] = await Promise.all([
    supabase.from("dependencias").select("id, nombre").eq("empresa_id", empresaId).eq("activa", true).order("nombre"),
    supabase
      .from("puestos")
      .select("id, codigo, nombre, descripcion, tareas, herramientas, turno, riesgos, evaluacion, dependencia_id, dependencias(nombre)")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("nombre"),
    supabase.from("trabajadores").select("puesto_id, dependencia_id").eq("empresa_id", empresaId).in("estado", ["activo", "reposo", "aspirante"]).limit(20000),
  ]);
  const porPuesto = new Map<string, number>();
  const porDep = new Map<string, number>();
  for (const t of trab ?? []) {
    if (t.puesto_id) porPuesto.set(t.puesto_id, (porPuesto.get(t.puesto_id) ?? 0) + 1);
    if (t.dependencia_id) porDep.set(t.dependencia_id, (porDep.get(t.dependencia_id) ?? 0) + 1);
  }
  const puestos: Puesto[] = (pts ?? []).map((p) => ({
    id: p.id,
    codigo: p.codigo ?? "",
    nombre: p.nombre,
    dependenciaId: p.dependencia_id,
    dependencia: (p.dependencias as unknown as { nombre: string } | null)?.nombre ?? null,
    descripcion: p.descripcion ?? "",
    tareas: p.tareas ?? "",
    herramientas: p.herramientas ?? "",
    turno: p.turno ?? "",
    riesgos: (p.riesgos ?? {}) as Puesto["riesgos"],
    evaluacion: (p.evaluacion ?? {}) as Puesto["evaluacion"],
    trabajadores: porPuesto.get(p.id) ?? 0,
  }));
  const dependencias = (deps ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre,
    trabajadores: porDep.get(d.id) ?? 0,
    puestos: puestos.filter((p) => p.dependenciaId === d.id).length,
  }));
  return { dependencias, puestos };
}
