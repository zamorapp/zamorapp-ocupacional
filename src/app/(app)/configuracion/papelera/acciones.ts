"use server";

import { revalidatePath } from "next/cache";
import { olvidar } from "@/lib/memo";
import { obtenerSesion } from "@/lib/sesion";
import { invalidarEmpresas } from "@/lib/empresas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { TIPOS_PAPELERA, type TipoPapelera, type VistaPrevia } from "@/lib/papelera";

export type ResultadoPapelera = { ok: boolean; mensaje: string; papeleraId?: string };

// Mensaje claro cuando la base dice que no: quién puede, o que falta internet en el escritorio
function explicar(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "Solo el administrador con acceso clínico puede eliminar o restaurar.";
  if (error.code === "PGRST202") return "Falta aplicar la actualización de la base (papelera). Pide que se aplique la migración.";
  return error.message;
}

async function puede(): Promise<string | null> {
  const s = await obtenerSesion();
  if (s.demo || !s.orgId) return "En modo demo no se elimina nada.";
  if (s.rol !== "administrador" || !s.clinico) return "Solo el administrador con acceso clínico puede eliminar o restaurar.";
  return null;
}

function refrescar() {
  olvidar(""); // los reportes y conteos recuerdan unos minutos: se recalculan sin lo eliminado
  invalidarEmpresas();
  revalidatePath("/", "layout");
}

export async function vistaPreviaPapelera(tipo: TipoPapelera, id: string): Promise<{ ok: true; vista: VistaPrevia } | { ok: false; mensaje: string }> {
  const no = await puede();
  if (no) return { ok: false, mensaje: no };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("papelera_vista_previa", { p_tipo: tipo, p_id: id });
  if (error) return { ok: false, mensaje: explicar(error) };
  const v = (data ?? {}) as { resumen?: Record<string, number>; firmadas?: number; sueltas?: Record<string, number> };
  return { ok: true, vista: { resumen: v.resumen ?? {}, firmadas: Number(v.firmadas ?? 0), sueltas: v.sueltas ?? {} } };
}

export async function eliminarAPapelera(tipo: TipoPapelera, id: string, motivo: string): Promise<ResultadoPapelera> {
  const no = await puede();
  if (no) return { ok: false, mensaje: no };
  if (motivo.trim().length < 5) return { ok: false, mensaje: "Escribe el motivo (al menos 5 letras)." };
  const supabase = await crearClienteServidor();
  if (!(tipo in TIPOS_PAPELERA)) return { ok: false, mensaje: "Tipo desconocido." };
  const { data, error } = tipo === "consulta" || tipo === "trabajador"
    ? await supabase.rpc(tipo === "consulta" ? "eliminar_consulta" : "eliminar_trabajador", { p_id: id, p_motivo: motivo.trim() })
    : await supabase.rpc("eliminar_documento", { p_tipo: tipo, p_id: id, p_motivo: motivo.trim() });
  if (error) return { ok: false, mensaje: explicar(error) };
  refrescar();
  return {
    ok: true,
    papeleraId: data as string,
    mensaje: `${TIPOS_PAPELERA[tipo].hecho}. Quedó en la Papelera: puedes deshacerlo.`,
  };
}

export async function restaurarDePapelera(papeleraId: string): Promise<ResultadoPapelera> {
  const no = await puede();
  if (no) return { ok: false, mensaje: no };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("restaurar_papelera", { p_id: papeleraId });
  if (error) return { ok: false, mensaje: explicar(error) };
  refrescar();
  return { ok: true, mensaje: `Restaurado: ${data as string}.` };
}
