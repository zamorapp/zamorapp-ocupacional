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
