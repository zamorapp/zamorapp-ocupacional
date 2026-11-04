"use server";

import { revalidatePath } from "next/cache";
import type { Item } from "@/lib/listas";
import { casillasPerfil, perfilesSugeridos, type Casilla } from "@/lib/perfiles-paraclinicos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Asistente de Ajustes clínicos: elige qué perfil de paraclínicos sale en UNA casilla (empresa × evaluación).
// Nunca borra perfiles: solo anota en lista_items.datos del perfil «usar aquí» (pares) o «no sugerir aquí» (excluir).
// Devuelve cómo estaban los perfiles tocados para que «Deshacer» los deje igual.

export type Antes = { id: string; datos: Record<string, unknown> };
export type ResultadoCasilla = { ok: boolean; mensaje: string; antes?: Antes[] };

const UUID = /^[0-9a-f-]{36}$/i;
const igual = (a: Casilla, b: Casilla) => a.e === b.e && a.m === b.m;

async function contexto() {
  const sesion = await obtenerSesion();
  if (sesion.demo) throw new Error("En modo demo no se guardan datos.");
  if (!sesion.orgId) throw new Error("Tu usuario no tiene organización asignada.");
  if (sesion.rol !== "administrador" && sesion.rol !== "gerente_medico") throw new Error("Solo el administrador o el gerente médico cambian los ajustes clínicos.");
  return { sesion, supabase: await crearClienteServidor() };
}

/**
 * perfilId = el perfil que debe salir en la casilla · null = «sin paraclínicos» en esa casilla ·
 * "general" = quitar lo decidido en esta casilla y volver a lo que dicten los perfiles generales.
 * empresaId null = lo general (empresas sin ajuste propio).
 */
export async function elegirPerfilCasilla(empresaId: string | null, motivoId: string, perfilId: string | null | "general"): Promise<ResultadoCasilla> {
  try {
    if ((empresaId && !UUID.test(empresaId)) || !UUID.test(motivoId) || (perfilId && perfilId !== "general" && !UUID.test(perfilId))) return { ok: false, mensaje: "Datos no válidos." };
    const { sesion, supabase } = await contexto();
    const [{ data: filas, error }, { data: empresa }] = await Promise.all([
      supabase.from("lista_items").select("id, codigo, nombre, grupo, texto, orden, activo, datos").eq("org_id", sesion.orgId!).eq("lista", "grupo_paraclinicos"),
      empresaId ? supabase.from("empresas").select("razon_social").eq("id", empresaId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (error) throw error;
    if (empresaId && !empresa) return { ok: false, mensaje: "No encontré esa empresa (o no tienes acceso a ella)." };
    const perfiles = (filas ?? []) as Item[];
    if (perfilId && perfilId !== "general" && !perfiles.some((p) => p.id === perfilId && p.activo)) return { ok: false, mensaje: "Ese perfil ya no existe o está desactivado." };

    const casilla: Casilla = { e: empresaId, m: motivoId };
    const consulta = { empresaId, empresa: (empresa as { razon_social?: string } | null)?.razon_social ?? "", motivoId };
    const antes: Antes[] = [];
    const cambios: { id: string; datos: Record<string, unknown> }[] = [];

    for (const p of perfiles) {
      const { pares, excluir } = casillasPerfil(p);
      // Se parte de lo que el perfil haría sin decisión en esta casilla
      const limpio = { ...(p.datos ?? {}), pares: pares.filter((c) => !igual(c, casilla)), excluir: excluir.filter((c) => !igual(c, casilla)) };
      const saldria = p.activo && perfilesSugeridos([{ ...p, datos: limpio }], consulta).length > 0;
      // «Lo general»: fuera lo propio de la empresa (por id o por nombre); queda lo que saldría en cualquier empresa
      const propioDeEmpresa = saldria && perfilesSugeridos([{ ...p, datos: limpio }], { empresaId: null, empresa: "", motivoId }).length === 0;
      const sacar = perfilId === "general" ? propioDeEmpresa : saldria;
      const nuevo = p.id === perfilId
        ? { ...limpio, pares: [...limpio.pares, casilla] }
        : sacar ? { ...limpio, excluir: [...limpio.excluir, casilla] } : limpio;
      const vacio = (d: Record<string, unknown>) => {
        const x = { ...d };
        if (Array.isArray(x.pares) && !x.pares.length) delete x.pares;
        if (Array.isArray(x.excluir) && !x.excluir.length) delete x.excluir;
        return x;
      };
      const final = vacio(nuevo);
      if (JSON.stringify(final) !== JSON.stringify(p.datos ?? {})) {
        antes.push({ id: p.id, datos: p.datos ?? {} });
        cambios.push({ id: p.id, datos: final });
      }
    }

    // Se aplica uno por uno y se verifica que la fila cambió (la RLS puede bloquear sin error). Si algo falla a mitad,
    // se devuelve lo ya aplicado a como estaba, para no dejar la casilla a medias.
    const aplicados: Antes[] = [];
    const revertir = async () => {
      for (const a of aplicados) await supabase.from("lista_items").update({ datos: a.datos }).eq("id", a.id).eq("org_id", sesion.orgId!).eq("lista", "grupo_paraclinicos");
    };
    for (const [k, c] of cambios.entries()) {
      const { data: hecho, error: e } = await supabase.from("lista_items").update({ datos: c.datos }).eq("id", c.id).eq("org_id", sesion.orgId!).eq("lista", "grupo_paraclinicos").select("id");
      if (e || !hecho?.length) {
        await revertir();
        revalidatePath("/configuracion", "layout");
        return { ok: false, mensaje: e ? `No se guardó: ${e.message}. Quedó como estaba.` : "No se guardó: tu usuario no puede cambiar este perfil. Quedó como estaba; pídeselo al administrador." };
      }
      aplicados.push(antes[k]);
    }
    revalidatePath("/configuracion", "layout");
    const nombre = perfiles.find((p) => p.id === perfilId)?.nombre;
    const mensaje = perfilId === "general" ? "Listo: vuelve a lo general." : perfilId ? `Listo: saldrá «${nombre}».` : "Listo: esta evaluación no llevará paraclínicos.";
    return { ok: true, mensaje, antes };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

// «Deshacer»: deja los perfiles tocados exactamente como estaban
export async function restaurarCasilla(antes: Antes[]): Promise<ResultadoCasilla> {
  try {
    const { sesion, supabase } = await contexto();
    // Solo vuelven «pares» y «excluir» (lo único que cambia el asistente); el resto de datos se toma de la base
    const validos = antes.slice(0, 200).filter((a) => UUID.test(a.id) && typeof a.datos === "object" && a.datos !== null);
    const { data: filas, error: e0 } = await supabase.from("lista_items").select("id, datos").eq("org_id", sesion.orgId!).eq("lista", "grupo_paraclinicos").in("id", validos.map((a) => a.id));
    if (e0) throw e0;
    for (const a of validos) {
      const actual = { ...((filas ?? []).find((f) => f.id === a.id)?.datos as Record<string, unknown> | undefined ?? {}) };
      if (!filas?.some((f) => f.id === a.id)) return { ok: false, mensaje: "No se pudo deshacer: uno de los perfiles ya no existe o no lo puedes ver." };
      const { pares, excluir } = casillasPerfil({ datos: a.datos });
      delete actual.pares;
      delete actual.excluir;
      const datos = { ...actual, ...(pares.length ? { pares } : {}), ...(excluir.length ? { excluir } : {}) };
      const { data: hecho, error } = await supabase.from("lista_items").update({ datos }).eq("id", a.id).eq("org_id", sesion.orgId!).eq("lista", "grupo_paraclinicos").select("id");
      if (error) throw error;
      if (!hecho?.length) return { ok: false, mensaje: "No se pudo deshacer: tu usuario no puede cambiar ese perfil. Pídeselo al administrador." };
    }
    revalidatePath("/configuracion", "layout");
    return { ok: true, mensaje: "Deshecho: quedó como estaba." };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}
