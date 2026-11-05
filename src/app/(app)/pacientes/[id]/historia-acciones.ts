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

// Campos que se reponen con «Deshacer» (los mismos que guarda guardarEmpleo)
const CAMPOS_EMPLEO = "id, trabajador_id, empresa, industria, cargo, descripcion, duracion, horario, condiciones, riesgos, epp, problemas_salud, accidentes, enfermedades, observaciones";
export type EmpleoBorrado = Record<string, unknown> & { id: string; trabajador_id: string; empresa: string };

export async function eliminarEmpleo(id: string, trabajadorId: string): Promise<Resultado & { fila?: EmpleoBorrado }> {
  const supabase = await crearClienteServidor();
  const { data: fila } = await supabase.from("historia_laboral").select(CAMPOS_EMPLEO).eq("id", id).maybeSingle();
  const { data: borrados, error } = await supabase.from("historia_laboral").delete().eq("id", id).select("id");
  if (error) return { ok: false, mensaje: error.message };
  if (!borrados?.length) return { ok: false, mensaje: "No se borró: solo el personal de salud puede editar la historia laboral." };
  revalidatePath(`/pacientes/${trabajadorId}`);
  return { ok: true, mensaje: "Empleo borrado de la historia laboral.", fila: (fila ?? undefined) as EmpleoBorrado | undefined };
}

// «Deshacer»: repone el mismo empleo (mismo id) en la organización de quien lo borró; la tabla vuelve a revisar permisos
export async function restaurarEmpleo(fila: EmpleoBorrado): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para guardar." };
  if (!/^[0-9a-f-]{36}$/i.test(fila?.id ?? "") || !/^[0-9a-f-]{36}$/i.test(fila?.trabajador_id ?? "") || typeof fila.empresa !== "string") return { ok: false, mensaje: "No se pudo deshacer: datos incompletos." };
  const repuesta = Object.fromEntries(CAMPOS_EMPLEO.split(", ").map((k) => [k, fila[k] ?? null]));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("historia_laboral").insert({ ...repuesta, org_id: sesion.orgId });
  if (error) {
    if (error.code !== "23505") return { ok: false, mensaje: error.message };
    const { data: existe } = await supabase.from("historia_laboral").select("id").eq("id", fila.id).eq("trabajador_id", fila.trabajador_id).maybeSingle();
    if (!existe) return { ok: false, mensaje: "No se pudo deshacer: vuelve a agregar el empleo con «Agregar empleo»." };
  }
  revalidatePath(`/pacientes/${fila.trabajador_id}`);
  return { ok: true, mensaje: "El empleo volvió a la historia laboral." };
}
