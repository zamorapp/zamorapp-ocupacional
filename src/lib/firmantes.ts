// Portada y firmantes del informe de vigilancia: se guardan en informes_vigilancia.firmantes (jsonb).
// Sin dependencias de servidor: lo usan el editor (cliente), la acción que guarda y el impreso.

import { hoyCaracas } from "@/lib/fecha";

export type Persona = { nombre: string; cedula: string; cargo?: string; registro?: string };
export type Firmantes = {
  medico?: Persona;
  /** Servicio de SST: coordinador(a), inspector(es)… */
  servicio?: Persona[];
  /** Antes de la portada de 04-nov había una sola persona del Servicio de SST */
  sst?: Persona;
  delegados?: Persona[];
  representantes?: Persona[];
  /** Antes de la portada había un solo representante del empleador */
  empleador?: Persona;
  autoridad?: string;
  custodio?: string;
  centro_trabajo?: string;
  /** N.º de trabajadores que declara la empresa (p. ej. nómina del centro de trabajo); vacío = la población del período */
  trabajadores?: string;
  /** AAAA-MM-DD; vacía = la fecha en que se guardó el informe (o hoy, si aún no se guardó) */
  fecha_emision?: string;
};

// Custodio del documento por defecto (Cesar, 03-nov): la Gerencia. La autoridad que aprueba sale solo si se escribe.
export const AUTORIDAD = "";
export const CUSTODIO = "Gerencia";
export const DOCUMENTO = "Sistema de Vigilancia Epidemiológica Ocupacional";
export const personaVacia: Persona = { nombre: "", cedula: "", cargo: "", registro: "" };

// Fecha de emisión que sale en la portada y arranca en el editor: la elegida, la del día en que se guardó o la de hoy
// (hoy = hoyCaracas() calculado en el servidor, con la hora anclada a la nube). Nunca queda vacía.
export const fechaEmisionDe = (f: Firmantes, guardadoEn: string | null | undefined, hoy: string) =>
  (f.fecha_emision && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha_emision) ? f.fecha_emision : "") || (guardadoEn ? hoyCaracas(guardadoEn) : hoy);

export const representantesDe = (f: Firmantes): Persona[] => (f.representantes?.length ? f.representantes : f.empleador ? [f.empleador] : []);
export const servicioDe = (f: Firmantes): Persona[] => (f.servicio?.length ? f.servicio : f.sst ? [f.sst] : []);
// Centro de trabajo por defecto: las instalaciones en la dirección de la empresa
export const centroPorDefecto = (direccion: string | null | undefined) => (direccion?.trim() ? `Instalaciones de la empresa ubicadas en ${direccion.trim()}` : "");
// Antes del 04-nov el editor guardaba los valores por defecto de entonces como si fueran elegidos: se tratan como no
// elegidos para que tomen los de ahora (custodio Gerencia, sin autoridad repetida, centro = instalaciones en la dirección)
const CUSTODIO_VIEJO = "Servicio de Seguridad y Salud en el Trabajo";
export function sinDefectosViejos(f: Firmantes, direccion: string | null | undefined): Firmantes {
  const r = { ...f };
  if (r.custodio === CUSTODIO_VIEJO) delete r.custodio;
  if (r.autoridad === "Gerencia") delete r.autoridad;
  if (r.centro_trabajo && direccion && r.centro_trabajo.trim() === direccion.trim()) delete r.centro_trabajo;
  return r;
}

// «75», «75 trabajadores», «1.234» → 75 / 1234; lo demás no se usa
export function trabajadoresDeclarados(v: string | undefined): number | null {
  const n = Number((v ?? "").replace(/[.\s]/g, "").replace(/trabajador(es)?/i, ""));
  return Number.isInteger(n) && n > 0 && n < 1_000_000 ? n : null;
}
export const conNombre = (l: Persona[] | undefined) => (l ?? []).filter((p) => p?.nombre?.trim());

const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const persona = (v: unknown): Persona | undefined => {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const p: Persona = { nombre: texto(o.nombre, 120), cedula: texto(o.cedula, 20), cargo: texto(o.cargo, 120), registro: texto(o.registro, 60) };
  return p.nombre || p.cedula || p.cargo || p.registro ? p : undefined;
};
const lista = (v: unknown) => (Array.isArray(v) ? v.slice(0, 8).map(persona).filter((p): p is Persona => Boolean(p)) : []);

// Lo que llega del navegador se guarda solo con estas claves y con largo acotado
export function limpiarFirmantes(v: unknown): Firmantes {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const fecha = texto(o.fecha_emision, 10);
  const representantes = lista(o.representantes);
  const servicio = lista(o.servicio);
  const trabajadores = trabajadoresDeclarados(texto(o.trabajadores, 20));
  const f: Firmantes = {
    medico: persona(o.medico),
    servicio: servicio.length ? servicio : lista([o.sst]),
    delegados: lista(o.delegados),
    representantes: representantes.length ? representantes : lista([o.empleador]),
    autoridad: texto(o.autoridad, 120),
    custodio: texto(o.custodio, 120),
    centro_trabajo: texto(o.centro_trabajo, 300),
    trabajadores: trabajadores ? String(trabajadores) : "",
    fecha_emision: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "",
  };
  // Sin claves vacías: lo que no se llenó toma el valor por defecto (p. ej. el centro de trabajo, la dirección de la empresa)
  return Object.fromEntries(Object.entries(f).filter(([, x]) => (Array.isArray(x) ? x.length : Boolean(x)))) as Firmantes;
}

type FichaEmpresa = { razonSocial: string; rif: string; nil: string | null; actividad: string | null; direccion: string | null; telefono: string | null };
const n = (x: number) => x.toLocaleString("es-VE");

// Identificación de la empresa en la portada: sale de su ficha (Empresas) y de la población del período; el n.º de
// trabajadores puede declararse a mano en la portada (la nómina del centro puede no coincidir con la población vigilada)
export function datosPortada(e: FichaEmpresa, p: { total: number; femenino: number; masculino: number }, declarados?: string): [string, string | null][] {
  const d = trabajadoresDeclarados(declarados);
  return [
    ["Razón social", e.razonSocial],
    ["RIF", e.rif || null],
    // NIL: opcional (no todas las empresas lo tienen a mano); sale solo si está en la ficha
    ...(e.nil ? ([["NIL", e.nil]] as [string, string][]) : []),
    ["Actividad económica", e.actividad],
    ["Dirección", e.direccion],
    ["Teléfonos", e.telefono],
    ["N.º de trabajadores", d ? `${n(d)} trabajadores` : `${n(p.total)} · mujeres ${n(p.femenino)} · hombres ${n(p.masculino)}`],
  ];
}
