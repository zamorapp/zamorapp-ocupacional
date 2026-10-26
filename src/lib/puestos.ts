import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { Puesto } from "@/lib/puestos-tipos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { todas } from "@/lib/paginar";

export type Dependencia = { id: string; nombre: string; trabajadores: number; puestos: number };

export async function estructuraEmpresa(empresaId: string): Promise<{ dependencias: Dependencia[]; puestos: Puesto[] }> {
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(empresaId)) return { dependencias: [], puestos: [] };
  const supabase = await crearClienteServidor();
  const [{ data: deps }, { data: pts }, trab] = await Promise.all([
    supabase.from("dependencias").select("id, nombre").eq("empresa_id", empresaId).eq("activa", true).order("nombre"),
    supabase
      .from("puestos")
      .select("id, codigo, nombre, descripcion, tareas, herramientas, turno, riesgos, evaluacion, dependencia_id, dependencias(nombre)")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("nombre"),
    todas<{ puesto_id: string | null; dependencia_id: string | null }>((d, h) =>
      supabase.from("trabajadores").select("puesto_id, dependencia_id", { count: "exact" }).eq("empresa_id", empresaId).in("estado", ["activo", "reposo", "aspirante"]).order("id").range(d, h)),
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

export type MesHorasDatos = { mes: string; horas: number | null; trabajadores: number | null; metodo: "nomina" | "estimado" };

// Últimos 12 meses (incluye el actual) con las horas cargadas o vacías
export async function horasEmpresa(empresaId: string): Promise<MesHorasDatos[]> {
  const hoy = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1)).toISOString().slice(0, 10));
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(empresaId)) return meses.map((mes) => ({ mes, horas: null, trabajadores: null, metodo: "estimado" }));
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("horas_trabajadas").select("mes, horas, trabajadores, metodo").eq("empresa_id", empresaId).gte("mes", meses[11]);
  const porMes = new Map((data ?? []).map((h) => [h.mes as string, h]));
  return meses.map((mes) => {
    const h = porMes.get(mes);
    return { mes, horas: h ? Number(h.horas) : null, trabajadores: h?.trabajadores ?? null, metodo: (h?.metodo as MesHorasDatos["metodo"]) ?? "estimado" };
  });
}
