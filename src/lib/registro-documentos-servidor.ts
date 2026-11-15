import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aplicarPerfilParaclinicos } from "@/app/(app)/atencion/[id]/perfiles";
import { claseDe, claseDeducida } from "@/lib/estudios";
import type { Item } from "@/lib/listas";
import type { Sesion } from "@/lib/sesion";
import { docsElegidos, MAX_RECOMENDACIONES, partesOrden, partirOtros, type DocumentosRegistro, type EleccionRegistro, type ExamenOrden } from "@/lib/registro-documentos";
import { temasBienestar } from "@/lib/bienestar";

export const FIRMANTES = new Set(["administrador", "gerente_medico", "medico"]);
export const puedeFirmarRegistro = (s: Pick<Sesion, "clinico" | "rol">) => s.clinico && FIRMANTES.has(s.rol ?? "");

// Lo que el paciente descarga al terminar su registro (20261030906000 y 911000): la orden lleva los exámenes del perfil
// elegido, copiados al crear el enlace (si después cambia el perfil, este enlace no cambia), cada uno con su clase de
// estudio para salir en su propia orden. Lo usan «Crear enlace» y la vista previa: lo que se ve es lo que se envía.
export async function armarDocumentosRegistro(supabase: SupabaseClient, sesion: Pick<Sesion, "orgId" | "clinico" | "rol">, el: EleccionRegistro): Promise<DocumentosRegistro | string> {
  const d: DocumentosRegistro = {};
  if (el.orden) {
    // Perfil (opcional) y exámenes sueltos del catálogo: la orden lleva los dos, sin repetir
    const perfilId = el.orden.perfilId && /^[0-9a-f-]{36}$/i.test(el.orden.perfilId) ? el.orden.perfilId : null;
    const sueltos = [...new Set((Array.isArray(el.orden.sueltos) ? el.orden.sueltos : []).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 60);
    const otros = partirOtros((Array.isArray(el.orden.otros) ? el.orden.otros : []).filter((x): x is string => typeof x === "string").join("\n"));
    if (!perfilId && !sueltos.length && !otros.length) return "Elige un perfil o al menos un examen para la orden.";
    const { data } = await supabase.from("lista_items").select("id, lista, codigo, nombre, grupo, texto, orden, activo, datos")
      .eq("org_id", sesion.orgId!).in("lista", ["grupo_paraclinicos", "paraclinico"]).eq("activo", true);
    const items = (data ?? []) as (Item & { lista: string })[];
    const catalogo = items.filter((i) => i.lista === "paraclinico");
    const perfil = perfilId ? items.find((i) => i.id === perfilId && i.lista === "grupo_paraclinicos") : null;
    if (perfilId && !perfil) return "Ese perfil de exámenes ya no existe. Elige otro.";
    const sin = new Set((Array.isArray(el.orden.sin) ? el.orden.sin : []).filter((x): x is string => typeof x === "string").slice(0, 200));
    const delPerfil = perfil ? examenesDePerfilConClase(perfil.texto ?? "", catalogo).filter((x) => !sin.has(x.nombre)) : [];
    const porId = new Map(catalogo.map((c) => [c.id, c]));
    const vistos = new Set(delPerfil.map((x) => x.nombre.toLowerCase()));
    const extra: ExamenOrden[] = sueltos.flatMap((id) => {
      const c = porId.get(id);
      if (!c || vistos.has(c.nombre.toLowerCase())) return [];
      vistos.add(c.nombre.toLowerCase());
      return [{ nombre: c.nombre, ...(c.grupo ? { grupo: c.grupo } : {}), clase: claseDe(c) }];
    });
    // «Otros» escritos a mano: salen en la orden de su clase (por su nombre: «Rx de…» va a rayos X; si no dice, laboratorio)
    const libres: ExamenOrden[] = otros.flatMap((nombre) => {
      if (vistos.has(nombre.toLowerCase())) return [];
      vistos.add(nombre.toLowerCase());
      const c = catalogo.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase());
      return [c ? { nombre: c.nombre, ...(c.grupo ? { grupo: c.grupo } : {}), clase: claseDe(c) } : { nombre, clase: claseDeducida(nombre) }];
    });
    const examenes = [...delPerfil, ...extra, ...libres].slice(0, 60);
    if (!examenes.length) return perfil && !sin.size && !sueltos.length && !otros.length ? `El perfil «${perfil.nombre}» no tiene exámenes.` : "Deja marcado al menos un examen de la orden.";
    d.orden = { examenes, ...(perfil ? { perfil: perfil.nombre } : {}), ...(el.orden.motivoId && /^[0-9a-f-]{36}$/i.test(el.orden.motivoId) ? { motivo_id: el.orden.motivoId } : {}) };
  }
  const rec = typeof el.recomendaciones === "string" ? el.recomendaciones.replace(/\r/g, "").trim() : "";
  if (rec.length > MAX_RECOMENDACIONES) return `Las recomendaciones pasan de ${MAX_RECOMENDACIONES} letras: acórtalas.`;
  if (rec) d.recomendaciones = { texto: rec };
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

// Para el diálogo: exámenes del catálogo para pedirlos sueltos y frases guardadas de recomendaciones al trabajador
export function extrasEnlace(paraclinicos: Item[], recomendaciones: Item[]) {
  return {
    examenes: paraclinicos.map((p) => ({ id: p.id, nombre: p.nombre, grupo: p.grupo ?? null })),
    frases: [...new Set(recomendaciones.map((r) => (r.texto?.trim() || r.nombre).trim()).filter(Boolean))].slice(0, 500),
  };
}

// Para el diálogo: qué órdenes salen de cada perfil y con qué exámenes
export function resumenPerfiles(perfiles: Item[], catalogo: Item[]) {
  return perfiles.map((p) => {
    const ex = examenesDePerfilConClase(p.texto ?? "", catalogo);
    return { id: p.id, nombre: p.nombre, examenes: ex.length, ordenes: partesOrden(ex).map((o) => ({ nombre: o.nombre, examenes: o.examenes.map((e) => e.nombre) })) };
  });
}
