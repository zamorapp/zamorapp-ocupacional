import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { empresaActivaId } from "@/lib/empresa-activa";
import { type Aptitud, type Trabajador, TRABAJADORES_DEMO } from "@/lib/pacientes";
import { crearClienteServidor } from "@/lib/supabase/server";

const COLUMNAS = `id, numero_historia, cedula, nombres, apellidos, sexo, fecha_nacimiento, fecha_ingreso, turno,
  grupo_sanguineo, lateralidad, telefono, correo, estado,
  empresas(razon_social), dependencias(nombre), puestos(nombre, riesgos), tipo:lista_items(nombre)`;

type Fila = {
  id: string;
  numero_historia: number;
  cedula: string;
  nombres: string;
  apellidos: string;
  sexo: "F" | "M" | null;
  fecha_nacimiento: string | null;
  fecha_ingreso: string | null;
  turno: string | null;
  grupo_sanguineo: string | null;
  lateralidad: string | null;
  telefono: string | null;
  correo: string | null;
  estado: Trabajador["estado"];
  empresas: { razon_social: string } | null;
  dependencias: { nombre: string } | null;
  puestos: { nombre: string; riesgos: Trabajador["riesgos"] } | null;
  tipo: { nombre: string } | null;
};

type AptitudFila = { trabajador_id: string; fecha: string; clasificacion: Aptitud; vigente_hasta: string | null };

function aTrabajador(f: Fila, apt?: AptitudFila): Trabajador {
  return {
    id: f.id,
    historia: f.numero_historia,
    cedula: f.cedula,
    nombres: f.nombres,
    apellidos: f.apellidos,
    sexo: f.sexo,
    fechaNacimiento: f.fecha_nacimiento,
    empresa: f.empresas?.razon_social ?? "",
    dependencia: f.dependencias?.nombre ?? null,
    cargo: f.puestos?.nombre ?? "",
    tipoPaciente: f.tipo?.nombre ?? null,
    fechaIngreso: f.fecha_ingreso,
    turno: f.turno,
    grupoSanguineo: f.grupo_sanguineo,
    lateralidad: f.lateralidad,
    telefono: f.telefono,
    correo: f.correo,
    estado: f.estado,
    aptitud: apt?.clasificacion ?? null,
    aptitudFecha: apt?.fecha ?? null,
    proximoExamen: apt?.vigente_hasta ?? null,
    riesgos: f.puestos?.riesgos ?? {},
  };
}

// Última aptitud de cada trabajador, desde la vista segura (sin diagnósticos)
async function aptitudes(ids: string[]) {
  const mapa = new Map<string, AptitudFila>();
  if (!ids.length) return mapa;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("aptitud_trabajadores")
    .select("trabajador_id, fecha, clasificacion, vigente_hasta")
    .in("trabajador_id", ids)
    .order("fecha", { ascending: false });
  for (const a of (data ?? []) as AptitudFila[]) if (!mapa.has(a.trabajador_id)) mapa.set(a.trabajador_id, a);
  return mapa;
}

export async function listarTrabajadores(): Promise<Trabajador[]> {
  if (!supabaseConfigurado) return TRABAJADORES_DEMO;
  const supabase = await crearClienteServidor();
  const empresa = await empresaActivaId();
  let consulta = supabase.from("trabajadores").select(COLUMNAS).order("apellidos").limit(2000);
  if (empresa) consulta = consulta.eq("empresa_id", empresa);
  const { data, error } = await consulta;
  if (error) throw error;
  const filas = (data ?? []) as unknown as Fila[];
  const apt = await aptitudes(filas.map((f) => f.id));
  return filas.map((f) => aTrabajador(f, apt.get(f.id)));
}

export async function obtenerTrabajador(id: string): Promise<Trabajador | null> {
  if (!supabaseConfigurado) return TRABAJADORES_DEMO.find((t) => t.id === id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("trabajadores").select(COLUMNAS).eq("id", id).maybeSingle();
  if (!data) return null;
  const apt = await aptitudes([id]);
  return aTrabajador(data as unknown as Fila, apt.get(id));
}

export async function cedulasRegistradas(): Promise<string[]> {
  if (!supabaseConfigurado) return TRABAJADORES_DEMO.map((t) => t.cedula);
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("trabajadores").select("cedula").limit(20000);
  return (data ?? []).map((t) => t.cedula);
}

export async function listarTiposPaciente(): Promise<{ id: string; nombre: string }[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("lista_items")
    .select("id, nombre")
    .eq("lista", "tipo_paciente")
    .eq("activo", true)
    .not("org_id", "is", null)
    .order("orden");
  return data ?? [];
}
