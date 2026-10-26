// Mensajes por WhatsApp y correo sin costo: se abren en el WhatsApp o el correo del usuario, listos para enviar.
// Las plantillas se editan en Configuración › Organización; {campo} se reemplaza por el dato.

export const PLANTILLA_CITA =
  "Hola {nombre}, le recordamos su cita en {servicio} el {fecha} a las {hora} ({motivo}). Por favor traiga su cédula. Si no puede asistir, avísenos por esta vía.";
export const PLANTILLA_APTITUD =
  "Buen día. {servicio} informa el resultado de la evaluación {motivo} de {nombre}, C.I. {cedula}, realizada el {fecha}: {aptitud}.{observacion} La constancia se envía adjunta.";

// Leyendas legales de los documentos (las mismas del Integral). Todas se editan en Configuración › Organización.
// Certificación que firma el trabajador al final del informe, la historia y la orden de exámenes
export const CERTIFICACION_TRABAJADOR =
  "Para todos los efectos legales certifico que he sido examinado, que toda la información que suministré es veraz en lo que a mis conocimientos se refiere, que autorizo a la empresa a realizar el tipo de examen médico, de laboratorio clínico y de radiología que considere pertinente y necesario para conocer mi aptitud, y que autorizo que los resultados de mi evaluación médica sean enviados a la coordinación médica de la empresa empleadora.";
// Pie de la constancia de aptitud
export const NOTA_IDONEIDAD = "La clasificación de idoneidad del paciente se basa en el protocolo de evaluación clínica establecido.";
// Certificado de salud (manipuladores de alimentos y otros)
export const NOTA_CERTIFICADO_SACS = "Certificado emitido de acuerdo con la Providencia Administrativa N.º 155-2015 del Servicio Autónomo de Contraloría Sanitaria (SACS), artículo 13.";
// Autorización de exámenes pre-empleo
export const NOTA_PREEMPLEO_VIH = "No incluye prueba de VIH, por resolución del MSAS, Gaceta Oficial N.º 35.538 del 02-09-04.";

export function llenar(plantilla: string, datos: Record<string, string | null | undefined>) {
  return plantilla.replace(/\{(\w+)\}/g, (_, k: string) => datos[k] ?? "").replace(/\s+([.,)])/g, "$1").replace(/\(\s*\)/g, "").trim();
}

// Números de Venezuela: 0414-1234567 → 584141234567. Sin número válido devuelve null.
export function numeroWhatsApp(telefono: string | null | undefined) {
  const primero = (telefono ?? "").split(/[\/,;]/)[0];
  let d = primero.replace(/\D/g, "");
  if (d.startsWith("0")) d = "58" + d.slice(1);
  else if (d.length === 10 && d.startsWith("4")) d = "58" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function enlaceWhatsApp(telefono: string | null | undefined, texto: string) {
  const n = numeroWhatsApp(telefono);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

export function enlaceCorreo(correo: string | null | undefined, asunto: string, cuerpo: string) {
  return `mailto:${encodeURIComponent(correo ?? "")}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

export const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
