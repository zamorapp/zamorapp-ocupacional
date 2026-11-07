import { esRolEmpresa, type Rol } from "@/lib/sesion-roles";

// Qué puede hacer cada persona de la empresa en el portal (pedido de Cesar, 06-nov-2026). Lo elige el administrador
// al invitar y en Usuarios y roles. null = todo (así siguen quienes ya estaban). La base lo exige con permiso_portal().
// Las solicitudes de informes o copias siempre quedan permitidas.
export const PERMISOS_PORTAL = [
  { clave: "citas", corto: "Pedir consultas", titulo: "Solicitar consultas", detalle: "Pide citas; cada pedido sale con su orden de evaluación" },
  { clave: "relacion", corto: "Atendidos del mes", titulo: "Ver los atendidos del mes", detalle: "Órdenes, relación mensual y Excel para cotejar la factura" },
  { clave: "descargas", corto: "Descargas", titulo: "Descargar documentos", detalle: "Documentos de las solicitudes e informes de la empresa" },
] as const;

export type PermisoPortal = (typeof PERMISOS_PORTAL)[number]["clave"];
const CLAVES: readonly string[] = PERMISOS_PORTAL.map((p) => p.clave);

// El personal del servicio siempre puede; la empresa según su lista
export function puedePortal(s: { rol: Rol | null; permisos: PermisoPortal[] | null }, permiso: PermisoPortal) {
  return !esRolEmpresa(s.rol) || s.permisos === null || s.permisos.includes(permiso);
}

// Todo marcado = null (sin lista): si mañana se agrega un permiso nuevo, quien tenía todo lo recibe también
export function normalizarPermisos(lista: unknown[]): PermisoPortal[] | null {
  const elegidos = CLAVES.filter((c) => lista.includes(c)) as PermisoPortal[];
  return elegidos.length === CLAVES.length ? null : elegidos;
}
