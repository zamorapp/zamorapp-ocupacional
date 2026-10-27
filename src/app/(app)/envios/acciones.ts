"use server";

import { revalidatePath } from "next/cache";
import { enviarLote, revocarEnlace } from "@/lib/envios";
import type { EntradaEnvio, ResultadoEnvio } from "@/lib/envios-tipos";
import { CORREO_VALIDO } from "@/lib/envios-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string };

export async function enviar(entrada: EntradaEnvio): Promise<ResultadoEnvio> {
  const r = await enviarLote(entrada);
  revalidatePath("/envios");
  return r;
}

export async function anularEnlace(envioId: string): Promise<Resultado> {
  const error = await revocarEnlace(envioId);
  revalidatePath("/envios");
  return error ? { ok: false, mensaje: error } : { ok: true, mensaje: "Enlace anulado: ya no abre." };
}

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

// Alta o edición de un contacto de la empresa. «recibe_consulta» solo lo marca el gerente médico o el administrador (lo valida la base).
export async function guardarContacto(_: Resultado | null, d: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  const correo = texto(d, "correo")?.toLowerCase() ?? null;
  const telefono = texto(d, "telefono");
  if (!correo && !telefono) return { ok: false, mensaje: "Escribe un correo o un teléfono." };
  if (correo && !CORREO_VALIDO.test(correo)) return { ok: false, mensaje: "El correo no es válido." };
  const fila = {
    nombre: texto(d, "nombre") ?? "",
    cargo: texto(d, "cargo"),
    correo,
    telefono,
    recibe_consulta: d.get("recibe_consulta") === "on",
  };
  if (!fila.nombre) return { ok: false, mensaje: "Escribe el nombre." };
  const supabase = await crearClienteServidor();
  const id = texto(d, "id");
  const { error } = id
    ? await supabase.from("empresa_contactos").update(fila).eq("id", id)
    : await supabase.from("empresa_contactos").insert({ ...fila, org_id: sesion.orgId, empresa_id: texto(d, "empresa_id") });
  if (error) return { ok: false, mensaje: error.message.includes("Solo el gerente médico") ? "Solo el gerente médico o el administrador autoriza a quién le llega la consulta médica." : error.message };
  revalidatePath("/envios");
  return { ok: true, mensaje: "Contacto guardado." };
}

export async function quitarContacto(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("empresa_contactos").update({ activo: false }).eq("id", id);
  revalidatePath("/envios");
  return error ? { ok: false, mensaje: error.message } : { ok: true, mensaje: "" };
}
