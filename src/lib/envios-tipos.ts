// Tipos y textos del envío de documentos a las empresas (se usan en el navegador y en el servidor)

export const MAX_LOTE = 150;
export const MARCA_FECHA = "[fecha y hora]";

// Texto de Cesar para el correo a la empresa. [fecha y hora] se reemplaza al enviar.
export const MENSAJE_ENVIO =
  "Adjunto las evaluaciones realizadas el día de hoy, [fecha y hora], a los trabajadores. Envío constancia de aptitud y consulta médica. Recuerden resguardar en los expedientes respectivos y la consulta médica en archivos cerrados solo para uso de personal de salud.";

export const ASUNTO_ENVIO = "Evaluaciones médicas · [empresa] · [fecha]";

// Marcas de las plantillas: se reemplazan al enviar
export const MARCAS = [
  { marca: MARCA_FECHA, que: "fecha y hora del envío" },
  { marca: "[empresa]", que: "nombre de la empresa" },
  { marca: "[fecha]", que: "día de las evaluaciones" },
  { marca: "[cantidad]", que: "número de evaluaciones" },
] as const;

export function rellenar(texto: string, v: { fechaHora: string; empresa: string; fecha: string; cantidad: number; documento?: string }) {
  return texto
    .replaceAll("[documento]", v.documento ?? "")
    .replaceAll(MARCA_FECHA, v.fechaHora)
    .replaceAll("[empresa]", v.empresa)
    .replaceAll("[fecha]", v.fecha)
    .replaceAll("[cantidad]", String(v.cantidad));
}

export type Plantilla = {
  id: string;
  empresaId: string | null; // null = para todas las empresas
  nombre: string;
  asunto: string;
  mensaje: string;
  mensajeConstancias: string | null; // para quien no recibe la consulta; null = el mismo sin mencionarla
  predeterminada: boolean;
};

// Plantilla que se propone al abrir el envío: la predeterminada de la empresa, si no la general, si no el texto de fábrica
export function plantillaInicial(plantillas: Plantilla[], empresaId: string): Plantilla {
  return (
    plantillas.find((p) => p.predeterminada && p.empresaId === empresaId) ??
    plantillas.find((p) => p.predeterminada && !p.empresaId) ??
    plantillas[0] ?? { id: "", empresaId: null, nombre: "Texto de fábrica", asunto: ASUNTO_ENVIO, mensaje: MENSAJE_ENVIO, mensajeConstancias: null, predeterminada: true }
  );
}

// Quien no está autorizado a recibir la consulta médica recibe el mismo texto sin mencionarla
export function mensajeSoloConstancias(texto: string) {
  return texto
    .replace(/ y consulta médica/g, "")
    .replace(/ y la consulta médica en archivos cerrados solo para uso de personal de salud/g, "");
}

export type Canal = "correo" | "whatsapp";

// Documentos que salen a la empresa. De cada consulta: constancia de aptitud, consulta médica (informe completo),
// constancia de atención (sin diagnóstico), referencias y récipes. Informes: puesto, vigilancia y atendidos.
export type DocConsulta = "atencion" | "referencia" | "recipe";
export type DocInforme = "puesto" | "vigilancia" | "atendidos";
export const NOMBRE_DOCUMENTO: Record<string, string> = {
  constancia: "Constancias de aptitud",
  consulta: "Consultas médicas",
  atencion: "Constancias de atención",
  referencia: "Referencias médicas",
  recipe: "Récipes",
  puesto: "Evaluación del puesto de trabajo",
  vigilancia: "Vigilancia epidemiológica",
  atendidos: "Pacientes atendidos",
};
const CORTO: Record<string, string> = { constancia: "constancias", consulta: "consulta médica", atencion: "constancias de atención", referencia: "referencias", recipe: "récipes" };
// «3 evaluaciones del 28/10 · constancias y consulta médica» o, si es un informe, su nombre
export function describirEnvio(documentos: string[], cantidad: number, fechaLote: string) {
  if (cantidad === 0) return NOMBRE_DOCUMENTO[documentos[0]] ?? documentos[0];
  return `${cantidad} evaluación${cantidad === 1 ? "" : "es"} del ${fechaLote.split("-").reverse().join("/")} · ${documentos.map((d) => CORTO[d] ?? d).join(" y ")}`;
}

// Llevan datos clínicos: solo por correo y solo al personal de salud autorizado de la empresa (lo exige la base)
export const DOCS_CLINICOS = ["consulta", "referencia", "recipe"];
// Texto de los informes: el mismo cierre de Cesar («resguardar en los expedientes respectivos»)
export const MENSAJE_INFORME = "Adjunto [documento] de [empresa], enviado el [fecha y hora]. Recuerden resguardarlo en los expedientes respectivos.";
export const ASUNTO_INFORME = "[documento] · [empresa]";

export type EntradaInforme = {
  empresaId: string;
  documento: DocInforme;
  ruta: string; // la página del informe (/imprimir/…); la base exige que sea de esa empresa
  contactoIds: string[];
  correosExtra: string[];
  telefonosExtra: string[];
  canal: Canal;
  asunto: string;
  mensaje: string;
};

export type ConsultaLote = {
  id: string;
  hora: string;
  paciente: string;
  cedula: string;
  motivo: string | null;
  firmada: boolean;
  aptitud: string | null;
  enviada: boolean; // ya salió por correo o enlace en este lote
};

export type Contacto = {
  id: string;
  nombre: string;
  cargo: string | null;
  correo: string | null;
  telefono: string | null;
  recibeConsulta: boolean;
};

export type EnvioHistorial = {
  id: string;
  creadoEn: string;
  fechaLote: string;
  canal: Canal;
  destinatario: string;
  documentos: string[];
  cantidad: number;
  estado: "en_cola" | "enviando" | "enviado" | "fallido" | "enlace";
  error: string | null;
  enlace: { vence: string; revocado: boolean; aperturas: number } | null;
  reintentoDe: string | null;
};

// Fila de la bitácora (todas las empresas)
export type FilaBitacora = EnvioHistorial & {
  empresaId: string;
  empresa: string;
  asunto: string;
  enviadoPor: string | null;
  reintentado: boolean; // ya tiene un reintento
  reintentable: boolean; // correo fallido o sin confirmar hace más de 10 min, sin reintento
};

export const ESPERA_SIN_CONFIRMAR_MIN = 10;

export type EntradaEnvio = {
  empresaId: string;
  fecha: string;
  consultaIds: string[];
  contactoIds: string[];
  correosExtra: string[]; // escritos a mano: solo constancias
  telefonosExtra: string[];
  canal: Canal;
  incluirConsulta: boolean;
  extras?: DocConsulta[]; // constancia de atención (a todos); referencias y récipes (solo con la consulta, al personal de salud)
  mensaje: string;
  asunto?: string; // con marcas; vacío = el de fábrica
  mensajeConstancias?: string | null; // para quien no recibe la consulta; vacío = el mensaje sin mencionarla
};

export type ResultadoEnvio = {
  ok: boolean;
  mensaje: string;
  detalle?: { destinatario: string; estado: "enviado" | "fallido" | "enlace" | "en_cola"; error?: string }[];
  enlaces?: { nombre: string; whatsapp: string }[];
};

// 0414-123.45.67 → 584141234567 (Venezuela por defecto)
export function telefonoWhatsApp(t: string) {
  const d = t.replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) return "58" + d.slice(1);
  if (d.length === 10 && d.startsWith("4")) return "58" + d;
  return d;
}

export const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Bandeja «Por enviar»: constancias firmadas que aún no salieron, por empresa y día
export type GrupoPorEnviar = {
  empresaId: string;
  empresa: string;
  fecha: string;
  consultas: { id: string; paciente: string; aptitud: string }[];
  contactos: Contacto[]; // de la empresa, con teléfono o correo
};
