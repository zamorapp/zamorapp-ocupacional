import "server-only";
import type { EstadoConsulta } from "@/lib/consultas-tipos";
import type { Aptitud } from "@/lib/pacientes";
import { crearClienteServidor } from "@/lib/supabase/server";

// Constancias de aptitud por lote (Reportes › Aptitud emitida). El PDF sale de /imprimir/lote y el envío de
// lib/envios.ts (enviarLote): ahí la base exige una sola empresa y consultas firmadas. Todo con la sesión del usuario (RLS).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstadoLote = { id: string; estado: EstadoConsulta; medicoId: string | null; revision: number; aptitud: Aptitud | null; empresaId: string };

// Estado de firma de las consultas del reporte (para marcar «Firmada / Sin firmar» en la lista)
export async function estadosDeLote(ids: string[]): Promise<Record<string, EstadoLote>> {
  const supabase = await crearClienteServidor();
  const salida: Record<string, EstadoLote> = {};
  const limpios = ids.filter((x) => UUID.test(x));
  for (let i = 0; i < limpios.length; i += 300) {
    const { data, error } = await supabase
      .from("consultas")
      .select("id, estado, medico_id, revision, empresa_id, aptitudes(clasificacion)")
      .in("id", limpios.slice(i, i + 300));
    if (error) throw error;
    for (const c of data ?? []) {
      const apt = (Array.isArray(c.aptitudes) ? c.aptitudes[0] : c.aptitudes) as { clasificacion: Aptitud } | null;
      salida[c.id] = { id: c.id, estado: c.estado, medicoId: c.medico_id, revision: c.revision ?? 1, aptitud: apt?.clasificacion ?? null, empresaId: c.empresa_id };
    }
  }
  return salida;
}
