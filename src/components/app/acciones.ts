"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseConfigurado } from "@/lib/config";
import { COOKIE_EMPRESA } from "@/lib/empresa-activa";
import { crearClienteServidor } from "@/lib/supabase/server";
import { TRABAJADORES_DEMO } from "@/lib/pacientes";
import { buscarPacientes } from "@/app/(app)/atencion/acciones";

export async function salir() {
  if (supabaseConfigurado) {
    const supabase = await crearClienteServidor();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function elegirEmpresa(id: string | null) {
  const almacen = await cookies();
  if (id) almacen.set(COOKIE_EMPRESA, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else almacen.delete(COOKIE_EMPRESA);
  revalidatePath("/", "layout");
}

export type Notificacion = { id: string; titulo: string; texto: string | null; enlace: string | null; leida: boolean; creadoEn: string; nivel: "info" | "aviso" | "alerta" };

export async function misNotificaciones(): Promise<Notificacion[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("notificaciones")
    .select("id, titulo, texto, enlace, leida, creado_en, nivel")
    .order("creado_en", { ascending: false })
    .limit(30);
  return (data ?? []).map((n) => ({ id: n.id, titulo: n.titulo, texto: n.texto, enlace: n.enlace, leida: n.leida, creadoEn: n.creado_en, nivel: n.nivel ?? "info" }));
}

export async function marcarLeidas(ids: string[]) {
  if (!supabaseConfigurado || !ids.length) return;
  const supabase = await crearClienteServidor();
  await supabase.from("notificaciones").update({ leida: true }).in("id", ids);
}

export type Encontrado = { id: string; nombre: string; cedula: string; empresa: string };

// Buscador global (Ctrl+K): por cédula o nombre; respeta RLS, cada rol ve solo lo suyo.
export async function buscarGlobal(texto: string): Promise<Encontrado[]> {
  const q = texto.trim();
  if (q.length < 2) return [];
  if (!supabaseConfigurado) {
    const n = q.toLowerCase();
    const digitos = q.replace(/\D/g, "");
    return TRABAJADORES_DEMO.filter((t) =>
      digitos.length >= 4 ? t.cedula.replace(/\D/g, "").includes(digitos) : `${t.nombres} ${t.apellidos}`.toLowerCase().includes(n),
    ).slice(0, 8).map((t) => ({ id: t.id, nombre: `${t.nombres} ${t.apellidos}`, cedula: t.cedula, empresa: t.empresa }));
  }
  return buscarPacientes(q);
}
