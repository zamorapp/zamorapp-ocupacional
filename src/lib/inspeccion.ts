import "server-only";
import { eventosDeEmpresa } from "@/lib/eventos";
import type { Evento } from "@/lib/eventos-tipos";
import { desactualizada } from "@/lib/notificacion-riesgos";
import { todas } from "@/lib/paginar";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

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
const hoyVE = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());

function criterio(c: Omit<Criterio, "estado">): Criterio {
  if (!c.total) return { ...c, estado: "no_aplica" };
  const pct = c.cumplidos / c.total;
  return { ...c, estado: pct >= 1 ? "ok" : pct >= 0.8 ? "aviso" : "alerta" };
}

export async function datosInspeccion(sesion: Sesion, empresaId: string, desde: string, hasta: string): Promise<DatosInspeccion | null> {
  const supabase = await crearClienteServidor();
  const { data: emp } = await supabase.from("empresas")
    .select("id, razon_social, rif, nil, actividad_economica, direccion, servicio_sst_tipo, servicio_sst_fecha_registro, psst_fecha_registro")
    .eq("id", empresaId).maybeSingle();
  if (!emp) return null;
  const hoy = hoyVE();

  const [eventos, trabs, apts, notifs, { data: puestos }, { data: informes }, { data: porPuesto }] = await Promise.all([
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
  const conPersonal = listaPuestos.filter((p) => p.trabajadores > 0);

  const declarables = eventos.filter((e) => e.tipo !== "incidente");
  const aTiempo = declarables.filter((e) => {
    const base = Date.parse((e.tipo === "enfermedad" ? e.fechaDiagnostico : null) ?? e.fechaHora);
    return e.fechaDeclaracion && Date.parse(e.fechaDeclaracion) <= base + dia;
  });
  const accidentes = eventos.filter((e) => e.tipo === "accidente");
  const nt02 = enfermedades.filter((e) => e.fechaInformeNt02 && e.fechaDiagnostico
    && Date.parse(e.fechaInformeNt02) <= Date.parse(e.fechaDiagnostico.slice(0, 10)) + (e.enAnexo1 ? 15 : 30) * dia);
  const acciones = eventos.flatMap((e) => e.acciones);
  const accionesAlDia = acciones.filter((a) => a.estado === "cumplida" || !a.fecha || a.fecha >= hoy);
  const trimestres = Math.max(1, Math.floor((Date.parse(hasta) - Date.parse(desde) + dia) / (91 * dia)));

  const criterios = [
    criterio({ clave: "servicio", titulo: "Servicio de Seguridad y Salud en el Trabajo registrado", base: "LOPCYMAT art. 39", cumplidos: emp.servicio_sst_fecha_registro ? 1 : 0, total: 1,
      detalle: emp.servicio_sst_fecha_registro ? `${emp.servicio_sst_tipo ?? "Registrado"} desde el ${emp.servicio_sst_fecha_registro}` : "Falta la fecha de registro en Empresas", href: `/empresas/${empresaId}` }),
    criterio({ clave: "psst", titulo: "Programa de Seguridad y Salud en el Trabajo registrado", base: "LOPCYMAT art. 61; NT-01-2008", cumplidos: emp.psst_fecha_registro ? 1 : 0, total: 1,
      detalle: emp.psst_fecha_registro ? `Registrado el ${emp.psst_fecha_registro}` : "Falta la fecha de registro en Empresas", href: `/empresas/${empresaId}` }),
    criterio({ clave: "declaracion", titulo: "Accidentes y enfermedades declarados en 24 horas", base: "LOPCYMAT art. 73", cumplidos: aTiempo.length, total: declarables.length,
      detalle: declarables.length ? `${declarables.length - aTiempo.length} fuera de plazo o sin declarar` : "Sin eventos en el período", href: "/accidentes" }),
    criterio({ clave: "investigacion", titulo: "Accidentes con causas investigadas", base: "LOPCYMAT art. 40; COVENIN 474", cumplidos: accidentes.filter((e) => e.causasInmediatas || e.causasBasicas).length, total: accidentes.length,
      detalle: accidentes.length ? "Causas inmediatas o básicas registradas" : "Sin accidentes en el período", href: "/accidentes" }),
    criterio({ clave: "nt02", titulo: "Informes de investigación de enfermedad entregados a tiempo", base: "NT-02-2008, Tít. IV, cap. II, 5.2.3", cumplidos: nt02.length, total: enfermedades.length,
      detalle: enfermedades.length ? "15 días si está en el Anexo 1; 30 si no" : "Sin enfermedades en el período", href: "/accidentes" }),
    criterio({ clave: "acciones", titulo: "Acciones correctivas al día", base: "LOPCYMAT art. 56", cumplidos: accionesAlDia.length, total: acciones.length,
      detalle: acciones.length ? `${acciones.length - accionesAlDia.length} vencidas sin cumplir` : "Sin acciones registradas", href: "/accidentes" }),
    criterio({ clave: "puestos", titulo: "Puestos con personal evaluados", base: "NT-02-2008, cap. II, 3.1", cumplidos: conPersonal.filter((p) => p.evaluadoEn).length, total: conPersonal.length,
      detalle: "Evaluación del puesto con matriz de riesgos", href: `/empresas/${empresaId}` }),
    criterio({ clave: "notificacion", titulo: "Trabajadores con notificación de riesgos firmada y vigente", base: "LOPCYMAT arts. 53.1 y 56.3", cumplidos: trabajadores.filter((t) => t.notificacionVigente).length, total: trabajadores.length,
      detalle: "Acuse firmado y puesto sin cambios desde la entrega" }),
    criterio({ clave: "evaluacion", titulo: "Trabajadores con evaluación médica vigente", base: "RLOPCYMAT art. 27", cumplidos: trabajadores.filter((t) => t.evaluacionVigente).length, total: trabajadores.length,
      detalle: "Aptitud con vigencia hasta hoy o después", href: "/pacientes" }),
    criterio({ clave: "vigilancia", titulo: "Informes trimestrales de vigilancia epidemiológica", base: "LOPCYMAT art. 40", cumplidos: Math.min(informes?.length ?? 0, trimestres), total: trimestres,
      detalle: `${informes?.length ?? 0} guardados para el período`, href: "/reportes" }),
  ];
  const aplican = criterios.filter((c) => c.estado !== "no_aplica");
  const puntaje = aplican.length ? Math.round((aplican.reduce((s, c) => s + c.cumplidos / c.total, 0) / aplican.length) * 100) : null;

  return {
    empresa: { id: emp.id, razonSocial: emp.razon_social, rif: emp.rif, nil: emp.nil, actividad: emp.actividad_economica, direccion: emp.direccion, servicioSst: emp.servicio_sst_tipo, servicioSstRegistro: emp.servicio_sst_fecha_registro, psstRegistro: emp.psst_fecha_registro },
    desde, hasta, criterios, puntaje, eventos, investigaciones, trabajadores, puestos: listaPuestos,
    informes: (informes ?? []).map((i) => ({ desde: i.desde, hasta: i.hasta, actualizadoEn: i.actualizado_en })),
  };
}

// Período por defecto: los últimos 12 meses hasta hoy
export function periodoInspeccion(desde?: string, hasta?: string) {
  const ok = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const h = ok(hasta) ?? hoyVE();
  const d = ok(desde) ?? new Date(Date.parse(h) - 365 * dia).toISOString().slice(0, 10);
  return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
}
