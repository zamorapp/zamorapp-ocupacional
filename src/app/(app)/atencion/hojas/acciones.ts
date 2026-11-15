"use server";

import { revalidatePath } from "next/cache";
import { leerCambios } from "@/lib/cambios-hoja";
import { SIN_ALARMAS, alarmasQuitadas, hojaEditable, soloDeLaHoja } from "@/lib/hojas-version";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Versión propia de una hoja para el paciente (20261030913000). La base deja cambiarla solo a administrador y gerente
// médico (items_admin); aquí se repite para dar el mensaje claro.
type R = { ok: true } | { ok: false; mensaje: string };
const EDITAN = new Set(["administrador", "gerente_medico"]);

async function contexto(codigo: string) {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "No disponible en modo demo." } as const;
  if (!sesion.rol || !EDITAN.has(sesion.rol)) return { error: "Solo el administrador o el gerente médico guardan la versión del servicio." } as const;
  const h = hojaEditable(codigo);
  if (!h) return { error: "Esa hoja no existe." } as const;
  return { sesion, h, supabase: await crearClienteServidor() } as const;
}

export async function guardarVersionHoja(codigo: string, c: string | null): Promise<R> {
  const x = await contexto(codigo);
  if ("error" in x) return { ok: false, mensaje: x.error! };
  const cambios = soloDeLaHoja(x.h, leerCambios(c));
  if (alarmasQuitadas(x.h, cambios)) return { ok: false, mensaje: SIN_ALARMAS };
  if (!Object.keys(cambios).length) return borrarVersionHoja(codigo);
  const fila = { lista: "hoja_paciente", org_id: x.sesion.orgId!, codigo, nombre: x.h.nombre, datos: { cambios }, activo: true };
  const { data: ya } = await x.supabase.from("lista_items").select("id").eq("org_id", x.sesion.orgId!).eq("lista", "hoja_paciente").eq("codigo", codigo).maybeSingle();
  const { error } = ya
    ? await x.supabase.from("lista_items").update({ datos: fila.datos, activo: true }).eq("id", ya.id)
    : await x.supabase.from("lista_items").insert(fila);
  if (error) return { ok: false, mensaje: `No se guardó: ${error.message}` };
  revalidatePath("/atencion/hojas");
  return { ok: true };
}

export async function borrarVersionHoja(codigo: string): Promise<R> {
  const x = await contexto(codigo);
  if ("error" in x) return { ok: false, mensaje: x.error! };
  const { error } = await x.supabase.from("lista_items").delete().eq("org_id", x.sesion.orgId!).eq("lista", "hoja_paciente").eq("codigo", codigo);
  if (error) return { ok: false, mensaje: `No se pudo volver al original: ${error.message}` };
  revalidatePath("/atencion/hojas");
  return { ok: true };
}
