import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aplicarPerfilParaclinicos } from "@/app/(app)/atencion/[id]/perfiles";
import { claseDe } from "@/lib/estudios";
import type { Item } from "@/lib/listas";
import type { Sesion } from "@/lib/sesion";
import { docsElegidos, partesOrden, type DocumentosRegistro, type EleccionRegistro, type ExamenOrden } from "@/lib/registro-documentos";
import { temasBienestar } from "@/lib/bienestar";

export const FIRMANTES = new Set(["administrador", "gerente_medico", "medico"]);
export const puedeFirmarRegistro = (s: Pick<Sesion, "clinico" | "rol">) => s.clinico && FIRMANTES.has(s.rol ?? "");

// Lo que el paciente descarga al terminar su registro (20261030906000 y 911000): la orden lleva los exámenes del perfil
// elegido, copiados al crear el enlace (si después cambia el perfil, este enlace no cambia), cada uno con su clase de
// estudio para salir en su propia orden. Lo usan «Crear enlace» y la vista previa: lo que se ve es lo que se envía.
export async function armarDocumentosRegistro(supabase: SupabaseClient, sesion: Pick<Sesion, "orgId" | "clinico" | "rol">, el: EleccionRegistro): Promise<DocumentosRegistro | string> {
  const d: DocumentosRegistro = {};
  if (el.orden) {
    if (!/^[0-9a-f-]{36}$/i.test(el.orden.perfilId)) return "Elige el perfil de exámenes de la orden.";
    const { data } = await supabase.from("lista_items").select("id, lista, codigo, nombre, grupo, texto, orden, activo, datos")
      .eq("org_id", sesion.orgId!).in("lista", ["grupo_paraclinicos", "paraclinico"]).eq("activo", true);
    const items = (data ?? []) as (Item & { lista: string })[];
    const perfil = items.find((i) => i.id === el.orden!.perfilId && i.lista === "grupo_paraclinicos");
    if (!perfil) return "Ese perfil de exámenes ya no existe. Elige otro.";
    const sin = new Set((Array.isArray(el.orden.sin) ? el.orden.sin : []).filter((x): x is string => typeof x === "string").slice(0, 200));
    const examenes = examenesDePerfilConClase(perfil.texto ?? "", items.filter((i) => i.lista === "paraclinico")).filter((x) => !sin.has(x.nombre));
    if (!examenes.length) return sin.size ? "Deja marcado al menos un examen de la orden." : `El perfil «${perfil.nombre}» no tiene exámenes.`;
    d.orden = { examenes, perfil: perfil.nombre, ...(el.orden.motivoId && /^[0-9a-f-]{36}$/i.test(el.orden.motivoId) ? { motivo_id: el.orden.motivoId } : {}) };
  }
  if (el.controlTa) d.control_ta = { dias: el.controlTa === 14 ? 14 : 7 };
  if (el.dieta) d.dieta = { dieta: el.dieta, plan: [] };
  if (el.bienestar) d.bienestar = { tema: temasBienestar((el.temas ?? []).join(",")).slice(0, 12) };
  if (el.firma && docsElegidos(d).length) {
    if (!puedeFirmarRegistro(sesion)) return "Solo un médico envía documentos con su firma y sello.";
    d.firma = true;
  }
  if (el.conversadas && docsElegidos(d).length) d.conversadas = true;
  return d;
}

// Exámenes de un perfil con su clase (lo mismo que guarda «Crear enlace»)
function examenesDePerfilConClase(texto: string, catalogo: Item[]): ExamenOrden[] {
  const porId = new Map(catalogo.map((c) => [c.id, c]));
  return aplicarPerfilParaclinicos([], texto, catalogo).map((x) => ({
    nombre: x.nombre,
    ...(x.grupo ? { grupo: x.grupo } : {}),
    clase: claseDe(porId.get(x.id) ?? { nombre: x.nombre, grupo: x.grupo }),
  }));
}

// Para el diálogo: qué órdenes salen de cada perfil y con qué exámenes
export function resumenPerfiles(perfiles: Item[], catalogo: Item[]) {
  return perfiles.map((p) => {
    const ex = examenesDePerfilConClase(p.texto ?? "", catalogo);
    return { id: p.id, nombre: p.nombre, examenes: ex.length, ordenes: partesOrden(ex).map((o) => ({ nombre: o.nombre, examenes: o.examenes.map((e) => e.nombre) })) };
  });
}
