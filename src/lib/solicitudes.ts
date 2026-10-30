import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoSolicitud, Solicitud } from "@/lib/solicitudes-tipos";

// Solicitudes extras de la empresa: lectura con la sesión del usuario (la RLS limita a sus empresas)

type Fila = {
  id: string;
  empresa_id: string;
  tipo: string;
  trabajador_id: string | null;
  detalle: string;
  estado: EstadoSolicitud;
  respuesta: string | null;
  documento_nombre: string | null;
  creado_en: string;
  actualizado_en: string | null;
  en_proceso_en: string | null;
  respondida_en: string | null;
  empresas: { razon_social: string } | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string } | null;
};

export async function listarSolicitudes(filtro: { estado?: EstadoSolicitud | "abiertas"; empresaId?: string | null; limite?: number } = {}): Promise<Solicitud[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("solicitudes")
    .select("id, empresa_id, tipo, trabajador_id, detalle, estado, respuesta, documento_nombre, creado_en, actualizado_en, en_proceso_en, respondida_en, empresas(razon_social), trabajadores(nombres, apellidos, cedula)")
    .order("creado_en", { ascending: false })
    .limit(filtro.limite ?? 100);
  if (filtro.estado === "abiertas") q = q.in("estado", ["pendiente", "en_proceso"]);
  else if (filtro.estado) q = q.eq("estado", filtro.estado);
  if (filtro.empresaId) q = q.eq("empresa_id", filtro.empresaId);
  const { data } = await q;
  return ((data ?? []) as unknown as Fila[]).map((s) => ({
    id: s.id,
    empresaId: s.empresa_id,
    empresa: s.empresas?.razon_social ?? "",
    tipo: s.tipo,
    trabajadorId: s.trabajador_id,
    trabajador: s.trabajadores ? `${s.trabajadores.nombres} ${s.trabajadores.apellidos}` : null,
    cedula: s.trabajadores?.cedula ?? null,
    detalle: s.detalle,
    estado: s.estado,
    respuesta: s.respuesta,
    documento: s.documento_nombre,
    creadoEn: s.creado_en,
    actualizadoEn: s.actualizado_en,
    enProcesoEn: s.en_proceso_en,
    respondidaEn: s.respondida_en,
  }));
}

// Consultas firmadas recientes del trabajador, para responder con un documento de zamorApp
export async function consultasParaResponder(trabajadorIds: string[]) {
  if (!trabajadorIds.length) return {} as Record<string, { id: string; fecha: string; motivo: string | null }[]>;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("consultas")
    .select("id, fecha, trabajador_id, estado, motivo:lista_items(nombre)")
    .in("trabajador_id", trabajadorIds)
    .eq("estado", "firmada")
    .order("fecha", { ascending: false })
    .limit(200);
  const salida: Record<string, { id: string; fecha: string; motivo: string | null }[]> = {};
  for (const c of (data ?? []) as unknown as { id: string; fecha: string; trabajador_id: string; motivo: { nombre: string } | null }[]) {
    const lista = (salida[c.trabajador_id] ??= []);
    if (lista.length < 8) lista.push({ id: c.id, fecha: c.fecha, motivo: c.motivo?.nombre ?? null });
  }
  return salida;
}
