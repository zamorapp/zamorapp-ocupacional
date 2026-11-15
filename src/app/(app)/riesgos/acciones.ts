"use server";

import { revalidatePath } from "next/cache";
import { hoyCaracas } from "@/lib/fecha";
import { aplicarAPuesto, clavePuesto, DEPTO_VALIDO, GRUPO_VALIDO, MEDICIONES, MAX_FOTOS_PUESTO, nivelFila, ROLES_PUESTOS, ROLES_RIESGOS, TIPO_VALIDO, TIPOS_EVALUACION, type FilaRiesgo, type Mapa, type PuestoEvaluado } from "@/lib/riesgos-puesto";
import type { GrupoRiesgo, Valoracion } from "@/lib/puestos-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string; id?: string };

// Quien puede cambiar la matriz de un puesto (= Empresas › Puestos, acciones de empresas/[id])

const corto = (t: unknown, max = 2000) => (typeof t === "string" ? t.trim().slice(0, max) : "");
const uno5 = (n: unknown) => (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5 ? (n as number) : 0);
const pct = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 10) / 10)) : null);
const UUID = /^[0-9a-f-]{36}$/i;

async function contexto() {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "En modo demo no se guardan datos." } as const;
  if (!sesion.rol || !ROLES_RIESGOS.includes(sesion.rol)) return { error: "Tu rol no permite hacer evaluaciones de riesgos." } as const;
  return { sesion, supabase: await crearClienteServidor() } as const;
}

// Ninguna fila cambió: la evaluación no existe o no está en tu alcance (RLS no da error, solo no toca nada)
const SIN_FILA = "No se guardó: la evaluación ya no existe o no tienes permiso sobre ella. Recarga la página.";
const explicar = (e: { message: string; code?: string }) =>
  e.code === "42501" && !/cerrada|reabrir/i.test(e.message) ? "No tienes permiso sobre esta empresa." : e.message;

export async function crearEvaluacionRiesgos(datos: { empresaId: string; titulo: string; motivo: string; tipo: "general" | "oficina" }): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!UUID.test(datos.empresaId)) return { ok: false, mensaje: "Elige la empresa." };
  const titulo = corto(datos.titulo, 200);
  if (!titulo) return { ok: false, mensaje: "Escribe qué se evalúa (la sede, el área o «toda la empresa»)." };
  const { data, error } = await c.supabase
    .from("evaluaciones_riesgos")
    .insert({ org_id: c.sesion.orgId!, empresa_id: datos.empresaId, titulo, tipo: datos.tipo === "oficina" ? "oficina" : "general", motivo: corto(datos.motivo, 300) || null })
    .select("id")
    .single();
  if (error) return { ok: false, mensaje: explicar(error) };
  revalidatePath("/riesgos");
  revalidatePath("/evaluaciones");
  return { ok: true, mensaje: "", id: data.id as string };
}

export type CambiosRiesgos = {
  titulo: string; fecha: string; motivo: string; participantes: string; acta: string;
  puestos: PuestoEvaluado[]; filas: FilaRiesgo[]; mapa: Mapa; conclusion: string; observaciones: string;
};

// Limpia lo que llega del navegador: solo grupos, medidas y responsables conocidos; marcas dentro del plano y de
// filas que existen; el plano solo de la carpeta de ESTA evaluación (<org>/<evaluación>/…)
function limpiar(x: CambiosRiesgos, carpeta: string) {
  const vistos = new Set<string>();
  const puestos = (Array.isArray(x.puestos) ? x.puestos : []).slice(0, 150).map((p): PuestoEvaluado => {
    const base = { puestoId: typeof p.puestoId === "string" && UUID.test(p.puestoId) ? p.puestoId : null, puesto: corto(p.puesto, 200) };
    const respuestas = Object.fromEntries(Object.entries(p.respuestas ?? {}).slice(0, 300)
      .filter(([k, v]) => /^[0-9a-z-]{1,40}$/i.test(k) && (v === 0 || v === 1))) as Record<string, 0 | 1>;
    const mediciones = Object.fromEntries(MEDICIONES.map((m) => [m.clave, p.mediciones?.[m.clave]])
      .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && (v as number) >= -50 && (v as number) <= 200000)) as PuestoEvaluado["mediciones"];
    return {
      ...base, clave: clavePuesto(base), area: corto(p.area, 120),
      expuestos: Number.isInteger(p.expuestos) && (p.expuestos as number) >= 0 ? Math.min(p.expuestos as number, 100000) : null,
      respuestas, mediciones,
      fotos: (Array.isArray(p.fotos) ? p.fotos : []).slice(0, MAX_FOTOS_PUESTO)
        .filter((f) => typeof f?.ruta === "string" && f.ruta.startsWith(carpeta) && f.ruta.split("/").length === 3 && !f.ruta.includes(".."))
        .map((f) => ({ ruta: f.ruta, nota: corto(f.nota, 120) })),
    };
  }).filter((p) => p.puesto && !vistos.has(p.clave) && vistos.add(p.clave));
  const filas = (Array.isArray(x.filas) ? x.filas : []).slice(0, 400).map((f): FilaRiesgo => ({
    id: corto(f.id, 40) || crypto.randomUUID().slice(0, 8),
    pregunta: typeof f.pregunta === "string" && /^[0-9a-z-]{1,40}$/i.test(f.pregunta) ? f.pregunta : null,
    puestoId: typeof f.puestoId === "string" && UUID.test(f.puestoId) ? f.puestoId : null,
    puesto: corto(f.puesto, 200), area: corto(f.area, 120), tarea: corto(f.tarea, 300),
    grupo: (GRUPO_VALIDO.has(f.grupo) ? f.grupo : "fisico") as GrupoRiesgo,
    agente: corto(f.agente, 200), fuente: corto(f.fuente, 500), efecto: corto(f.efecto, 500),
    expuestos: Number.isInteger(f.expuestos) && (f.expuestos as number) >= 0 ? Math.min(f.expuestos as number, 100000) : null,
    p: uno5(f.p), s: uno5(f.s), controles: corto(f.controles, 1000), medida: corto(f.medida, 1500),
    tipoMedida: TIPO_VALIDO.has(f.tipoMedida) ? f.tipoMedida : "",
    responsable: (DEPTO_VALIDO.has(f.responsable) ? f.responsable : "sst") as FilaRiesgo["responsable"],
    plazo: corto(f.plazo, 60),
  })).filter((f) => f.puesto && f.agente && vistos.has(clavePuesto(f)));
  const ids = new Set(filas.map((f) => f.id));
  const m = (x.mapa ?? {}) as Partial<Mapa>;
  const plano = typeof m.plano === "string" && m.plano.startsWith(carpeta) && m.plano.split("/").length === 3 && !m.plano.includes("..") ? m.plano : null;
  const marcas = (Array.isArray(m.marcas) ? m.marcas : []).slice(0, 400)
    .map((k) => ({ id: corto(k.id, 40), x: pct(k.x), y: pct(k.y), filaId: corto(k.filaId, 40) }))
    .filter((k): k is Mapa["marcas"][number] => Boolean(k.id) && k.x !== null && k.y !== null && ids.has(k.filaId));
  const areas = (Array.isArray(m.areas) ? m.areas : []).slice(0, 60)
    .map((a) => ({ id: corto(a.id, 40), x: pct(a.x), y: pct(a.y), texto: corto(a.texto, 60) }))
    .filter((a): a is Mapa["areas"][number] => Boolean(a.id && a.texto) && a.x !== null && a.y !== null);
  return {
    titulo: corto(x.titulo, 200),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : undefined,
    motivo: corto(x.motivo, 300) || null, participantes: corto(x.participantes, 2000) || null, acta: corto(x.acta, 300) || null,
    puestos, filas, mapa: { plano, marcas, areas },
    conclusion: corto(x.conclusion, 4000) || null, observaciones: corto(x.observaciones, 4000) || null,
  };
}

export async function guardarEvaluacionRiesgos(id: string, x: CambiosRiesgos, cerrar = false): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!UUID.test(id)) return { ok: false, mensaje: SIN_FILA };
  const campos = limpiar(x, `${c.sesion.orgId}/${id}/`);
  if (!campos.titulo) return { ok: false, mensaje: "Escribe qué se evalúa." };
  if (cerrar) {
    // Los mismos requisitos que piden los pasos del asistente, revisados aquí también (no basta con la pantalla)
    if (!campos.motivo || !campos.participantes) return { ok: false, mensaje: "Faltan el motivo y quiénes participaron (paso 1)." };
    if (!campos.puestos.length) return { ok: false, mensaje: "Agrega al menos un puesto (paso 2)." };
    const { data: ev } = await c.supabase.from("evaluaciones_riesgos").select("tipo").eq("id", id).maybeSingle();
    if (!ev) return { ok: false, mensaje: SIN_FILA };
    const lista = TIPOS_EVALUACION.find((t) => t.clave === ev.tipo)?.lista ?? "pregunta_riesgo";
    const { data: qs } = await c.supabase.from("lista_items").select("id").eq("org_id", c.sesion.orgId!).eq("lista", lista).eq("activo", true).limit(500);
    const ids = (qs ?? []).map((q) => q.id as string);
    const incompleto = campos.puestos.find((p) => ids.some((q) => p.respuestas?.[q] === undefined));
    if (incompleto) return { ok: false, mensaje: `Faltan preguntas por responder en «${incompleto.puesto}» (paso 3).` };
    const enMapa = new Set(campos.mapa.marcas.map((m) => m.filaId));
    const sinUbicar = campos.filas.filter((f) => (nivelFila(f)?.n ?? 0) >= 10 && !enMapa.has(f.id)).length;
    if (sinUbicar) return { ok: false, mensaje: `Faltan ${sinUbicar} riesgos altos o críticos por ubicar en el mapa (paso 4).` };
    if (!campos.conclusion) return { ok: false, mensaje: "Escribe la conclusión antes de cerrar (paso 5)." };
    if (!campos.filas.length) return { ok: false, mensaje: "Agrega al menos un riesgo antes de cerrar." };
    const sin = campos.filas.filter((f) => !f.p || !f.s).length;
    if (sin) return { ok: false, mensaje: `Hay ${sin} ${sin === 1 ? "riesgo" : "riesgos"} sin probabilidad o severidad: valóralos antes de cerrar.` };
  }
  const { data, error } = await c.supabase.from("evaluaciones_riesgos").update({ ...campos, ...(cerrar ? { estado: "cerrada" } : {}) }).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath("/riesgos");
  revalidatePath(`/riesgos/${id}`);
  return { ok: true, mensaje: cerrar ? "Evaluación cerrada. Ya puedes imprimir el informe y el mapa." : "Guardado." };
}

export async function guardarObservacionesRiesgos(id: string, observaciones: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data, error } = await c.supabase.from("evaluaciones_riesgos").update({ observaciones: corto(observaciones, 4000) || null }).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath(`/riesgos/${id}`);
  return { ok: true, mensaje: "Observaciones guardadas." };
}

export async function reabrirEvaluacionRiesgos(id: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data, error } = await c.supabase.from("evaluaciones_riesgos").update({ estado: "borrador" }).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath(`/riesgos/${id}`);
  revalidatePath("/riesgos");
  return { ok: true, mensaje: "Reabierta: ya puedes corregirla." };
}

// Solo borradores (la base rechaza borrar una cerrada); el plano se quita del bucket antes
export async function borrarEvaluacionRiesgos(id: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data: ev } = await c.supabase.from("evaluaciones_riesgos").select("estado, mapa, puestos").eq("id", id).maybeSingle();
  if (!ev) return { ok: false, mensaje: "La evaluación ya no existe." };
  if (ev.estado === "cerrada") return { ok: false, mensaje: "Una evaluación cerrada no se borra." };
  const archivos = [(ev.mapa as Mapa | null)?.plano, ...((ev.puestos as PuestoEvaluado[] | null) ?? []).flatMap((p) => (p.fotos ?? []).map((f) => f.ruta))].filter((r): r is string => Boolean(r));
  if (archivos.length) await c.supabase.storage.from("mapas-riesgo").remove(archivos);
  const { data, error } = await c.supabase.from("evaluaciones_riesgos").delete().eq("id", id).select("id");
  if (error) return { ok: false, mensaje: explicar(error) };
  if (!data?.length) return { ok: false, mensaje: SIN_FILA };
  revalidatePath("/riesgos");
  revalidatePath("/evaluaciones");
  return { ok: true, mensaje: "Borrada." };
}

// Copia los riesgos de una evaluación CERRADA a la matriz de cada puesto (la que usan la consulta, la constancia y
// la notificación de riesgos). Solo filas ligadas a un puesto de la empresa; no borra nada del puesto.
export async function aplicarRiesgosAPuestos(id: string): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!sesion.rol || !ROLES_PUESTOS.includes(sesion.rol)) return { ok: false, mensaje: "Solo el administrador, el gerente médico o el coordinador de SST pueden cambiar la matriz de los puestos." };
  const supabase = await crearClienteServidor();
  const { data: ev, error: e1 } = await supabase.from("evaluaciones_riesgos").select("empresa_id, estado, filas").eq("id", id).maybeSingle();
  if (e1) return { ok: false, mensaje: explicar(e1) };
  if (!ev) return { ok: false, mensaje: SIN_FILA };
  if (ev.estado !== "cerrada") return { ok: false, mensaje: "Cierra la evaluación antes de pasar los riesgos a los puestos." };
  const filas = ((ev.filas as FilaRiesgo[] | null) ?? []).filter((f) => f.puestoId && UUID.test(f.puestoId));
  const porPuesto = new Map<string, FilaRiesgo[]>();
  for (const f of filas) porPuesto.set(f.puestoId!, [...(porPuesto.get(f.puestoId!) ?? []), f]);
  if (!porPuesto.size) return { ok: false, mensaje: "Ningún riesgo está ligado a un puesto registrado de la empresa." };
  const { data: puestos, error: e2 } = await supabase.from("puestos").select("id, riesgos, evaluacion").eq("empresa_id", ev.empresa_id as string).in("id", [...porPuesto.keys()]);
  if (e2) return { ok: false, mensaje: explicar(e2) };
  let agregados = 0, actualizados = 0, hechos = 0;
  for (const p of puestos ?? []) {
    const r = aplicarAPuesto({ riesgos: (p.riesgos ?? {}) as Partial<Record<GrupoRiesgo, string[]>>, evaluacion: (p.evaluacion ?? {}) as Record<string, Valoracion> }, porPuesto.get(p.id as string) ?? []);
    const { data, error } = await supabase.from("puestos")
      .update({ riesgos: r.riesgos, evaluacion: r.evaluacion, evaluado_por: sesion.usuarioId, evaluado_en: hoyCaracas() })
      .eq("id", p.id as string).select("id");
    if (error) return { ok: false, mensaje: `Se actualizaron ${hechos} puestos; el siguiente falló: ${explicar(error)}` };
    if (!data?.length) return { ok: false, mensaje: `Se actualizaron ${hechos} puestos; no tienes permiso sobre los demás.` };
    hechos++; agregados += r.agregados; actualizados += r.actualizados;
  }
  await supabase.from("evaluaciones_riesgos").update({ aplicada_en: hoyCaracas() }).eq("id", id);
  revalidatePath(`/riesgos/${id}`);
  revalidatePath(`/empresas/${ev.empresa_id}`);
  revalidatePath("/evaluaciones");
  return { ok: true, mensaje: `Listo: ${hechos} ${hechos === 1 ? "puesto actualizado" : "puestos actualizados"} (${agregados} riesgos nuevos, ${actualizados} revalorados). Las notificaciones de riesgo de esos puestos quedan por renovar.` };
}
