"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseConfigurado } from "@/lib/config";
import { COOKIE_EMPRESA } from "@/lib/empresa-activa";
import { crearClienteServidor } from "@/lib/supabase/server";
import { TRABAJADORES_DEMO } from "@/lib/pacientes";
import { buscarPacientes } from "@/app/(app)/atencion/acciones";
import { ultimosAtendidos, type Atendido } from "@/lib/ultimos-atendidos";
import { ahora } from "@/lib/fecha";

export async function salir() {
  if (supabaseConfigurado) {
    const supabase = await crearClienteServidor();
    // Solo esta sesión: «Salir» en la PC no debe cerrar la web ni los otros equipos (por omisión es global)
    await supabase.auth.signOut({ scope: "local" });
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
  // Empresa inactiva = avisos en pausa también en la campana: lo que ya estaba guardado de ella no se muestra
  // (no se borra; vuelve si se reactiva). Los plazos legales de accidentes siguen saliendo: la ley no se pausa.
  const [{ data }, { data: inactivas }] = await Promise.all([
    supabase.from("notificaciones")
      .select("id, titulo, texto, enlace, leida, creado_en, nivel, empresa_id")
      .order("creado_en", { ascending: false })
      .limit(60),
    supabase.from("empresas").select("id").eq("activa", false),
  ]);
  const pausadas = new Set((inactivas ?? []).map((e) => e.id as string));
  const visibles = (data ?? []).filter((n) => !n.empresa_id || !pausadas.has(n.empresa_id) || (n.enlace ?? "").startsWith("/accidentes/"));
  return visibles.slice(0, 30).map((n) => ({ id: n.id, titulo: n.titulo, texto: n.texto, enlace: n.enlace, leida: n.leida, creadoEn: n.creado_en, nivel: n.nivel ?? "info" }));
}

// Aparatos con avisos activos que no confirmaron el último aviso (acuse del service worker, 20261030932000): la nube
// lo mandó hace más de 30 min y el aparato no dijo «me llegó», o dijo que le llegó pero no lo pudo mostrar.
export type AparatoSinAcuse = { id: string; equipo: string; desde: string; bloqueado: boolean };
const ESPERA_ACUSE_MS = 30 * 60e3;
export async function aparatosSinAcuse(): Promise<AparatoSinAcuse[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("suscripciones_push").select("id, equipo, ultimo_aviso, ultimo_acuse, acuse_mostrado");
  if (error || !data) return [];
  const limite = ahora() - ESPERA_ACUSE_MS;
  return data
    .filter((s) => s.ultimo_aviso && (
      (Date.parse(s.ultimo_aviso) < limite && (!s.ultimo_acuse || Date.parse(s.ultimo_acuse) < Date.parse(s.ultimo_aviso)))
      || (s.acuse_mostrado === false && s.ultimo_acuse && Date.parse(s.ultimo_acuse) >= Date.parse(s.ultimo_aviso))))
    .map((s) => ({ id: s.id as string, equipo: (s.equipo as string | null) || "Navegador", desde: s.ultimo_aviso as string, bloqueado: s.acuse_mostrado === false }));
}

export async function marcarLeidas(ids: string[]) {
  if (!supabaseConfigurado || !ids.length) return;
  const supabase = await crearClienteServidor();
  await supabase.from("notificaciones").update({ leida: true }).in("id", ids);
}

export type Encontrado = { id: string; nombre: string; cedula: string; empresa: string; inactiva?: boolean; inactivo?: boolean };

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

// Al abrir el buscador sin escribir nada: las últimas consultas de todas las empresas (solo personal de salud)
export async function ultimosParaBuscador(): Promise<Atendido[]> {
  if (!supabaseConfigurado) return [];
  try {
    return await ultimosAtendidos(6);
  } catch {
    return [];
  }
}
