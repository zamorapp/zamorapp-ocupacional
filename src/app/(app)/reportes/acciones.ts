"use server";

import { revalidatePath } from "next/cache";
import type { Firmantes } from "@/lib/reportes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string };

export type TextosGuardar = {
  resumen: string;
  conclusiones: string;
  recomendaciones: string;
  factores_riesgo: string;
  medidas_control: string;
  firmantes: Firmantes;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ROLES = ["administrador", "gerente_medico", "medico", "enfermeria", "coordinador_sst"];

// Guarda los textos del informe para la empresa (o el consolidado) y el período exacto
export async function guardarInformeVigilancia(empresaId: string | null, desde: string, hasta: string, t: TextosGuardar): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!sesion.rol || !ROLES.includes(sesion.rol)) return { ok: false, mensaje: "Tu rol no permite redactar el informe." };
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) return { ok: false, mensaje: "Período inválido." };

  const limpio = (v: string) => v.trim() || null;
  const campos = {
    resumen: limpio(t.resumen),
    conclusiones: limpio(t.conclusiones),
    recomendaciones: limpio(t.recomendaciones),
    factores_riesgo: limpio(t.factores_riesgo),
    medidas_control: limpio(t.medidas_control),
    firmantes: t.firmantes,
    actualizado_por: sesion.usuarioId,
  };
  const supabase = await crearClienteServidor();
  let q = supabase.from("informes_vigilancia").select("id").eq("desde", desde).eq("hasta", hasta);
  q = empresaId ? q.eq("empresa_id", empresaId) : q.is("empresa_id", null);
  const { data: existente } = await q.maybeSingle();
  const { error } = existente
    ? await supabase.from("informes_vigilancia").update(campos).eq("id", existente.id)
    : await supabase.from("informes_vigilancia").insert({ ...campos, org_id: sesion.orgId, empresa_id: empresaId, desde, hasta });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "No tienes permiso para esta empresa." : error.message };
  revalidatePath("/reportes");
  return { ok: true, mensaje: "Informe guardado." };
}

// «Firmar las mías» del lote de aptitud: firma solo las consultas cerradas cuyo autor es quien firma.
// Cada una pasa por firmar_consulta (misma regla que el botón Firmar de la consulta).
export async function firmarMiasDelLote(ids: string[]): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico || sesion.rol === "enfermeria") return { ok: false, mensaje: "Tu rol no firma consultas." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("consultas").select("id").in("id", ids.slice(0, 300)).eq("estado", "cerrada").eq("medico_id", sesion.usuarioId);
  if (error) return { ok: false, mensaje: error.message };
  let firmadas = 0;
  const fallos: string[] = [];
  for (const c of data ?? []) {
    const { error: e } = await supabase.rpc("firmar_consulta", { p_id: c.id });
    if (e) fallos.push(e.message); else firmadas++;
  }
  revalidatePath("/reportes", "layout");
  if (!firmadas && !fallos.length) return { ok: false, mensaje: "No hay constancias cerradas tuyas por firmar. Las que están en curso se cierran desde la consulta." };
  return { ok: !fallos.length, mensaje: `${firmadas} constancia${firmadas === 1 ? "" : "s"} firmada${firmadas === 1 ? "" : "s"}.${fallos.length ? ` ${fallos.length} no se pudieron firmar: ${fallos[0]}` : ""}` };
}
