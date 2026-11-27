import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Sesion } from "@/lib/sesion";
import type { Medicamento } from "@/lib/consultas-tipos";
import { ETIQUETA_APTITUD, type Aptitud } from "@/lib/pacientes";

// Los borradores los revisa el personal médico autorizado. Una constancia queda reservada al titular de su llave.

export type BorradorAgente = {
  id: string; tipo: "recipe" | "examenes" | "constancia"; trabajadorId: string; paciente: string; cedula: string; correoTrabajador: string | null;
  tratamiento: Medicamento[]; examenes: string[]; indicaciones: string; adjuntar: "suelto" | "consulta"; consultaId: string | null;
  envio: "imprimir" | "whatsapp" | "correo"; correo: string | null; agente: string; preparadoEl: string; fecha: string | null;
  // Correos que pueden recibir lo clínico: el del paciente y el personal de salud registrado de su empresa (Analizar, 14-nov)
  correosAutorizados: string[];
  constancia: { fecha: string; empresa: string; aptitud: string } | null;
};

const EMITEN = ["administrador", "gerente_medico", "medico"];
export const revisaBorradores = (s: Sesion) => !s.demo && Boolean(s.orgId) && s.clinico && EMITEN.includes(s.rol ?? "");
const fechaHora = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" });

type Fila = {
  id: string; tipo: BorradorAgente["tipo"]; trabajador_id: string; tratamiento: Medicamento[] | null; examenes: string[] | null;
  indicaciones: string; adjuntar: "suelto" | "consulta"; consulta_id: string | null; envio: "imprimir" | "whatsapp" | "correo";
  correo: string | null; llave_nombre: string; creado_en: string; fecha: string | null; empresa_id: string | null;
  consulta_revision?: number;
  trabajadores: { nombres: string; apellidos: string; cedula: string; correo: string | null } | null;
};

type FuenteConstancia = {
  id: string; fecha: string; revision: number; trabajador_id: string; empresa_id: string | null;
  empresas: { razon_social: string } | null;
  aptitudes: { clasificacion: Aptitud }[] | { clasificacion: Aptitud } | null;
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
  const constancias = filas.filter((f) => f.tipo === "constancia");
  // La selección inicial se conserva para seguir mostrando los otros borradores durante la actualización local.
  if (constancias.length) {
    const { data: revisiones } = await supabase.from("agentes_borradores").select("id, consulta_revision")
      .in("id", constancias.map((f) => f.id));
    const porId = new Map((revisiones ?? []).map((r) => [r.id, r.consulta_revision]));
    for (const f of constancias) f.consulta_revision = porId.get(f.id);
  }
  const consultas = [...new Set(constancias.flatMap((f) => f.consulta_id ? [f.consulta_id] : []))];
  const { data: fuentes } = consultas.length ? await supabase.from("consultas")
    .select("id, fecha, revision, trabajador_id, empresa_id, empresas(razon_social), aptitudes(clasificacion)")
    .eq("estado", "firmada").in("id", consultas) : { data: [] };
  const porConsulta = new Map(((fuentes ?? []) as unknown as FuenteConstancia[]).map((c) => [c.id, c]));
  const empresas = [...new Set(filas.filter((f) => f.envio === "correo" && f.empresa_id).map((f) => f.empresa_id as string))];
  const { data: contactos } = empresas.length
    ? await supabase.from("empresa_contactos").select("empresa_id, correo").in("empresa_id", empresas).eq("activo", true).eq("recibe_consulta", true)
    : { data: [] };
  const salud = new Map<string, string[]>();
  for (const c of (contactos ?? []) as { empresa_id: string; correo: string | null }[]) {
    if (c.correo) salud.set(c.empresa_id, [...(salud.get(c.empresa_id) ?? []), c.correo.trim().toLowerCase()]);
  }
  return filas.map((f) => {
    const c = f.consulta_id ? porConsulta.get(f.consulta_id) : undefined;
    const aptitud = Array.isArray(c?.aptitudes) ? c.aptitudes[0] : c?.aptitudes;
    const constancia = c && aptitud && c.revision === f.consulta_revision && c.trabajador_id === f.trabajador_id && c.empresa_id === f.empresa_id
      ? { fecha: c.fecha, empresa: c.empresas?.razon_social ?? "Sin empresa", aptitud: ETIQUETA_APTITUD[aptitud.clasificacion] ?? aptitud.clasificacion }
      : null;
    return {
      id: f.id, tipo: f.tipo, trabajadorId: f.trabajador_id,
      paciente: f.trabajadores ? `${f.trabajadores.nombres} ${f.trabajadores.apellidos}` : "", cedula: f.trabajadores?.cedula ?? "",
      correoTrabajador: f.trabajadores?.correo ?? null,
      tratamiento: Array.isArray(f.tratamiento) ? f.tratamiento : [], examenes: Array.isArray(f.examenes) ? f.examenes : [],
      indicaciones: f.indicaciones, adjuntar: f.adjuntar, consultaId: f.consulta_id, envio: f.envio, correo: f.correo,
      agente: f.llave_nombre, preparadoEl: fechaHora.format(new Date(f.creado_en)), fecha: f.fecha,
      constancia,
      correosAutorizados: [...(f.trabajadores?.correo ? [f.trabajadores.correo.trim().toLowerCase()] : []), ...(f.empresa_id ? salud.get(f.empresa_id) ?? [] : [])],
    };
  });
}

// Contador del Inicio: cero si la base todavía no tiene la tabla (antes de aplicar la migración)
export async function contarBorradores(): Promise<number> {
  if (!supabaseConfigurado) return 0;
  const supabase = await crearClienteServidor();
  const { count, error } = await supabase.from("agentes_borradores").select("id", { count: "exact", head: true }).eq("estado", "por_revisar");
  return error ? 0 : count ?? 0;
}
