import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { empresaActivaId } from "@/lib/empresa-activa";
import type { Evento } from "@/lib/eventos-tipos";
import { crearClienteServidor } from "@/lib/supabase/server";

type Fila = Record<string, unknown> & {
  trabajadores: { nombres: string; apellidos: string; cedula: string } | null;
  empresas: { razon_social: string } | null;
};

const s = (v: unknown) => (v as string | null) ?? "";

function aEvento(f: Fila): Evento {
  return {
    id: f.id as string,
    numero: f.numero as number,
    empresaId: f.empresa_id as string,
    empresa: f.empresas?.razon_social ?? "",
    trabajadorId: (f.trabajador_id as string | null) ?? null,
    trabajador: f.trabajadores ? `${f.trabajadores.nombres} ${f.trabajadores.apellidos}` : null,
    cedula: f.trabajadores?.cedula ?? null,
    tipo: f.tipo as Evento["tipo"],
    subtipo: (f.subtipo as string | null) ?? null,
    fechaHora: f.fecha_hora as string,
    lugar: s(f.lugar),
    descripcion: s(f.descripcion),
    testigos: s(f.testigos),
    parteCuerpo: s(f.parte_cuerpo),
    naturalezaLesion: s(f.naturaleza_lesion),
    agente: s(f.agente),
    forma: s(f.forma),
    gravedad: s(f.gravedad),
    conTiempoPerdido: Boolean(f.con_tiempo_perdido),
    diasPerdidos: (f.dias_perdidos as number) ?? 0,
    diasCargados: (f.dias_cargados as number) ?? 0,
    fechaAviso: (f.fecha_aviso as string | null) ?? null,
    fechaDeclaracion: (f.fecha_declaracion as string | null) ?? null,
    numeroDeclaracion: s(f.numero_declaracion),
    cie10: s(f.cie10),
    diagnostico: s(f.diagnostico),
    fechaDiagnostico: (f.fecha_diagnostico as string | null) ?? null,
    enAnexo1: f.en_anexo1 !== false,
    fechaInformeNt02: (f.fecha_informe_nt02 as string | null) ?? null,
    estadoCertificacion: s(f.estado_certificacion),
    causasInmediatas: s(f.causas_inmediatas),
    causasBasicas: s(f.causas_basicas),
    acciones: (f.acciones as Evento["acciones"]) ?? [],
    estado: f.estado as Evento["estado"],
  };
}

const COLUMNAS = "*, trabajadores(nombres, apellidos, cedula), empresas(razon_social)";

export async function listarEventos(opciones: { abiertos?: boolean } = {}): Promise<Evento[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  let q = supabase.from("eventos").select(COLUMNAS).order("fecha_hora", { ascending: false }).limit(500);
  const empresa = await empresaActivaId();
  if (empresa) q = q.eq("empresa_id", empresa);
  if (opciones.abiertos) q = q.neq("estado", "cerrado");
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Fila[]).map(aEvento);
}

export async function obtenerEvento(id: string): Promise<Evento | null> {
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("eventos").select(COLUMNAS).eq("id", id).maybeSingle();
  return data ? aEvento(data as unknown as Fila) : null;
}
