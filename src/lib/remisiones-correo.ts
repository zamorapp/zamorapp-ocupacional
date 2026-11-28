import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PDFPage } from "pdf-lib";
import { correoConfigurado, enviarCorreo } from "@/lib/correo";

export const UUID_REMISION = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

type Orden = {
  destino: string;
  prestador: string;
  fecha: string;
  servicio: string;
  paciente: string;
  cedula: string;
  medico: string | null;
  mpps: string | null;
  examenes: string[];
};

async function pdfOrden(id: string, orden: Orden) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const caracteres = new Set(normal.getCharacterSet());
  const textoPDF = (valor: string) => Array.from(valor.normalize("NFC").replace(/\s+/g, " "), (c) =>
    caracteres.has(c.codePointAt(0)!) ? c : "?"
  ).join("");
  let pagina: PDFPage;
  let y = 0;

  function hoja() {
    pagina = doc.addPage([595, 842]);
    y = 790;
  }

  function escribir(valor: string, titulo = false) {
    const fuente = titulo ? negrita : normal;
    const tamano = titulo ? 15 : 11;
    let linea = "";
    function pintar() {
      if (y < 52) hoja();
      pagina.drawText(linea, { font: fuente, size: tamano, x: 50, y });
      y -= tamano + 8;
      linea = "";
    }
    for (const caracter of textoPDF(valor)) {
      if (linea && fuente.widthOfTextAtSize(linea + caracter, tamano) > 490) pintar();
      linea += caracter;
    }
    pintar();
  }

  hoja();
  escribir(orden.servicio);
  escribir("Orden para prestador", true);
  escribir("Referencia " + id.slice(0, 8).toUpperCase() + " · " + orden.fecha);
  escribir("Prestador: " + orden.prestador);
  escribir("Paciente: " + orden.paciente);
  escribir("Cédula: " + orden.cedula);
  escribir("Exámenes solicitados", true);
  orden.examenes.forEach((nombre) => escribir("• " + nombre));
  if (orden.medico) escribir("Profesional tratante: " + orden.medico);
  if (orden.mpps) escribir("Registro MPPS: " + orden.mpps);
  return Buffer.from(await doc.save());
}

export type SolicitudCorreoRemision = { id: string; consulta: string; destino: string };

export function esSolicitudCorreoRemision(valor: unknown): valor is SolicitudCorreoRemision {
  if (!valor || typeof valor !== "object") return false;
  const d = valor as Partial<SolicitudCorreoRemision>;
  return typeof d.id === "string" && UUID_REMISION.test(d.id)
    && typeof d.consulta === "string" && UUID_REMISION.test(d.consulta)
    && typeof d.destino === "string" && d.destino.length <= 254;
}

export async function enviarCorreoRemision(sesion: SupabaseClient, solicitud: SolicitudCorreoRemision, usuario?: string) {
  const llave = process.env.ZAMORAPP_PRESTADORES_SERVICE_ROLE;
  if (process.env.ZAMORAPP_ENVIO_PRESTADORES !== "1" || !llave || !correoConfigurado()) {
    return { status: 503, mensaje: "El correo a prestadores aún no está habilitado." };
  }
  const uid = usuario ?? (await sesion.auth.getUser()).data.user?.id;
  if (!uid) return { status: 401, mensaje: "Vuelve a iniciar sesión para enviar la orden." };
  const { data: estado, error } = await sesion.rpc("estado_correo_remisiones", { p_consulta: solicitud.consulta });
  if (error || !Array.isArray(estado) || !estado.some((r) => r.id === solicitud.id && r.destino === solicitud.destino && r.estado === null)) {
    return { status: 409, mensaje: "La orden o el destinatario cambió. Actualiza la página antes de enviar." };
  }
  const servidor = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, llave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const intento = randomUUID();
  const { data, error: rechazada } = await servidor.rpc("tomar_correo_remision", {
    p_id: solicitud.id, p_destino: solicitud.destino, p_intento: intento, p_usuario: uid,
  });
  if (rechazada || !data) return { status: 409, mensaje: "La orden cambió o ya tiene un envío. Actualiza la página." };

  const orden = data as Orden;
  let enviado = false;
  try {
    const contenido = await pdfOrden(solicitud.id, orden);
    await enviarCorreo({
      para: orden.destino,
      asunto: "Orden de exámenes " + solicitud.id.slice(0, 8).toUpperCase(),
      texto: "Se adjunta la orden seleccionada por el servicio médico.",
      nombreRemitente: orden.servicio,
      adjuntos: [{ nombre: "orden-de-examenes.pdf", contenido }],
    });
    enviado = true;
  } catch {
    // SMTP puede aceptar el mensaje y perderse la respuesta. La comprobación manual evita duplicarlo.
  }
  const { data: cerrado } = await servidor.rpc("cerrar_correo_remision", {
    p_id: solicitud.id, p_intento: intento, p_estado: enviado ? "enviado" : "por_confirmar",
  });
  if (!enviado || !cerrado) {
    return { status: 502, mensaje: "No se pudo confirmar el envío. Verifica la entrega antes de registrarla manualmente." };
  }
  return { status: 200, mensaje: "Orden enviada por correo." };
}
