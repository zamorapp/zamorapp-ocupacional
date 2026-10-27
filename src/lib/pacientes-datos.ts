import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { empresaActivaId } from "@/lib/empresa-activa";
import { type Aptitud, type Trabajador, TRABAJADORES_DEMO } from "@/lib/pacientes";
import { todas } from "@/lib/paginar";
import { crearClienteServidor } from "@/lib/supabase/server";

const COLUMNAS = `id, numero_historia, cedula, nombres, apellidos, sexo, fecha_nacimiento, fecha_ingreso, turno,
  lateralidad, telefono, correo, estado,
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
  grupo_sanguineo?: string | null;
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
    grupoSanguineo: f.grupo_sanguineo ?? null,
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
async function aptitudes(ids: string[], empresa?: string | null) {
  const mapa = new Map<string, AptitudFila>();
  if (!ids.length) return mapa;
  const supabase = await crearClienteServidor();
  // Pocos trabajadores: se piden por id. Muchos: toda la vista (ya trae solo la última por trabajador)
  const filas = ids.length <= 100
    ? ((await supabase.from("ultima_aptitud").select("trabajador_id, fecha, clasificacion, vigente_hasta").in("trabajador_id", ids)).data ?? []) as AptitudFila[]
    : await todas<AptitudFila>((d, h) => {
        let q = supabase.from("ultima_aptitud").select("trabajador_id, fecha, clasificacion, vigente_hasta", { count: "exact" }).order("trabajador_id").range(d, h);
        if (empresa) q = q.eq("empresa_id", empresa);
        return q;
      });
  for (const a of filas) mapa.set(a.trabajador_id, a);
  return mapa;
}

export async function listarTrabajadores(): Promise<Trabajador[]> {
  if (!supabaseConfigurado) return TRABAJADORES_DEMO;
  const supabase = await crearClienteServidor();
  const empresa = await empresaActivaId();
  const filas = await todas<Fila>((d, h) => {
    let q = supabase.from("trabajadores").select(COLUMNAS, { count: "exact" }).order("apellidos").order("id").range(d, h);
    if (empresa) q = q.eq("empresa_id", empresa);
    return q;
  });
  const apt = await aptitudes(filas.map((f) => f.id), empresa);
  return filas.map((f) => aTrabajador(f, apt.get(f.id)));
}

export async function obtenerTrabajador(id: string): Promise<Trabajador | null> {
  if (!supabaseConfigurado) return TRABAJADORES_DEMO.find((t) => t.id === id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  // Grupo sanguíneo: solo lo recibe el personal del servicio (vista trabajadores_salud); RR. HH. no.
  const [{ data }, { data: salud }] = await Promise.all([
    supabase.from("trabajadores").select(COLUMNAS).eq("id", id).maybeSingle(),
    supabase.from("trabajadores_salud").select("grupo_sanguineo").eq("id", id).maybeSingle(),
  ]);
  if (!data) return null;
  const apt = await aptitudes([id]);
  return aTrabajador({ ...(data as unknown as Fila), grupo_sanguineo: salud?.grupo_sanguineo ?? null }, apt.get(id));
}

export async function cedulasRegistradas(): Promise<string[]> {
  if (!supabaseConfigurado) return TRABAJADORES_DEMO.map((t) => t.cedula);
  const supabase = await crearClienteServidor();
  const filas = await todas<{ cedula: string }>((d, h) => supabase.from("trabajadores").select("cedula", { count: "exact" }).order("id").range(d, h));
  return filas.map((t) => t.cedula);
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
