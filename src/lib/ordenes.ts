import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { hoyCaracas, sumarDias, sumarMeses } from "@/lib/fecha";
import { crearClienteServidor } from "@/lib/supabase/server";

// Orden de evaluación (20261030921000): cada «Solicitar cita» del portal deja una orden numerada con sus trabajadores.
// Relación mensual: lo realizado en el período con su Nº de orden y su nota de cobro/factura, sin datos clínicos.

export type Orden = {
  id: string;
  numero: number;
  empresaId: string;
  empresa: string;
  rif: string;
  creadoEn: string;
  solicitante: string;
  citas: OrdenCita[];
};
export type OrdenCita = {
  id: string;
  fecha: string;
  hora: string | null;
  estado: string;
  paciente: string;
  cedula: string;
  cargo: string | null;
  motivo: string | null;
  nota: string | null;
};
export type FilaRelacion = {
  consultaId: string;
  fecha: string;
  trabajador: string;
  cedula: string;
  cargo: string | null;
  evaluacion: string | null;
  ordenId: string | null;
  orden: number | null;
  notaCobro: number | null;
  estadoCobro: "emitida" | "pagada" | null;
  factura: string | null;
};
export type OrdenResumen = { id: string; numero: number; creadoEn: string; solicitante: string; total: number; atendidas: number; canceladas: number; fecha: string | null };

export const numeroOrden = (n: number) => `OE-${String(n).padStart(5, "0")}`;

// Primer y último día de un mes «AAAA-MM» (el actual si no viene o no es válido)
export function rangoMes(mes?: string | null) {
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes ?? "") ? mes! : hoyCaracas().slice(0, 7);
  const desde = `${m}-01`;
  // Último día: el 1.º del mes siguiente menos un día
  const hasta = sumarDias(sumarMeses(desde, 1), -1);
  return { mes: m, desde, hasta };
}

// La crea la base (solo con citas propias del portal, aún pendientes): una por empresa
export async function crearOrdenes(citas: string[], porTrabajador = false): Promise<{ id: string; numero: number }[]> {
  if (!supabaseConfigurado || !citas.length) return [];
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_orden_evaluacion", { p_citas: citas, p_por_trabajador: porTrabajador });
  if (error) throw error;
  return ((data ?? []) as { id: string; numero: number }[]).map((o) => ({ id: o.id, numero: o.numero }));
}

type FilaCita = {
  id: string; fecha: string; hora: string | null; estado: string; nota_empresa: string | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string; puestos: { nombre: string } | null } | null;
  motivo: { nombre: string } | null;
};

// Una o varias órdenes (las de «una por trabajador» se imprimen juntas): 1 lectura de órdenes + citas en tandas de 100
export async function obtenerOrdenes(ids: string[]): Promise<Orden[]> {
  if (!supabaseConfigurado) return ids.includes(DEMO.id) ? [DEMO] : [];
  const validos = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  if (!validos.length) return [];
  const supabase = await crearClienteServidor();
  const { data: os } = await supabase.from("ordenes_evaluacion")
    .select("id, numero, empresa_id, citas, solicitante, creado_en, empresas(razon_social, rif)").in("id", validos);
  const todas = [...new Set((os ?? []).flatMap((o) => o.citas as string[]))];
  const filas = new Map<string, FilaCita>();
  for (let i = 0; i < todas.length; i += 100) {
    const { data: cs } = await supabase.from("citas")
      .select("id, fecha, hora, estado, nota_empresa, trabajadores(nombres, apellidos, cedula, puestos(nombre)), motivo:lista_items(nombre)")
      .in("id", todas.slice(i, i + 100));
    for (const c of (cs ?? []) as unknown as FilaCita[]) filas.set(c.id, c);
  }
  const posicion = new Map(validos.map((id, i) => [id, i]));
  return (os ?? []).sort((a, b) => (posicion.get(a.id) ?? 0) - (posicion.get(b.id) ?? 0)).map((o) => {
    const emp = o.empresas as unknown as { razon_social: string; rif: string } | null;
    return {
      id: o.id, numero: o.numero, empresaId: o.empresa_id, empresa: emp?.razon_social ?? "", rif: emp?.rif ?? "",
      creadoEn: o.creado_en, solicitante: o.solicitante,
      citas: (o.citas as string[]).map((id) => filas.get(id)).filter((c): c is FilaCita => Boolean(c)).map((c) => ({
        id: c.id, fecha: c.fecha, hora: c.hora?.slice(0, 5) ?? null, estado: c.estado, nota: c.nota_empresa,
        paciente: c.trabajadores ? `${c.trabajadores.nombres} ${c.trabajadores.apellidos}` : "",
        cedula: c.trabajadores?.cedula ?? "", cargo: c.trabajadores?.puestos?.nombre ?? null, motivo: c.motivo?.nombre ?? null,
      })),
    };
  });
}

// Órdenes de una empresa creadas en el período, con cuántas ya se atendieron
export async function listarOrdenes(empresaId: string, desde: string, hasta: string): Promise<OrdenResumen[]> {
  if (!supabaseConfigurado) return DEMO_ORDENES;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("ordenes_evaluacion").select("id, numero, citas, solicitante, creado_en")
    .eq("empresa_id", empresaId)
    .gte("creado_en", `${desde}T00:00:00-04:00`).lte("creado_en", `${hasta}T23:59:59-04:00`)
    .order("numero", { ascending: false }).limit(300);
  const ordenes = data ?? [];
  const ids = [...new Set(ordenes.flatMap((o) => o.citas as string[]))];
  const estados = new Map<string, { estado: string; fecha: string }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: cs } = await supabase.from("citas").select("id, estado, fecha").in("id", ids.slice(i, i + 100));
    for (const c of cs ?? []) estados.set(c.id, { estado: c.estado, fecha: c.fecha });
  }
  return ordenes.map((o) => {
    const cs = (o.citas as string[]).map((c) => estados.get(c)).filter(Boolean) as { estado: string; fecha: string }[];
    return {
      id: o.id, numero: o.numero, creadoEn: o.creado_en, solicitante: o.solicitante, total: (o.citas as string[]).length,
      atendidas: cs.filter((c) => c.estado === "atendido").length,
      canceladas: cs.filter((c) => c.estado === "cancelada" || c.estado === "no_asistio").length,
      fecha: cs.map((c) => c.fecha).sort()[0] ?? null,
    };
  });
}

// Cita → su orden, para las listas (portal y Atención). Órdenes de los últimos 4 meses: las citas abiertas caben ahí
export async function ordenesDeCitas(): Promise<Map<string, { id: string; numero: number }>> {
  const mapa = new Map<string, { id: string; numero: number }>();
  if (!supabaseConfigurado) return mapa;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("ordenes_evaluacion").select("id, numero, citas")
    .gte("creado_en", `${sumarDias(hoyCaracas(), -120)}T00:00:00-04:00`).order("numero", { ascending: false }).limit(500);
  for (const o of data ?? []) for (const c of o.citas as string[]) mapa.set(c, { id: o.id, numero: o.numero });
  return mapa;
}

export async function relacionMensual(empresaId: string, desde: string, hasta: string): Promise<FilaRelacion[]> {
  if (!supabaseConfigurado) return DEMO_RELACION;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("relacion_mensual", { p_empresa: empresaId, p_desde: desde, p_hasta: hasta });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    consultaId: String(f.consulta_id), fecha: String(f.fecha), trabajador: String(f.trabajador ?? ""), cedula: String(f.cedula ?? ""),
    cargo: (f.cargo as string | null) ?? null, evaluacion: (f.evaluacion as string | null) ?? null,
    ordenId: (f.orden_id as string | null) ?? null, orden: (f.orden as number | null) ?? null,
    notaCobro: (f.nota_cobro as number | null) ?? null, estadoCobro: (f.estado_cobro as FilaRelacion["estadoCobro"]) ?? null,
    factura: (f.factura as string | null) ?? null,
  }));
}

// Totales para cotejar: por tipo de evaluación, con y sin orden, facturadas o no
export function resumenRelacion(filas: FilaRelacion[]) {
  const porTipo = new Map<string, number>();
  for (const f of filas) porTipo.set(f.evaluacion ?? "Sin tipo", (porTipo.get(f.evaluacion ?? "Sin tipo") ?? 0) + 1);
  return {
    total: filas.length,
    conOrden: filas.filter((f) => f.orden).length,
    facturadas: filas.filter((f) => f.notaCobro).length,
    porTipo: [...porTipo].sort((a, b) => b[1] - a[1]),
  };
}

// ─── Modo demostración (sin Supabase): para ver las pantallas ───
const DEMO: Orden = {
  id: "demo-orden", numero: 128, empresaId: "demo", empresa: "Construcciones del Oriente, C.A.", rif: "J-40123456-7",
  creadoEn: "2026-11-06T13:20:00-04:00", solicitante: "María Fernández",
  citas: [
    { id: "c1", fecha: "2026-11-10", hora: "08:00", estado: "citado", paciente: "José Rafael Marcano", cedula: "V-18.456.789", cargo: "Operador de grúa", motivo: "Evaluación pre-empleo", nota: "Ingresa el 15-nov" },
    { id: "c2", fecha: "2026-11-10", hora: "08:30", estado: "citado", paciente: "Ana Gabriela Rondón", cedula: "V-24.112.330", cargo: "Asistente administrativo", motivo: "Evaluación pre-empleo", nota: "Ingresa el 15-nov" },
    { id: "c3", fecha: "2026-11-10", hora: "09:00", estado: "solicitada", paciente: "Luis Alberto Salazar", cedula: "V-15.990.214", cargo: "Soldador", motivo: "Evaluación pre-empleo", nota: "Ingresa el 15-nov" },
  ],
};
const DEMO_ORDENES: OrdenResumen[] = [
  { id: "demo-orden", numero: 128, creadoEn: "2026-11-06T13:20:00-04:00", solicitante: "María Fernández", total: 3, atendidas: 0, canceladas: 0, fecha: "2026-11-10" },
  { id: "demo-orden", numero: 121, creadoEn: "2026-11-03T09:05:00-04:00", solicitante: "María Fernández", total: 5, atendidas: 4, canceladas: 1, fecha: "2026-11-04" },
  { id: "demo-orden", numero: 117, creadoEn: "2026-11-01T10:40:00-04:00", solicitante: "Pedro Gil", total: 2, atendidas: 2, canceladas: 0, fecha: "2026-11-02" },
];
const DEMO_RELACION: FilaRelacion[] = [
  { consultaId: "r1", fecha: "2026-11-02", trabajador: "Carlos Eduardo Bello", cedula: "V-12.345.678", cargo: "Supervisor de obra", evaluacion: "Evaluación periódica", ordenId: "demo-orden", orden: 117, notaCobro: 41, estadoCobro: "pagada", factura: "00000312" },
  { consultaId: "r2", fecha: "2026-11-02", trabajador: "Yelitza Coromoto Ruiz", cedula: "V-17.654.321", cargo: "Cocinera", evaluacion: "Evaluación periódica", ordenId: "demo-orden", orden: 117, notaCobro: 41, estadoCobro: "pagada", factura: "00000312" },
  { consultaId: "r3", fecha: "2026-11-04", trabajador: "Pedro José Lugo", cedula: "V-20.111.222", cargo: "Chofer", evaluacion: "Evaluación pre-empleo", ordenId: "demo-orden", orden: 121, notaCobro: 44, estadoCobro: "emitida", factura: null },
  { consultaId: "r4", fecha: "2026-11-04", trabajador: "Rosa María Guevara", cedula: "V-19.333.444", cargo: "Almacenista", evaluacion: "Evaluación pre-empleo", ordenId: "demo-orden", orden: 121, notaCobro: 44, estadoCobro: "emitida", factura: null },
  { consultaId: "r5", fecha: "2026-11-04", trabajador: "Miguel Ángel Tovar", cedula: "V-21.555.666", cargo: "Ayudante", evaluacion: "Evaluación pre-empleo", ordenId: "demo-orden", orden: 121, notaCobro: null, estadoCobro: null, factura: null },
  { consultaId: "r6", fecha: "2026-11-04", trabajador: "Daniel Alfonzo Rivas", cedula: "V-16.777.888", cargo: "Electricista", evaluacion: "Evaluación pre-empleo", ordenId: "demo-orden", orden: 121, notaCobro: null, estadoCobro: null, factura: null },
  { consultaId: "r7", fecha: "2026-11-05", trabajador: "Gregoria Isabel Mata", cedula: "V-14.999.000", cargo: "Secretaria", evaluacion: "Consulta de morbilidad", ordenId: null, orden: null, notaCobro: null, estadoCobro: null, factura: null },
];
