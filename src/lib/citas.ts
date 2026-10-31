import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { empresaActivaId } from "@/lib/empresa-activa";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas } from "@/lib/fecha";
import type { ModoPropuesta, Propuesta } from "@/lib/propuesta";

export type { ModoPropuesta, Propuesta } from "@/lib/propuesta";

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
  // Hora de cada paso (las pone la base al cambiar el estado); creadoEn = cuándo se pidió o se agendó
  creadoEn: string | null;
  confirmadaEn: string | null;
  enConsultaEn: string | null;
  atendidaEn: string | null;
  cerradaEn: string | null;
  // Otra hora propuesta por el servicio, pendiente de respuesta de RR. HH. (20261030790000)
  empresaId: string;
  propuesta: Propuesta | null;
  respuestaEmpresa: "aceptada" | "pidio_otra" | null;
};


type Fila = {
  id: string; fecha: string; hora: string | null; estado: EstadoCita; llegada: string | null; trabajador_id: string;
  motivo_id: string | null; consulta_id: string | null; observacion: string | null;
  empresa_id?: string; propuesta_fecha?: string | null; propuesta_desde?: string | null; propuesta_hasta?: string | null;
  propuesta_modo?: ModoPropuesta | null; propuesta_nota?: string | null; propuesta_en?: string | null; respuesta_empresa?: Cita["respuestaEmpresa"];
  creado_en?: string | null; confirmada_en?: string | null; en_consulta_en?: string | null; atendida_en?: string | null; cerrada_en?: string | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string; telefono: string | null } | null;
  empresas: { razon_social: string } | null;
  motivo: { nombre: string } | null;
};

const PROPUESTA = "empresa_id, propuesta_fecha, propuesta_desde, propuesta_hasta, propuesta_modo, propuesta_nota, propuesta_en, respuesta_empresa";
const propuesta = (c: Fila) => ({
  empresaId: c.empresa_id ?? "",
  respuestaEmpresa: c.respuesta_empresa ?? null,
  propuesta: c.propuesta_fecha && c.propuesta_desde && c.propuesta_modo
    ? { fecha: c.propuesta_fecha, desde: c.propuesta_desde.slice(0, 5), hasta: c.propuesta_hasta?.slice(0, 5) ?? null, modo: c.propuesta_modo, nota: c.propuesta_nota ?? null, en: c.propuesta_en ?? null }
    : null,
});

const horas = (c: Fila) => ({
  creadoEn: c.creado_en ?? null,
  confirmadaEn: c.confirmada_en ?? null,
  enConsultaEn: c.en_consulta_en ?? null,
  atendidaEn: c.atendida_en ?? null,
  cerradaEn: c.cerrada_en ?? null,
});

export async function listarCitas(desde: string, hasta = desde): Promise<Cita[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("citas")
    .select(`id, fecha, hora, estado, llegada, trabajador_id, motivo_id, consulta_id, observacion, creado_en, confirmada_en, en_consulta_en, atendida_en, cerrada_en, ${PROPUESTA}, trabajadores(nombres, apellidos, cedula, telefono), empresas(razon_social), motivo:lista_items(nombre)`)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("hora", { nullsFirst: false })
    .limit(1000);
  const empresa = await empresaActivaId();
  if (empresa) q = q.eq("empresa_id", empresa);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Fila[]).map((c) => ({ ...horas(c), ...propuesta(c),
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
    .select(`id, fecha, hora, estado, llegada, trabajador_id, motivo_id, consulta_id, observacion, nota_empresa, ${PROPUESTA}, trabajadores(nombres, apellidos, cedula, telefono), empresas(razon_social), motivo:lista_items(nombre)`)
    .eq("estado", "solicitada")
    .gte("fecha", hoyCaracas())
    .order("fecha")
    .order("hora", { nullsFirst: false })
    .limit(200);
  return ((data ?? []) as unknown as (Fila & { nota_empresa: string | null })[]).map((c) => ({ ...horas(c), ...propuesta(c),
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

// El primero que llegó y espera hoy (para «Siguiente paciente» al terminar una consulta) y cuántos esperan
export type SiguienteCita = { citaId: string; trabajadorId: string; motivoId: string | null; paciente: string; corto: string; enEspera: number };

export async function siguienteEnEspera(): Promise<SiguienteCita | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("citas")
    .select("id, trabajador_id, motivo_id, trabajadores(nombres, apellidos)", { count: "exact" })
    .eq("fecha", hoyCaracas())
    .eq("estado", "en_espera")
    .order("llegada", { nullsFirst: false })
    .order("hora", { nullsFirst: false })
    .limit(1);
  const empresa = await empresaActivaId();
  if (empresa) q = q.eq("empresa_id", empresa);
  const { data, count, error } = await q;
  if (error || !data?.length) return null;
  const c = data[0] as unknown as { id: string; trabajador_id: string; motivo_id: string | null; trabajadores: { nombres: string; apellidos: string } | null };
  return {
    citaId: c.id,
    trabajadorId: c.trabajador_id,
    motivoId: c.motivo_id,
    paciente: c.trabajadores ? `${c.trabajadores.nombres} ${c.trabajadores.apellidos}` : "",
    // Primer nombre y primer apellido («María González»), para el botón
    corto: c.trabajadores ? [c.trabajadores.nombres.trim().split(/\s+/)[0], c.trabajadores.apellidos.trim().split(/\s+/)[0]].filter(Boolean).join(" ") : "",
    enEspera: count ?? 1,
  };
}
