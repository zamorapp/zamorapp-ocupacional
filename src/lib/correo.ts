import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Correo saliente por Gmail (smtp.gmail.com) con una contraseña de aplicación de la cuenta remitente.
// GMAIL_USUARIO y GMAIL_CLAVE_APP viven solo en las variables de entorno (Vercel o el programa de escritorio), nunca en el repo.
export const correoConfigurado = () => Boolean(process.env.GMAIL_USUARIO && process.env.GMAIL_CLAVE_APP);
export const remitente = () => process.env.GMAIL_USUARIO ?? "";

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
