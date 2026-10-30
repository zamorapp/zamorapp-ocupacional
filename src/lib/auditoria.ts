import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Movimiento = { id: string; en: string; tipo: "acceso" | "cambio"; que: string; quien: string; equipo: string | null };
export type Equipo = { id: string; nombre: string; serie: string; activo: boolean; registradoEn: string; ultimoContacto: string | null };

const TABLAS: Record<string, string> = {
  "public.trabajadores": "trabajador", "public.citas": "cita", "public.eventos": "accidente o incidente", "public.cobros": "nota de cobro",
  "public.empresas": "empresa", "public.miembros": "usuario y rol", "clinico.consultas": "consulta", "clinico.aptitudes": "aptitud",
  "clinico.reposos": "reposo", "clinico.diagnosticos": "diagnóstico",
};
const ACCION: Record<string, string> = { INSERT: "Creó", UPDATE: "Modificó", DELETE: "Borró" };
const corta = (iso: unknown) => (typeof iso === "string" ? iso.split("-").reverse().join("/") : "—");

// Últimos accesos a historias y cambios del día elegido. La RLS limita a administrador, gerente médico y auditor.
// No se muestran los valores antes/después (salvo la fecha de la evaluación): solo qué, quién, cuándo y desde qué equipo.
export async function movimientos(dia: string): Promise<Movimiento[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const desde = `${dia}T00:00:00-04:00`;
  const hasta = `${dia}T23:59:59.999-04:00`;
  const [{ data: accesos }, { data: cambios }, { data: equipos }] = await Promise.all([
    supabase.from("accesos").select("id, en, usuario_id, equipo_id, trabajadores(nombres, apellidos)").gte("en", desde).lte("en", hasta).order("en", { ascending: false }).limit(200),
    supabase.from("bitacora").select("id, en, usuario_id, equipo_id, tabla, accion, fecha_antes:antes->>fecha, fecha_despues:despues->>fecha").gte("en", desde).lte("en", hasta).order("en", { ascending: false }).limit(200),
    supabase.from("equipos").select("id, nombre"),
  ]);
  const ids = [...new Set([...(accesos ?? []), ...(cambios ?? [])].map((f) => f.usuario_id).filter(Boolean))] as string[];
  const { data: perfiles } = ids.length ? await supabase.from("perfiles").select("id, nombre_completo").in("id", ids) : { data: [] };
  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo as string]));
  const equipo = new Map((equipos ?? []).map((e) => [e.id, e.nombre as string]));
  const quien = (id: string | null) => (id ? nombre.get(id) ?? "Usuario" : "Sistema");

  return [
    ...(accesos ?? []).map((a) => {
      const t = a.trabajadores as unknown as { nombres: string; apellidos: string } | null;
      return { id: `a${a.id}`, en: a.en, tipo: "acceso" as const, que: `Abrió la historia de ${t ? `${t.nombres} ${t.apellidos}` : "un trabajador"}`, quien: quien(a.usuario_id), equipo: a.equipo_id ? equipo.get(a.equipo_id) ?? "PC" : null };
    }),
    ...(cambios ?? []).map((c) => ({
      id: `b${c.id}`, en: c.en, tipo: "cambio" as const,
      // La fecha de la evaluación sí se muestra (no es dato clínico): es lo que protege si se cuestiona un documento
      que: c.accion === "FECHA_EVALUACION"
        ? `Cambió la fecha de la evaluación de una consulta: del ${corta(c.fecha_antes)} al ${corta(c.fecha_despues)}`
        : `${ACCION[c.accion] ?? c.accion} ${TABLAS[c.tabla] ?? c.tabla.split(".").pop()}`,
      quien: quien(c.usuario_id), equipo: c.equipo_id ? equipo.get(c.equipo_id) ?? "PC" : null,
    })),
  ].sort((a, b) => b.en.localeCompare(a.en));
}

export async function listarEquipos(): Promise<Equipo[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("equipos").select("id, nombre, serie, activo, registrado_en, ultimo_contacto").order("serie");
  return (data ?? []).map((e) => ({ id: e.id, nombre: e.nombre, serie: e.serie, activo: e.activo, registradoEn: e.registrado_en, ultimoContacto: e.ultimo_contacto }));
}
