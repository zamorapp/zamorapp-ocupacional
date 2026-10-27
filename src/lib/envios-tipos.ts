// Tipos y textos del envío de documentos a las empresas (se usan en el navegador y en el servidor)

export const MAX_LOTE = 150;
export const MARCA_FECHA = "[fecha y hora]";

// Texto de Cesar para el correo a la empresa. [fecha y hora] se reemplaza al enviar.
export const MENSAJE_ENVIO =
  "Adjunto las evaluaciones realizadas el día de hoy, [fecha y hora], a los trabajadores. Envío constancia de aptitud y consulta médica. Recuerden resguardar en los expedientes respectivos y la consulta médica en archivos cerrados solo para uso de personal de salud.";

// Quien no está autorizado a recibir la consulta médica recibe el mismo texto sin mencionarla
export function mensajeSoloConstancias(texto: string) {
  return texto
    .replace(/ y consulta médica/g, "")
    .replace(/ y la consulta médica en archivos cerrados solo para uso de personal de salud/g, "");
}

export type Canal = "correo" | "whatsapp";

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
  estado: "enviando" | "enviado" | "fallido" | "enlace";
  error: string | null;
  enlace: { vence: string; revocado: boolean; aperturas: number } | null;
};

export type EntradaEnvio = {
  empresaId: string;
  fecha: string;
  consultaIds: string[];
  contactoIds: string[];
  correosExtra: string[]; // escritos a mano: solo constancias
  telefonosExtra: string[];
  canal: Canal;
  incluirConsulta: boolean;
  mensaje: string;
};

export type ResultadoEnvio = {
  ok: boolean;
  mensaje: string;
  detalle?: { destinatario: string; estado: "enviado" | "fallido" | "enlace"; error?: string }[];
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
