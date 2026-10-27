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

export type FilaContacto = { empresa: string; nombre: string; cargo: string | null; correo: string | null; telefono: string | null; salud: boolean };

const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

// Carga de contactos de todas las empresas desde Excel/CSV. La empresa se reconoce por RIF o por nombre.
// No duplica (misma empresa y mismo correo o teléfono). «Personal de salud» solo lo aplica quien puede autorizar.
export async function importarContactos(filas: FilaContacto[]): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  if (filas.length > 2000) return { ok: false, mensaje: "Máximo 2000 contactos por archivo." };
  const autoriza = sesion.rol === "administrador" || sesion.rol === "gerente_medico";
  const supabase = await crearClienteServidor();
  const [{ data: empresas }, { data: existentes }] = await Promise.all([
    supabase.from("empresas").select("id, razon_social, nombre_comercial, rif"),
    supabase.from("empresa_contactos").select("empresa_id, correo, telefono").eq("activo", true),
  ]);
  const porClave = new Map<string, string>();
  for (const e of empresas ?? []) for (const k of [e.rif, e.razon_social, e.nombre_comercial]) if (k) porClave.set(clave(k), e.id);
  const ya = new Set((existentes ?? []).flatMap((c) => [c.correo && `${c.empresa_id}|${c.correo}`, c.telefono && `${c.empresa_id}|${clave(c.telefono)}`]).filter(Boolean));
  const sinEmpresa = new Set<string>();
  let repetidos = 0, invalidos = 0, saludIgnorada = 0;
  const nuevas = [];
  for (const f of filas) {
    const empresaId = porClave.get(clave(f.empresa));
    if (!empresaId) { if (f.empresa) sinEmpresa.add(f.empresa); continue; }
    const correo = f.correo?.trim().toLowerCase() || null;
    const telefono = f.telefono?.trim() || null;
    if (!f.nombre.trim() || (!correo && !telefono) || (correo && !CORREO_VALIDO.test(correo))) { invalidos++; continue; }
    const llaves = [correo && `${empresaId}|${correo}`, telefono && `${empresaId}|${clave(telefono)}`].filter(Boolean) as string[];
    if (llaves.some((k) => ya.has(k))) { repetidos++; continue; }
    llaves.forEach((k) => ya.add(k));
    const salud = f.salud && autoriza && Boolean(correo);
    if (f.salud && !salud) saludIgnorada++;
    nuevas.push({ org_id: sesion.orgId, empresa_id: empresaId, nombre: f.nombre.trim(), cargo: f.cargo?.trim() || null, correo, telefono, recibe_consulta: salud });
  }
  if (nuevas.length) {
    const { error } = await supabase.from("empresa_contactos").insert(nuevas);
    if (error) return { ok: false, mensaje: error.message };
  }
  revalidatePath("/envios");
  const partes = [
    `${nuevas.length} contacto${nuevas.length === 1 ? "" : "s"} cargado${nuevas.length === 1 ? "" : "s"}`,
    repetidos && `${repetidos} ya estaban`,
    invalidos && `${invalidos} sin nombre o sin correo/teléfono válido`,
    sinEmpresa.size && `empresa no encontrada: ${[...sinEmpresa].slice(0, 5).join(", ")}${sinEmpresa.size > 5 ? "…" : ""}`,
    saludIgnorada && `${saludIgnorada} marcados «Personal de salud» quedaron sin marcar (solo lo autoriza el gerente médico o el administrador, y necesitan correo)`,
  ].filter(Boolean);
  return { ok: nuevas.length > 0 || repetidos > 0, mensaje: partes.join(" · ") + "." };
}
