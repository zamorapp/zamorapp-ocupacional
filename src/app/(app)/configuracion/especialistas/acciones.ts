"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Registro de especialistas (migración 20261030971000). Gestiona gerencia y recepción; la base lo refuerza con RLS.
export type Resultado = { ok: boolean; mensaje: string };

const ROLES = new Set(["administrador", "gerente_medico", "recepcion"]);
const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim().slice(0, 200) || null;

async function servicio() {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "No disponible en modo demo." } as const;
  if (!sesion.rol || !ROLES.has(sesion.rol)) return { error: "Tu rol no permite gestionar especialistas." } as const;
  return { sesion, supabase: await crearClienteServidor() } as const;
}

export async function crearEspecialista(datos: FormData): Promise<Resultado> {
  const s = await servicio();
  if ("error" in s) return { ok: false, mensaje: s.error! };
  const nombres = texto(datos, "nombres");
  const apellidos = texto(datos, "apellidos");
  const especialidad = texto(datos, "especialidad");
  if (!nombres || !apellidos || !especialidad) return { ok: false, mensaje: "Nombre, apellido y especialidad son obligatorios." };
  const { error } = await s.supabase.from("especialistas").insert({
    org_id: s.sesion.orgId!,
    nombres,
    apellidos,
    especialidad,
    direccion: texto(datos, "direccion"),
    telefono: texto(datos, "telefono"),
    correo: texto(datos, "correo"),
    notas: texto(datos, "notas"),
  });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu rol no permite registrar especialistas." : error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Especialista registrado." };
}

export async function editarEspecialista(id: string, datos: FormData): Promise<Resultado> {
  const s = await servicio();
  if ("error" in s) return { ok: false, mensaje: s.error! };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, mensaje: "Especialista no válido." };
  const nombres = texto(datos, "nombres");
  const apellidos = texto(datos, "apellidos");
  const especialidad = texto(datos, "especialidad");
  if (!nombres || !apellidos || !especialidad) return { ok: false, mensaje: "Nombre, apellido y especialidad son obligatorios." };
  const { data, error } = await s.supabase.from("especialistas").update({
    nombres,
    apellidos,
    especialidad,
    direccion: texto(datos, "direccion"),
    telefono: texto(datos, "telefono"),
    correo: texto(datos, "correo"),
    notas: texto(datos, "notas"),
  }).eq("id", id).eq("org_id", s.sesion.orgId!).select("id");
  if (error) return { ok: false, mensaje: error.message };
  if (!data?.length) return { ok: false, mensaje: "No se guardó: recarga la página." };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Cambios guardados." };
}

// Desactivar, no borrar: las cartas viejas conservan su texto
export async function cambiarActivoEspecialista(id: string, activo: boolean): Promise<Resultado> {
  const s = await servicio();
  if ("error" in s) return { ok: false, mensaje: s.error! };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, mensaje: "Especialista no válido." };
  const { data, error } = await s.supabase.from("especialistas").update({ activo }).eq("id", id).eq("org_id", s.sesion.orgId!).select("id");
  if (error) return { ok: false, mensaje: error.message };
  if (!data?.length) return { ok: false, mensaje: "No se guardó: recarga la página." };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: activo ? "Especialista activado." : "Especialista desactivado." };
}
