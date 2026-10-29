import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";

// Correo saliente por Gmail (smtp.gmail.com) con una contraseña de aplicación de la cuenta remitente.
// GMAIL_USUARIO y GMAIL_CLAVE_APP viven SOLO en las variables de entorno de Vercel: nunca en el repo ni en el instalador
// del escritorio (allí el correo se encola y lo envía la web).
export const correoConfigurado = () => Boolean(process.env.GMAIL_USUARIO && process.env.GMAIL_CLAVE_APP);
export const remitente = () => process.env.GMAIL_USUARIO ?? "";
// En el escritorio el correo sale igual: queda en cola y lo envía la web (lib/envios.ts, /api/envios/correo)
export const correoDisponible = () => correoConfigurado() || ESCRITORIO;
export const remitenteVisible = () => (correoConfigurado() ? remitente() : ESCRITORIO ? "el correo del servicio (lo envía la web)" : null);

let transporte: Transporter | null = null;
function obtenerTransporte() {
  transporte ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USUARIO, pass: process.env.GMAIL_CLAVE_APP },
  });
  return transporte;
}

export type Adjunto = { nombre: string; contenido: Buffer };

export async function enviarCorreo(m: { para: string; asunto: string; texto: string; nombreRemitente: string; adjuntos: Adjunto[] }) {
  if (!correoConfigurado()) throw new Error("Falta configurar el correo remitente (GMAIL_USUARIO y GMAIL_CLAVE_APP).");
  await obtenerTransporte().sendMail({
    from: { name: m.nombreRemitente, address: remitente() },
    to: m.para,
    subject: m.asunto,
    text: m.texto,
    attachments: m.adjuntos.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: "application/pdf" })),
  });
}
