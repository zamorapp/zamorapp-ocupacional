import "server-only";
import { eventosDeEmpresa } from "@/lib/eventos";
import type { Evento } from "@/lib/eventos-tipos";
import { desactualizada } from "@/lib/notificacion-riesgos";
import { todas } from "@/lib/paginar";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas, sumarDias } from "@/lib/fecha";

// Paquete para inspección del INPSASEL: índice de cumplimiento y registros de una empresa en un período.

export type EstadoCriterio = "ok" | "aviso" | "alerta" | "no_aplica";
export type Criterio = { clave: string; titulo: string; base: string; cumplidos: number; total: number; estado: EstadoCriterio; detalle: string; href?: string };
export type TrabajadorInspeccion = {
  id: string; nombre: string; cedula: string; puesto: string | null;
  aptitudHasta: string | null; evaluacionVigente: boolean;
  notificacionId: string | null; notificadoEn: string | null; firmadoEn: string | null; notificacionVigente: boolean;
};
export type DatosInspeccion = {
  empresa: { id: string; razonSocial: string; rif: string; nil: string | null; actividad: string | null; direccion: string | null; servicioSst: string | null; servicioSstRegistro: string | null; psstRegistro: string | null };
  desde: string;
  hasta: string;
  criterios: Criterio[];
  puntaje: number | null; // % promedio de los criterios que aplican
  eventos: Evento[];
  investigaciones: Map<string, { id: string; estado: string; terminadoEn: string | null }>;
  trabajadores: TrabajadorInspeccion[];
  puestos: { id: string; nombre: string; evaluadoEn: string | null; trabajadores: number }[];
  informes: { desde: string; hasta: string; actualizadoEn: string }[];
};

const dia = 864e5;

type Conteo = { cumplidos: number; total: number };
export type PendienteNotificacion = { id: string; nombre: string; con_puesto: boolean; notificado_en: string | null; firmado_en: string | null };
// Lo cuenta la base en un solo viaje (inspeccion_conteos): pantalla e impresión usan las mismas cifras
type Conteos = Record<"declaracion" | "investigacion" | "nt02" | "acciones" | "puestos" | "notificacion" | "evaluacion", Conteo> & { informes: number; pendientes: PendienteNotificacion[] };
type EmpresaFila = { id: string; razon_social: string; rif: string; nil: string | null; actividad_economica: string | null; direccion: string | null; servicio_sst_tipo: string | null; servicio_sst_fecha_registro: string | null; psst_fecha_registro: string | null };
const COLUMNAS_EMPRESA = "id, razon_social, rif, nil, actividad_economica, direccion, servicio_sst_tipo, servicio_sst_fecha_registro, psst_fecha_registro";

function criterio(c: Omit<Criterio, "estado">): Criterio {
  if (!c.total) return { ...c, estado: "no_aplica" };
  const pct = c.cumplidos / c.total;
  return { ...c, estado: pct >= 1 ? "ok" : pct >= 0.8 ? "aviso" : "alerta" };
}

async function conteos(empresaId: string, desde: string, hasta: string) {
  const supabase = await crearClienteServidor();
  const [{ data: emp }, { data, error }] = await Promise.all([
    supabase.from("empresas").select(COLUMNAS_EMPRESA).eq("id", empresaId).maybeSingle(),
    supabase.rpc("inspeccion_conteos", { p_empresa: empresaId, p_desde: desde, p_hasta: hasta }),
  ]);
  if (error) throw error;
  return emp ? { emp: emp as EmpresaFila, c: data as Conteos } : null;
}

function datosEmpresa(emp: EmpresaFila): DatosInspeccion["empresa"] {
  return { id: emp.id, razonSocial: emp.razon_social, rif: emp.rif, nil: emp.nil, actividad: emp.actividad_economica, direccion: emp.direccion, servicioSst: emp.servicio_sst_tipo, servicioSstRegistro: emp.servicio_sst_fecha_registro, psstRegistro: emp.psst_fecha_registro };
}

// Criterios e índice a partir de los conteos de la base
function armarCriterios(emp: EmpresaFila, c: Conteos, desde: string, hasta: string) {
  const empresaId = emp.id;
  const trimestres = Math.max(1, Math.floor((Date.parse(hasta) - Date.parse(desde) + dia) / (91 * dia)));
  const criterios = [
    criterio({ clave: "servicio", titulo: "Servicio de Seguridad y Salud en el Trabajo registrado", base: "LOPCYMAT art. 39", cumplidos: emp.servicio_sst_fecha_registro ? 1 : 0, total: 1,
      detalle: emp.servicio_sst_fecha_registro ? `${emp.servicio_sst_tipo ?? "Registrado"} desde el ${emp.servicio_sst_fecha_registro}` : "Falta la fecha de registro en Empresas", href: `/empresas/${empresaId}` }),
    criterio({ clave: "psst", titulo: "Programa de Seguridad y Salud en el Trabajo registrado", base: "LOPCYMAT art. 61; NT-01-2008", cumplidos: emp.psst_fecha_registro ? 1 : 0, total: 1,
      detalle: emp.psst_fecha_registro ? `Registrado el ${emp.psst_fecha_registro}` : "Falta la fecha de registro en Empresas", href: `/empresas/${empresaId}` }),
    criterio({ clave: "declaracion", titulo: "Accidentes y enfermedades declarados en 24 horas", base: "LOPCYMAT art. 73", ...c.declaracion,
      detalle: c.declaracion.total ? `${c.declaracion.total - c.declaracion.cumplidos} fuera de plazo o sin declarar` : "Sin eventos en el período", href: "/accidentes" }),
    criterio({ clave: "investigacion", titulo: "Accidentes con causas investigadas", base: "LOPCYMAT art. 40; COVENIN 474", ...c.investigacion,
      detalle: c.investigacion.total ? "Causas inmediatas o básicas registradas" : "Sin accidentes en el período", href: "/accidentes" }),
    criterio({ clave: "nt02", titulo: "Informes de investigación de enfermedad entregados a tiempo", base: "NT-02-2008, Tít. IV, cap. II, 5.2.3", ...c.nt02,
      detalle: c.nt02.total ? "15 días si está en el Anexo 1; 30 si no" : "Sin enfermedades en el período", href: "/accidentes" }),
    criterio({ clave: "acciones", titulo: "Acciones correctivas al día", base: "LOPCYMAT art. 56", ...c.acciones,
      detalle: c.acciones.total ? `${c.acciones.total - c.acciones.cumplidos} vencidas sin cumplir` : "Sin acciones registradas", href: "/accidentes" }),
    criterio({ clave: "puestos", titulo: "Puestos con personal evaluados", base: "NT-02-2008, cap. II, 3.1", ...c.puestos,
      detalle: "Evaluación del puesto con matriz de riesgos", href: `/empresas/${empresaId}` }),
    criterio({ clave: "notificacion", titulo: "Trabajadores con notificación de riesgos firmada y vigente", base: "LOPCYMAT arts. 53.1 y 56.3", ...c.notificacion,
      detalle: "Acuse firmado y puesto sin cambios desde la entrega" }),
    criterio({ clave: "evaluacion", titulo: "Trabajadores con evaluación médica vigente", base: "RLOPCYMAT art. 27", ...c.evaluacion,
      detalle: "Aptitud con vigencia hasta hoy o después", href: "/pacientes" }),
    criterio({ clave: "vigilancia", titulo: "Informes trimestrales de vigilancia epidemiológica", base: "LOPCYMAT art. 40", cumplidos: Math.min(c.informes, trimestres), total: trimestres,
      detalle: `${c.informes} guardados para el período`, href: "/reportes" }),
  ];
  const aplican = criterios.filter((x) => x.estado !== "no_aplica");
  const puntaje = aplican.length ? Math.round((aplican.reduce((s, x) => s + x.cumplidos / x.total, 0) / aplican.length) * 100) : null;
  return { criterios, puntaje };
}

// Pantalla: índice, criterios y quiénes deben la notificación, en dos consultas en paralelo
export async function resumenInspeccion(empresaId: string, desde: string, hasta: string) {
  const r = await conteos(empresaId, desde, hasta);
  if (!r) return null;
  return { empresa: datosEmpresa(r.emp), ...armarCriterios(r.emp, r.c, desde, hasta), pendientes: r.c.pendientes };
}

// Paquete impreso: además de los criterios, las listas completas
export async function datosInspeccion(sesion: Sesion, empresaId: string, desde: string, hasta: string): Promise<DatosInspeccion | null> {
  const supabase = await crearClienteServidor();
  const hoy = hoyCaracas();

  const [r, eventos, trabs, apts, notifs, { data: puestos }, { data: informes }, { data: porPuesto }] = await Promise.all([
    conteos(empresaId, desde, hasta),
    eventosDeEmpresa(empresaId, desde, hasta),
    todas<{ id: string; nombres: string; apellidos: string; cedula: string; puesto_id: string | null; puestos: { nombre: string; evaluado_en: string | null } | null }>((d, h) =>
      supabase.from("trabajadores").select("id, nombres, apellidos, cedula, puesto_id, puestos(nombre, evaluado_en)", { count: "exact" })
        .eq("empresa_id", empresaId).in("estado", ["activo", "reposo"]).order("apellidos").range(d, h)),
    todas<{ trabajador_id: string; vigente_hasta: string | null }>((d, h) =>
      supabase.from("ultima_aptitud").select("trabajador_id, vigente_hasta", { count: "exact" }).eq("empresa_id", empresaId).order("trabajador_id").range(d, h)),
    todas<{ id: string; trabajador_id: string; puesto_id: string | null; entregada_en: string; firmada_en: string | null }>((d, h) =>
      supabase.from("notificaciones_riesgo").select("id, trabajador_id, puesto_id, entregada_en, firmada_en", { count: "exact" })
        .eq("empresa_id", empresaId).order("entregada_en", { ascending: false }).order("creado_en", { ascending: false }).range(d, h)),
    supabase.from("puestos").select("id, nombre, evaluado_en").eq("empresa_id", empresaId).eq("activo", true).order("nombre"),
    supabase.from("informes_vigilancia").select("desde, hasta, actualizado_en").eq("empresa_id", empresaId).gte("hasta", desde).lte("desde", hasta).order("desde"),
    // trabajadores(count) necesita SELECT sobre toda la tabla (sus datos de salud son privados): se cuenta aparte
    supabase.rpc("trabajadores_por_puesto", { p_empresa: empresaId }),
  ]);
  if (!r) return null;

  // El informe de investigación es clínico: solo lo cuenta quien puede verlo
  const enfermedades = eventos.filter((e) => e.tipo === "enfermedad");
  const investigaciones = new Map<string, { id: string; estado: string; terminadoEn: string | null }>();
  if (sesion.clinico && enfermedades.length) {
    const { data } = await supabase.from("investigaciones").select("id, evento_id, estado, terminado_en").in("evento_id", enfermedades.map((e) => e.id));
    for (const i of data ?? []) investigaciones.set(i.evento_id, { id: i.id, estado: i.estado, terminadoEn: i.terminado_en });
  }

  const aptitud = new Map(apts.map((a) => [a.trabajador_id, a.vigente_hasta]));
  const ultimaNotif = new Map<string, (typeof notifs)[number]>();
  for (const n of notifs) if (!ultimaNotif.has(n.trabajador_id)) ultimaNotif.set(n.trabajador_id, n);
  const trabajadores: TrabajadorInspeccion[] = trabs.map((t) => {
    const n = ultimaNotif.get(t.id);
    const hasta = aptitud.get(t.id) ?? null;
    return {
      id: t.id,
      nombre: `${t.apellidos}, ${t.nombres}`,
      cedula: t.cedula,
      puesto: t.puestos?.nombre ?? null,
      aptitudHasta: hasta,
      evaluacionVigente: Boolean(hasta && hasta >= hoy),
      notificacionId: n?.id ?? null,
      notificadoEn: n?.entregada_en ?? null,
      firmadoEn: n?.firmada_en ?? null,
      notificacionVigente: Boolean(n?.firmada_en && t.puesto_id && !desactualizada({ entregadaEn: n.entregada_en, puestoId: n.puesto_id }, { id: t.puesto_id, evaluadoEn: t.puestos?.evaluado_en ?? null })),
    };
  });
  const totalPuesto = new Map(((porPuesto ?? []) as { puesto_id: string; total: number }[]).map((p) => [p.puesto_id, Number(p.total)]));
  const listaPuestos = ((puestos ?? []) as { id: string; nombre: string; evaluado_en: string | null }[])
    .map((p) => ({ id: p.id, nombre: p.nombre, evaluadoEn: p.evaluado_en, trabajadores: totalPuesto.get(p.id) ?? 0 }));
  const { criterios, puntaje } = armarCriterios(r.emp, r.c, desde, hasta);

  return {
    empresa: datosEmpresa(r.emp),
    desde, hasta, criterios, puntaje, eventos, investigaciones, trabajadores, puestos: listaPuestos,
    informes: (informes ?? []).map((i) => ({ desde: i.desde, hasta: i.hasta, actualizadoEn: i.actualizado_en })),
  };
}

// Período por defecto: los últimos 12 meses hasta hoy
export function periodoInspeccion(desde?: string, hasta?: string) {
  const ok = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const h = ok(hasta) ?? hoyCaracas();
  const d = ok(desde) ?? sumarDias(h, -365);
  return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
}
