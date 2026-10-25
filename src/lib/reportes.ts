import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";

type Conteo = { nombre: string; n: number };

export type Reporte = {
  poblacion: { total: number; femenino: number; masculino: number; por_tipo: Conteo[] };
  consultas: {
    total: number; pacientes: number; preventivas: number; no_preventivas: number; sanos: number;
    por_motivo: (Conteo & { grupo: string | null })[];
    por_tipo: Record<string, number>;
    por_sexo: { F: number; M: number };
    por_edad: { grupo: string; n: number }[];
  };
  morbilidad: {
    total: number;
    por_sistema: Conteo[];
    por_origen: Record<string, number>;
    primeras_causas: { cie10: string; descripcion: string; n: number }[];
  };
  ausentismo: {
    reposos: number; dias_perdidos: number; dias_periodo: number; dias_computables: number;
    por_causa: (Conteo & { dias: number })[];
    por_ente: Conteo[];
  };
  aptitud: Record<string, number>;
};

export type Periodo = { clave: string; desde: string; hasta: string; etiqueta: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Periodos rápidos; "rango" usa desde/hasta de la URL
export function resolverPeriodo(clave = "trimestre", desde?: string, hasta?: string): Periodo {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" }) + "T00:00:00Z");
  const a = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  const trimestre = (anio: number, t: number): Periodo => ({
    clave: "",
    desde: iso(new Date(Date.UTC(anio, t * 3, 1))),
    hasta: iso(new Date(Date.UTC(anio, t * 3 + 3, 0))),
    etiqueta: `${["I", "II", "III", "IV"][t]} trimestre ${anio}`,
  });
  switch (clave) {
    case "mes":
      return { clave, desde: iso(new Date(Date.UTC(a, m, 1))), hasta: iso(new Date(Date.UTC(a, m + 1, 0))), etiqueta: `${MESES[m]} ${a}` };
    case "trimestre_anterior": {
      const t = Math.floor(m / 3) - 1;
      return { ...(t < 0 ? trimestre(a - 1, 3) : trimestre(a, t)), clave };
    }
    case "anio":
      return { clave, desde: `${a}-01-01`, hasta: `${a}-12-31`, etiqueta: `Año ${a}` };
    case "rango":
      if (desde && hasta && desde <= hasta) {
        return { clave, desde, hasta, etiqueta: `${desde.split("-").reverse().join("/")} al ${hasta.split("-").reverse().join("/")}` };
      }
      return resolverPeriodo("trimestre");
    default:
      return { ...trimestre(a, Math.floor(m / 3)), clave: "trimestre" };
  }
}

export async function obtenerReporte(empresaId: string | null, p: Periodo): Promise<Reporte | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reporte_vigilancia", { p_empresa: empresaId, p_desde: p.desde, p_hasta: p.hasta });
  if (error) throw error;
  return data as Reporte;
}

// Promedio de ausentismo diario y % (meta < 2,5 %; pre y postnatal no cuentan)
export function indicadoresAusentismo(r: Reporte) {
  const pad = r.ausentismo.dias_periodo ? r.ausentismo.dias_computables / r.ausentismo.dias_periodo : 0;
  const pct = r.poblacion.total ? (pad * 100) / r.poblacion.total : 0;
  return { pad: Math.round(pad * 100) / 100, pct: Math.round(pct * 100) / 100 };
}

// Hallazgos escritos automáticamente para el resumen ejecutivo
export function resumenEjecutivo(r: Reporte, nombresCausa: Record<string, string>) {
  const frases: string[] = [];
  const { pct } = indicadoresAusentismo(r);
  frases.push(`Se atendieron ${r.consultas.total} consultas a ${r.consultas.pacientes} trabajadores (${r.consultas.preventivas} preventivas y ${r.consultas.no_preventivas} no preventivas).`);
  if (r.morbilidad.primeras_causas[0]) {
    const c = r.morbilidad.primeras_causas[0];
    frases.push(`La primera causa de morbilidad fue ${c.descripcion.toLowerCase()} (${c.cie10}) con ${c.n} ${c.n === 1 ? "caso" : "casos"}.`);
  } else {
    frases.push("No se registraron diagnósticos de morbilidad en el periodo.");
  }
  const ocup = r.morbilidad.por_origen.ocupacional ?? 0;
  const accLab = r.morbilidad.por_origen.accidente_laboral ?? 0;
  frases.push(ocup ? `Se registraron ${ocup} diagnósticos de presunto origen ocupacional que requieren seguimiento.` : "Sin diagnósticos de origen ocupacional.");
  frases.push(accLab ? `Hubo ${accLab} diagnósticos por accidente laboral.` : "Sin accidentes laborales registrados.");
  if (r.ausentismo.reposos) {
    const causa = r.ausentismo.por_causa[0];
    frases.push(
      `Ausentismo de ${pct.toLocaleString("es-VE")} % (${r.ausentismo.dias_perdidos} días perdidos en ${r.ausentismo.reposos} reposos), ${pct < 2.5 ? "dentro" : "por encima"} de la meta de 2,5 %.` +
        (causa ? ` Principal causa: ${(nombresCausa[causa.nombre] ?? causa.nombre).toLowerCase()}.` : ""),
    );
  } else {
    frases.push("Sin reposos en el periodo.");
  }
  return frases;
}

export type Accidentalidad = {
  hht: number;
  meses_con_horas: number;
  hay_estimado: boolean;
  accidentes: number;
  con_tiempo_perdido: number;
  incidentes: number;
  enfermedades: number;
  dias_perdidos: number;
  dias_cargados: number;
  declarados_a_tiempo: number;
  por_declarar: number;
};

export async function obtenerAccidentalidad(empresaId: string | null, p: Periodo): Promise<Accidentalidad | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("indices_accidentalidad", { p_empresa: empresaId, p_desde: p.desde, p_hasta: p.hasta });
  if (error) throw error;
  return data as Accidentalidad;
}

// Índices COVENIN 474 por millón de horas hombre trabajadas; null si no hay horas cargadas
export function indicesCovenin(a: Accidentalidad) {
  const por = (n: number) => (a.hht > 0 ? Math.round(((n * 1_000_000) / a.hht) * 100) / 100 : null);
  const declarables = a.accidentes + a.enfermedades;
  return {
    ifn: por(a.con_tiempo_perdido),
    ifb: por(a.accidentes),
    is: por(a.dias_perdidos + a.dias_cargados),
    tieo: por(a.enfermedades),
    aTiempo: declarables ? Math.round((a.declarados_a_tiempo / declarables) * 100) : null,
  };
}
