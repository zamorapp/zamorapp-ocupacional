// Portada y firmantes del informe de vigilancia: se guardan en informes_vigilancia.firmantes (jsonb).
// Sin dependencias de servidor: lo usan el editor (cliente), la acción que guarda y el impreso.

export type Persona = { nombre: string; cedula: string; cargo?: string; registro?: string };
export type Firmantes = {
  medico?: Persona;
  sst?: Persona;
  delegados?: Persona[];
  representantes?: Persona[];
  /** Antes de la portada había un solo representante del empleador */
  empleador?: Persona;
  autoridad?: string;
  custodio?: string;
  centro_trabajo?: string;
  /** AAAA-MM-DD; vacía = la fecha en que se guardó el informe */
  fecha_emision?: string;
};

export const AUTORIDAD = "Gerencia";
export const CUSTODIO = "Servicio de Seguridad y Salud en el Trabajo";
export const personaVacia: Persona = { nombre: "", cedula: "", cargo: "", registro: "" };

export const representantesDe = (f: Firmantes): Persona[] => (f.representantes?.length ? f.representantes : f.empleador ? [f.empleador] : []);
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
  const f: Firmantes = {
    medico: persona(o.medico),
    sst: persona(o.sst),
    delegados: lista(o.delegados),
    representantes: representantes.length ? representantes : lista([o.empleador]),
    autoridad: texto(o.autoridad, 120),
    custodio: texto(o.custodio, 120),
    centro_trabajo: texto(o.centro_trabajo, 300),
    fecha_emision: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "",
  };
  // Sin claves vacías: lo que no se llenó toma el valor por defecto (p. ej. el centro de trabajo, la dirección de la empresa)
  return Object.fromEntries(Object.entries(f).filter(([, x]) => (Array.isArray(x) ? x.length : Boolean(x)))) as Firmantes;
}

type FichaEmpresa = { razonSocial: string; rif: string; nil: string | null; actividad: string | null; direccion: string | null; telefono: string | null };
const n = (x: number) => x.toLocaleString("es-VE");

// Identificación de la empresa en la portada: sale de su ficha (Empresas) y de la población del período
export function datosPortada(e: FichaEmpresa, p: { total: number; femenino: number; masculino: number }): [string, string | null][] {
  return [
    ["Razón social", e.razonSocial],
    ["RIF", e.rif || null],
    ["NIL", e.nil],
    ["Actividad económica", e.actividad],
    ["Dirección", e.direccion],
    ["Teléfonos", e.telefono],
    ["N.º de trabajadores", `${n(p.total)} · mujeres ${n(p.femenino)} · hombres ${n(p.masculino)}`],
  ];
}
