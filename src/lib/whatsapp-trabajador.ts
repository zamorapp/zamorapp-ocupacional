// Documentos personales que el servicio médico manda al teléfono del trabajador por WhatsApp (enlace /t/<token>, 7 días).
// Lo usan la barra de impresión (cliente) y la acción del servidor; la base repite las mismas reglas
// (migraciones 20261030891000_enlaces_trabajador.sql y 20261030896000_enlaces_trabajador_paquete.sql).
// Un envío = un enlace con los documentos que el médico marca. Los clínicos (clinico: true) exigen la consulta firmada y
// piden al abrirlos los 4 últimos dígitos de la cédula; las hojas educativas no.
import { telefonoWhatsApp } from "@/lib/envios-tipos";

export const DOCS_TRABAJADOR = {
  recipe: { nombre: "récipe e indicaciones", corto: "Tratamiento (récipe)", clinico: true },
  "informe-trabajador": { nombre: "informe médico", corto: "Informe médico", clinico: true },
  constancia: { nombre: "constancia de aptitud", corto: "Constancia de aptitud", clinico: true },
  atencion: { nombre: "constancia de atención médica", corto: "Constancia de atención", clinico: true },
  reposo: { nombre: "reposo médico", corto: "Reposo médico", clinico: true },
  orden: { nombre: "orden de exámenes", corto: "Orden de exámenes", clinico: true },
  referencia: { nombre: "referencia médica", corto: "Referencia", clinico: true },
  "control-ta": { nombre: "hoja de control de la tensión arterial", corto: "Control de tensión", clinico: false },
  dieta: { nombre: "plan de alimentación", corto: "Plan de alimentación", clinico: false },
  bienestar: { nombre: "hoja de bienestar y pausas activas", corto: "Bienestar y pausas activas", clinico: false },
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

const enLista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export function mensajeTrabajador(nombre: string, servicio: string, docs: DocTrabajador[]) {
  const primerNombre = nombre.trim().split(/\s+/)[0] ?? "";
  const cedula = docs.some((d) => DOCS_TRABAJADOR[d].clinico) ? " Para abrir los documentos médicos te pedirá los 4 últimos dígitos de tu cédula." : "";
  const que = docs.length === 1 ? `tu ${DOCS_TRABAJADOR[docs[0]].nombre}` : `tus documentos: ${enLista(docs.map((d) => DOCS_TRABAJADOR[d].nombre))}`;
  return `Hola ${primerNombre}, ${servicio} te envía ${que}. Ábrelos y guárdalos en tu teléfono (el enlace dura ${DIAS_ENLACE_TRABAJADOR} días).${cedula}`;
}

// Frases que rotan al pie del mensaje (Configuración › Listas › «Frases para el trabajador», migración 20261030907000).
// Cada envío de la organización toma la siguiente en orden; el médico la cambia («Otra frase»), la edita o la quita.
export const LISTA_FRASES = "frase_trabajador";
export const MAX_FRASE = 300;
export const FRASES_POR_TANDA = 12;
export type Frase = { texto: string; autor: string | null };
export const textoFrase = (f: Frase) => `✨ ${f.texto.trim()}${f.autor ? ` (${f.autor.trim()})` : ""}`;
// Posición de la primera frase de la tanda: avanza con cada envío y da la vuelta al llegar al final
export const inicioFrases = (enviados: number, total: number) => (total > 0 ? ((enviados % total) + total) % total : 0);
// Texto final de WhatsApp: saludo, enlace y, si hay, la frase en un párrafo aparte
export function textoWhatsApp(saludo: string, enlace: string, frase?: string) {
  const f = frase?.trim().slice(0, MAX_FRASE);
  return f ? `${saludo} ${enlace}\n\n${f}` : `${saludo} ${enlace}`;
}
// Opciones que el médico eligió en cada hoja de esta consulta (esquemas de dieta, temas, cambios ?c=…): la página de
// impresión las recuerda en este navegador para que, al enviar varios documentos juntos, cada uno salga como lo dejó.
export const claveOpciones = (consultaId: string, tipo: string) => `zamorapp:hoja:${consultaId}:${tipo}`;

export type EnlaceEnviado = {
  id: string;
  paquete: string | null;
  documento: DocTrabajador;
  telefono: string;
  creado: string;
  vence: string;
  anulado: boolean;
  aperturas: number;
  conCambios: boolean;
  fallos: number;
};

// Envío agrupado (un enlace con uno o más documentos)
export type EnvioTrabajador = { paquete: string; telefono: string; creado: string; vence: string; docs: EnlaceEnviado[] };
