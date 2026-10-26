"use server";

import { revalidatePath } from "next/cache";
import { GRUPOS_RIESGO } from "@/lib/pacientes";
import { CONDICIONES } from "@/lib/historia-laboral";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

type Resultado = { ok: boolean; mensaje: string };
const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

// Crea o actualiza un empleo anterior del trabajador
export async function guardarEmpleo(_: Resultado | null, d: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para guardar." };
  const empresa = texto(d, "empresa");
  const trabajadorId = String(d.get("trabajador_id") ?? "");
  if (!empresa) return { ok: false, mensaje: "Escribe la empresa." };
  const riesgos = Object.fromEntries(GRUPOS_RIESGO.map(([k]) => [k, (texto(d, `riesgo_${k}`) ?? "").split(",").map((x) => x.trim()).filter(Boolean)]).filter(([, v]) => v.length));
  const condiciones = Object.fromEntries(CONDICIONES.map(([k]) => [k, texto(d, `cond_${k}`)]).filter(([, v]) => v));
  const fila = {
    org_id: sesion.orgId, trabajador_id: trabajadorId, empresa, industria: texto(d, "industria"), cargo: texto(d, "cargo"), descripcion: texto(d, "descripcion"),
    duracion: texto(d, "duracion"), horario: texto(d, "horario"), condiciones, riesgos, epp: texto(d, "epp"), problemas_salud: texto(d, "problemas_salud"),
    accidentes: texto(d, "accidentes"), enfermedades: texto(d, "enfermedades"), observaciones: texto(d, "observaciones"),
  };
  const supabase = await crearClienteServidor();
  const id = texto(d, "id");
  const { error } = id ? await supabase.from("historia_laboral").update(fila).eq("id", id) : await supabase.from("historia_laboral").insert(fila);
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Solo el personal de salud puede editar la historia laboral." : error.message };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "Guardado." };
}

export async function eliminarEmpleo(id: string, trabajadorId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("historia_laboral").delete().eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "Eliminado." };
}
