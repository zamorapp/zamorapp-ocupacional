// Mensajes por WhatsApp y correo sin costo: se abren en el WhatsApp o el correo del usuario, listos para enviar.
// Las plantillas se editan en Configuración › Organización; {campo} se reemplaza por el dato.

export const PLANTILLA_CITA =
  "Hola {nombre}, le recordamos su cita en {servicio} el {fecha} a las {hora} ({motivo}). Por favor traiga su cédula. Si no puede asistir, avísenos por esta vía.";
export const PLANTILLA_APTITUD =
  "Buen día. {servicio} informa el resultado de la evaluación {motivo} de {nombre}, C.I. {cedula}, realizada el {fecha}: {aptitud}.{observacion} La constancia se envía adjunta.";

// Texto que firma el trabajador al final del informe de consulta (editable en Configuración › Organización)
export const CERTIFICACION_TRABAJADOR =
  "Certifico que he sido examinado, que la información que suministré es veraz y que autorizo a la empresa a realizar los exámenes médicos, de laboratorio y de radiología que considere pertinentes, y a conocer el resultado de mi evaluación médica.";

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
