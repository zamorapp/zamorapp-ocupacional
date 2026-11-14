import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { Atencion, Cobro, PagoCobro, Servicio, SugerenciaCobro } from "@/lib/facturacion-tipos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas } from "@/lib/fecha";
import { tasaParaFecha } from "@/lib/tasa-bcv";

export async function listarServicios(soloActivos = false): Promise<Servicio[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  let q = supabase.from("servicios").select("*").order("orden").order("nombre");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q;
  return (data ?? []).map((s) => ({
    id: s.id,
    codigo: s.codigo ?? "",
    nombre: s.nombre,
    categoria: s.categoria,
    unidad: s.unidad,
    precioUsd: Number(s.precio_usd),
    motivos: s.motivos ?? "",
    activo: s.activo,
  }));
}

// Precios especiales de una empresa: servicio_id → precio
export async function preciosEmpresa(empresaId: string): Promise<Record<string, number>> {
  if (!supabaseConfigurado) return {};
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("precios_empresa").select("servicio_id, precio_usd").eq("empresa_id", empresaId);
  return Object.fromEntries((data ?? []).map((p) => [p.servicio_id, Number(p.precio_usd)]));
}

export type TasaGuardada = { fecha: string; tasa: number; fuente: "manual" | "bcv" | "respaldo" };

// Historial de tasas BCV desde una fecha (la que rige en un día es la de esa fecha o la anterior más cercana)
export async function tasasBcv(desde: string): Promise<TasaGuardada[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  // Una antes de «desde» para cubrir el primer día (fin de semana o feriado)
  const [{ data: previa }, { data }] = await Promise.all([
    supabase.from("tasas_bcv").select("fecha, tasa, fuente").lt("fecha", desde).order("fecha", { ascending: false }).limit(1),
    supabase.from("tasas_bcv").select("fecha, tasa, fuente").gte("fecha", desde).order("fecha"),
  ]);
  return [...(previa ?? []), ...(data ?? [])].map((t) => ({ fecha: t.fecha, tasa: Number(t.tasa), fuente: (t.fuente ?? "manual") as TasaGuardada["fuente"] }));
}

// La tasa que rige HOY (nunca la de mañana, que el BCV publica en la tarde) y, si ya está, la de mañana
export async function tasaVigente(): Promise<TasaGuardada | null> {
  return (await tasasDeHoy()).hoy;
}

export async function tasasDeHoy(): Promise<{ hoy: TasaGuardada | null; proxima: TasaGuardada | null }> {
  const hoy = hoyCaracas();
  const tasas = await tasasBcv(hoy);
  return { hoy: tasaParaFecha(tasas, hoy), proxima: tasas.find((t) => t.fecha > hoy) ?? null };
}

export async function listarAtenciones(empresaId: string | null, desde: string, hasta: string): Promise<Atencion[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("atenciones")
    .select("id, trabajador_id, fecha, estado, paciente, cedula, cargo, motivo, motivo_codigo, aptitud, cobro_id")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .neq("estado", "borrador")
    .order("fecha")
    .order("paciente")
    .limit(5000);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    trabajadorId: a.trabajador_id,
    fecha: a.fecha,
    estado: a.estado,
    paciente: a.paciente,
    cedula: a.cedula,
    cargo: a.cargo,
    motivo: a.motivo,
    motivoCodigo: a.motivo_codigo,
    aptitud: a.aptitud,
    cobroId: a.cobro_id,
  }));
}

type FilaCobro = Record<string, unknown> & { empresas: { razon_social: string; rif: string } | null; cobro_items?: Record<string, unknown>[]; cobro_pagos?: Record<string, unknown>[] };

function aCobro(c: FilaCobro): Cobro {
  return {
    id: c.id as string,
    numero: c.numero as number,
    empresaId: c.empresa_id as string,
    empresa: c.empresas?.razon_social ?? "",
    rif: c.empresas?.rif ?? "",
    fecha: c.fecha as string,
    desde: (c.desde as string | null) ?? null,
    hasta: (c.hasta as string | null) ?? null,
    estado: c.estado as Cobro["estado"],
    tasaBcv: c.tasa_bcv === null ? null : Number(c.tasa_bcv),
    ivaPct: Number(c.iva_pct),
    igtfPct: Number(c.igtf_pct),
    observacion: (c.observacion as string | null) ?? "",
    numeroFacturaFiscal: (c.numero_factura_fiscal as string | null) ?? "",
    fechaPago: (c.fecha_pago as string | null) ?? null,
    tipo: ((c.tipo as string | null) ?? "cobro") as Cobro["tipo"],
    vence: (c.vence as string | null) ?? null,
    presupuestoId: (c.presupuesto_id as string | null) ?? null,
    items: (c.cobro_items ?? [])
      .sort((a, b) => (a.orden as number) - (b.orden as number))
      .map((i) => ({
        id: i.id as string,
        servicioId: (i.servicio_id as string | null) ?? null,
        consultaId: (i.consulta_id as string | null) ?? null,
        descripcion: i.descripcion as string,
        detalle: (i.detalle as string | null) ?? "",
        cantidad: Number(i.cantidad),
        precioUsd: Number(i.precio_usd),
      })),
    pagos: (c.cobro_pagos ?? [])
      .map((p) => ({
        id: (p.id as string) ?? "",
        fecha: (p.fecha as string) ?? "",
        metodo: ((p.metodo as string) ?? "otro") as PagoCobro["metodo"],
        referencia: (p.referencia as string | null) ?? "",
        montoUsd: Number(p.monto_usd),
        tasaBcv: p.tasa_bcv == null ? null : Number(p.tasa_bcv),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

export async function listarCobros(): Promise<Cobro[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("cobros")
    .select("*, empresas(razon_social, rif), cobro_items(cantidad, precio_usd, orden), cobro_pagos(monto_usd, fecha)")
    .order("numero", { ascending: false })
    .limit(300);
  return ((data ?? []) as unknown as FilaCobro[]).map(aCobro);
}

export async function obtenerCobro(id: string): Promise<Cobro | null> {
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("cobros").select("*, empresas(razon_social, rif), cobro_items(*), cobro_pagos(*)").eq("id", id).maybeSingle();
  return data ? aCobro(data as unknown as FilaCobro) : null;
}

// Motivos de consulta con su código, para elegir con casillas cuáles cobra solo cada servicio
export async function listarMotivosCobro(): Promise<{ codigo: string; nombre: string }[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("lista_items").select("codigo, nombre").eq("lista", "motivo_consulta").eq("activo", true).not("org_id", "is", null).not("codigo", "is", null).order("nombre");
  const vistos = new Set<string>();
  return (data ?? []).flatMap((m) => {
    const codigo = String(m.codigo).trim().toUpperCase();
    if (!codigo || vistos.has(codigo)) return [];
    vistos.add(codigo);
    return [{ codigo, nombre: m.nombre as string }];
  });
}

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const fechaVe = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const METODO_ERGO: Record<string, string> = { rula: "RULA", reba: "REBA", rosa: "ROSA", niosh: "NIOSH", deb: "DEB", ocra: "OCRA", kim: "KIM", libre: "inspección" };

// Lo hecho para la empresa en el período (además de las consultas) que todavía no está en una nota de cobro.
// Vigilancia: la del trimestre que termina en el período o que se preparó en el período. Cada consulta que falle
// (por ejemplo, un rol que no puede leer esa tabla) simplemente no propone nada.
export async function sugerenciasCobro(empresaId: string, desde: string, hasta: string): Promise<SugerenciaCobro[]> {
  // Las fechas van dentro de un filtro .or() de PostgREST: solo AAAA-MM-DD
  if (!supabaseConfigurado || !ISO_DIA.test(desde) || !ISO_DIA.test(hasta)) return [];
  const supabase = await crearClienteServidor();
  // Límites del período en hora de Caracas (UTC-4) para las columnas con hora
  const ini = `${desde}T04:00:00Z`, fin = `${hasta}T23:59:59-04:00`;
  const [vig, ergo, ries, psico, cobrado] = await Promise.all([
    supabase.from("informes_vigilancia").select("id, desde, hasta, creado_en").eq("empresa_id", empresaId)
      .or(`and(hasta.gte.${desde},hasta.lte.${hasta}),and(creado_en.gte."${ini}",creado_en.lte."${fin}")`).limit(20),
    supabase.from("evaluaciones_ergonomicas").select("id, puesto, metodo, fecha").eq("empresa_id", empresaId).gte("fecha", desde).lte("fecha", hasta).limit(100),
    supabase.from("evaluaciones_riesgos").select("id, titulo, fecha").eq("empresa_id", empresaId).gte("fecha", desde).lte("fecha", hasta).limit(100),
    supabase.from("evaluaciones_psicosociales").select("id, titulo, inicio").eq("empresa_id", empresaId).gte("inicio", desde).lte("inicio", hasta).limit(50),
    // Detalles ya cobrados a esta empresa (notas no anuladas)
    supabase.from("cobro_items").select("detalle, cobros!inner(empresa_id, estado, tipo)").eq("cobros.empresa_id", empresaId).neq("cobros.estado", "anulada").eq("cobros.tipo", "cobro").not("detalle", "is", null).limit(5000),
  ]);
  const ya = new Set((cobrado.data ?? []).map((i) => String(i.detalle)));
  const out: SugerenciaCobro[] = [];
  for (const v of vig.data ?? []) out.push({ clave: `vig:${v.id}`, categoria: "informe", titulo: "Informe de vigilancia epidemiológica", detalle: `Vigilancia epidemiológica del ${fechaVe(v.desde)} al ${fechaVe(v.hasta)}`, fecha: v.hasta });
  for (const e of ergo.data ?? []) out.push({ clave: `ergo:${e.id}`, categoria: "evaluacion_puesto", titulo: "Evaluación ergonómica de puesto", detalle: `Puesto ${e.puesto ?? "sin nombre"} (${METODO_ERGO[e.metodo] ?? e.metodo}) · ${fechaVe(e.fecha)}`, fecha: e.fecha });
  for (const r of ries.data ?? []) out.push({ clave: `ries:${r.id}`, categoria: "evaluacion_puesto", titulo: "Evaluación de riesgos del puesto", detalle: `${r.titulo} · ${fechaVe(r.fecha)}`, fecha: r.fecha });
  for (const p of psico.data ?? []) out.push({ clave: `psico:${p.id}`, categoria: "evaluacion_puesto", titulo: "Evaluación de riesgos psicosociales", detalle: `${p.titulo} · ${fechaVe(p.inicio)}`, fecha: p.inicio });
  return out.filter((x) => !ya.has(x.detalle)).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
