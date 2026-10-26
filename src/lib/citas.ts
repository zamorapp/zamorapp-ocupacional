import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { empresaActivaId } from "@/lib/empresa-activa";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoCita = "solicitada" | "citado" | "en_espera" | "en_consulta" | "atendido" | "no_asistio" | "cancelada";

export type Cita = {
  id: string;
  fecha: string;
  hora: string | null;
  estado: EstadoCita;
  llegada: string | null;
  trabajadorId: string;
  paciente: string;
  cedula: string;
  telefono: string | null;
  empresa: string;
  motivoId: string | null;
  motivo: string | null;
  consultaId: string | null;
  observacion: string | null;
};

type Fila = {
  id: string; fecha: string; hora: string | null; estado: EstadoCita; llegada: string | null; trabajador_id: string;
  motivo_id: string | null; consulta_id: string | null; observacion: string | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string; telefono: string | null } | null;
  empresas: { razon_social: string } | null;
  motivo: { nombre: string } | null;
};

export const hoyVE = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });

export async function listarCitas(desde: string, hasta = desde): Promise<Cita[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("citas")
    .select("id, fecha, hora, estado, llegada, trabajador_id, motivo_id, consulta_id, observacion, trabajadores(nombres, apellidos, cedula, telefono), empresas(razon_social), motivo:lista_items(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("hora", { nullsFirst: false })
    .limit(1000);
  const empresa = await empresaActivaId();
  if (empresa) q = q.eq("empresa_id", empresa);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Fila[]).map((c) => ({
    id: c.id,
    fecha: c.fecha,
    hora: c.hora?.slice(0, 5) ?? null,
    estado: c.estado,
    llegada: c.llegada,
    trabajadorId: c.trabajador_id,
    paciente: c.trabajadores ? `${c.trabajadores.nombres} ${c.trabajadores.apellidos}` : "",
    cedula: c.trabajadores?.cedula ?? "",
    telefono: c.trabajadores?.telefono ?? null,
    empresa: c.empresas?.razon_social ?? "",
    motivoId: c.motivo_id,
    motivo: c.motivo?.nombre ?? null,
    consultaId: c.consulta_id,
    observacion: c.observacion,
  }));
}

// Solicitudes de cita hechas por las empresas desde el portal, aún sin confirmar
export async function listarSolicitudes(): Promise<Cita[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("citas")
    .select("id, fecha, hora, estado, llegada, trabajador_id, motivo_id, consulta_id, observacion, nota_empresa, trabajadores(nombres, apellidos, cedula, telefono), empresas(razon_social), motivo:lista_items(nombre)")
    .eq("estado", "solicitada")
    .gte("fecha", hoyVE())
    .order("fecha")
    .order("hora", { nullsFirst: false })
    .limit(200);
  return ((data ?? []) as unknown as (Fila & { nota_empresa: string | null })[]).map((c) => ({
    id: c.id,
    fecha: c.fecha,
    hora: c.hora?.slice(0, 5) ?? null,
    estado: c.estado,
    llegada: c.llegada,
    trabajadorId: c.trabajador_id,
    paciente: c.trabajadores ? `${c.trabajadores.nombres} ${c.trabajadores.apellidos}` : "",
    cedula: c.trabajadores?.cedula ?? "",
    telefono: c.trabajadores?.telefono ?? null,
    empresa: c.empresas?.razon_social ?? "",
    motivoId: c.motivo_id,
    motivo: c.motivo?.nombre ?? null,
    consultaId: c.consulta_id,
    observacion: c.nota_empresa ?? c.observacion,
  }));
}
