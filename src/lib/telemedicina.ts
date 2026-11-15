import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";
import { TEXTO_SALA, type EnSala, type Medio, type Seguimiento, type Teleconsulta } from "@/lib/telemedicina-tipos";

type FilaTele = {
  medio: Medio; duracion_min: number | null; ubicacion: string; telefono: string; identidad: string;
  consentimiento: Teleconsulta["consentimiento"]; consentimiento_en: string | null; enlace_vence: string | null; fallas: string; control_id: string | null;
};

export const deFila = (f: FilaTele): Teleconsulta => ({
  medio: f.medio, duracionMin: f.duracion_min, ubicacion: f.ubicacion, telefono: f.telefono, identidad: f.identidad,
  consentimiento: f.consentimiento, consentimientoEn: f.consentimiento_en, enlaceVence: f.enlace_vence, fallas: f.fallas, controlId: f.control_id,
});
export const COLUMNAS_TELE = "medio, duracion_min, ubicacion, telefono, identidad, consentimiento, consentimiento_en, enlace_vence, fallas, control_id";

// La consulta a distancia (si lo es) y su espera en la sala. Solo personal clínico (RLS): para el resto, null.
export async function teleconsultaDe(consultaId: string, trabajadorId: string): Promise<{ tele: Teleconsulta | null; sala: EnSala | null; telefonoFicha: string | null }> {
  if (!supabaseConfigurado) return { tele: null, sala: null, telefonoFicha: null };
  const supabase = await crearClienteServidor();
  const [{ data: t }, { data: a }, { data: w }] = await Promise.all([
    supabase.from("teleconsultas").select(COLUMNAS_TELE).eq("consulta_id", consultaId).maybeSingle(),
    supabase.from("alertas_clinicas").select("id, revisar_antes").eq("consulta_id", consultaId).eq("estado", "pendiente").eq("texto", TEXTO_SALA).limit(1).maybeSingle(),
    supabase.from("trabajadores").select("telefono").eq("id", trabajadorId).maybeSingle(),
  ]);
  return {
    tele: t ? deFila(t as FilaTele) : null,
    sala: a ? { alertaId: a.id as string, revisarAntes: (a.revisar_antes as string | null) ?? null } : null,
    telefonoFicha: (w?.telefono as string | null) ?? null,
  };
}

type FilaSeg = {
  alerta_id: string; consulta_id: string; trabajador_id: string; paciente: string; empresa: string | null; medio: Medio; fecha: string;
  revisar_antes: string | null; estado: string; respuesta: string | null; paraclinicos: { nombre?: string }[] | null; texto: string;
  telefono: string | null; control_id: string | null;
};

// Sala de espera (pendientes) o archivados de 90 días. RR. HH. recibe la lista vacía (la función es invoker).
export async function seguimientosDistancia(archivados = false): Promise<Seguimiento[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("seguimientos_distancia", { p_archivados: archivados });
  return ((data ?? []) as FilaSeg[]).map((f) => ({
    alertaId: f.alerta_id, consultaId: f.consulta_id, trabajadorId: f.trabajador_id, paciente: f.paciente, empresa: f.empresa, medio: f.medio,
    fecha: f.fecha, revisarAntes: f.revisar_antes, estado: f.estado, respuesta: f.respuesta,
    pedidos: (Array.isArray(f.paraclinicos) ? f.paraclinicos : []).map((p) => p?.nombre ?? "").filter(Boolean),
    texto: f.texto, telefono: f.telefono, controlId: f.control_id,
  }));
}
