// Documentos personales que el servicio médico manda al teléfono del trabajador por WhatsApp (enlace /t/<token>, 7 días).
// Lo usan la barra de impresión (cliente) y la acción del servidor; la base repite las mismas reglas
// (migración 20261030891000_enlaces_trabajador.sql).
import { telefonoWhatsApp } from "@/lib/envios-tipos";

export const DOCS_TRABAJADOR = {
  recipe: { nombre: "récipe e indicaciones", firmada: true },
  orden: { nombre: "orden de exámenes", firmada: true },
  referencia: { nombre: "referencia médica", firmada: true },
  "informe-trabajador": { nombre: "informe médico", firmada: true },
  atencion: { nombre: "constancia de atención médica", firmada: true },
  "control-ta": { nombre: "hoja de control de la tensión arterial", firmada: false },
  dieta: { nombre: "plan de alimentación", firmada: false },
  bienestar: { nombre: "hoja de bienestar y pausas activas", firmada: false },
} as const;
export type DocTrabajador = keyof typeof DOCS_TRABAJADOR;
export const esDocTrabajador = (t: string): t is DocTrabajador => Object.hasOwn(DOCS_TRABAJADOR, t);

export const DIAS_ENLACE_TRABAJADOR = 7;

// Opciones de la página que viajan al PDF (lo que el médico eligió en pantalla). Solo claves conocidas y valores simples:
// la ruta la vuelve a validar la base.
// c = textos que el médico editó en la hoja (dieta, bienestar), codificados por la propia hoja (#256)
const CLAVES: Record<string, RegExp> = {
  dx: /^[A-Za-z0-9,._-]{1,120}$/,
  sin: /^[A-Za-z0-9,._-]{1,120}$/,
  dias: /^[A-Za-z0-9,._-]{1,120}$/,
  plan: /^[A-Za-z0-9,._-]{1,120}$/,
  dieta: /^[A-Za-z0-9,._-]{1,120}$/,
  tema: /^[A-Za-z0-9,._-]{1,120}$/,
  c: /^[A-Za-z0-9_-]{1,8000}$/,
};
export function consultaSegura(busqueda: string): string {
  const entrada = new URLSearchParams(busqueda);
  const salida = new URLSearchParams();
  for (const [c, patron] of Object.entries(CLAVES)) {
    const v = entrada.get(c);
    if (v && patron.test(v)) salida.set(c, v);
  }
  const q = salida.toString();
  return q ? `?${q}` : "";
}

// Celular venezolano (0414…, 414…, +58 414…) o internacional con código de país; null si no sirve para WhatsApp
export function telefonoTrabajador(t: string | null | undefined): string | null {
  if (!t) return null;
  const d = telefonoWhatsApp(t);
  if (d.startsWith("58")) return /^58[24]\d{9}$/.test(d) ? d : null;
  return /^[1-9]\d{9,14}$/.test(d) ? d : null;
}

export const mostrarTelefono = (d: string) => (d.startsWith("58") && d.length === 12 ? `0${d.slice(2, 5)}-${d.slice(5)}` : `+${d}`);

export function mensajeTrabajador(nombre: string, servicio: string, doc: DocTrabajador) {
  const primerNombre = nombre.trim().split(/\s+/)[0] ?? "";
  return `Hola ${primerNombre}, ${servicio} te envía tu ${DOCS_TRABAJADOR[doc].nombre}. Ábrelo y guárdalo en tu teléfono (el enlace dura ${DIAS_ENLACE_TRABAJADOR} días):`;
}

export type EnlaceEnviado = {
  id: string;
  documento: DocTrabajador;
  telefono: string;
  creado: string;
  vence: string;
  anulado: boolean;
  aperturas: number;
  conCambios: boolean;
};
