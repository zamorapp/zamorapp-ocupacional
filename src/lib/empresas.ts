import { supabaseConfigurado } from "@/lib/config";
import { EMPRESAS_DEMO } from "@/lib/demo";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Empresa = {
  id: string;
  razonSocial: string;
  rif: string;
  nil: string | null;
  actividad: string | null;
  estado: string | null;
  municipio: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  servicioSst: string | null;
  servicioSstRegistro: string | null;
  psstRegistro: string | null;
  trabajadores: number;
  activa: boolean;
  ignorarAlertaLegal: boolean;
};

export async function listarEmpresas(): Promise<Empresa[]> {
  if (!supabaseConfigurado) {
    return EMPRESAS_DEMO.map((e) => ({
      id: e.rif,
      razonSocial: e.nombre,
      rif: e.rif,
      nil: null,
      actividad: null,
      estado: null,
      municipio: null,
      direccion: null,
      telefono: null,
      correo: null,
      servicioSst: null,
      servicioSstRegistro: null,
      psstRegistro: null,
      trabajadores: e.trabajadores,
      activa: true,
      ignorarAlertaLegal: false,
    }));
  }
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("empresas")
    .select("id, razon_social, rif, nil, actividad_economica, estado, municipio, direccion, telefono, correo, servicio_sst_tipo, servicio_sst_fecha_registro, psst_fecha_registro, activa, ignorar_alerta_legal, trabajadores(count)")
    .order("razon_social");
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    razonSocial: e.razon_social,
    rif: e.rif,
    nil: e.nil,
    actividad: e.actividad_economica,
    estado: e.estado,
    municipio: e.municipio,
    direccion: e.direccion,
    telefono: e.telefono,
    correo: e.correo,
    servicioSst: e.servicio_sst_tipo,
    servicioSstRegistro: e.servicio_sst_fecha_registro,
    psstRegistro: e.psst_fecha_registro,
    trabajadores: (e.trabajadores as unknown as { count: number }[])[0]?.count ?? 0,
    activa: e.activa,
    ignorarAlertaLegal: e.ignorar_alerta_legal,
  }));
}

// Datos legales que exige el informe trimestral (bloque 1); si falta alguno se marca en rojo.
export function datosLegalesFaltantes(e: Empresa) {
  const faltan: string[] = [];
  if (!e.nil) faltan.push("NIL");
  if (!e.actividad) faltan.push("actividad económica");
  if (!e.servicioSstRegistro) faltan.push("registro del Servicio de SST");
  if (!e.psstRegistro) faltan.push("registro del PSST");
  return faltan;
}
