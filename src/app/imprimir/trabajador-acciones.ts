"use server";

import { createHash, randomBytes } from "node:crypto";
import { REQUIERE_INTERNET_WHATSAPP, subirAhora } from "@/lib/envios";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { ahora } from "@/lib/fecha";
import { pdfDeRutas } from "@/lib/pdf-servidor";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  consultaSegura,
  DOCS_TRABAJADOR,
  esDocTrabajador,
  mensajeTrabajador,
  telefonoTrabajador,
  type EnlaceEnviado,
} from "@/lib/whatsapp-trabajador";

// «WhatsApp al trabajador» en la barra de impresión: el PDF de esta misma página (con las opciones elegidas) se guarda
// tras un enlace de 7 días y sale un wa.me listo para el teléfono del trabajador. Todo con la sesión del médico:
// la RLS y el trigger de enlaces_trabajador validan que sea personal de salud, la consulta, la ruta y la firma.

const URL_PUBLICA = (process.env.ZAMORAPP_URL_PUBLICA || "https://zamorapp-ocupacional.vercel.app").replace(/\/$/, "");
const hex = (b: Buffer) => "\\x" + b.toString("hex");

type Trabajador = { id: string; nombres: string; apellidos: string; telefono: string | null };
type Consulta = { id: string; org_id: string; estado: string; trabajador_id: string; trabajadores: Trabajador | null };

async function cargar(consultaId: string) {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "No disponible en modo demo." } as const;
  if (!sesion.clinico) return { error: "Solo el personal de salud envía documentos al trabajador." } as const;
  if (!/^[0-9a-f-]{36}$/i.test(consultaId)) return { error: "Consulta no válida." } as const;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("consultas")
    .select("id, org_id, estado, trabajador_id, trabajadores(id, nombres, apellidos, telefono)")
    .eq("id", consultaId)
    .maybeSingle();
  const consulta = data as unknown as Consulta | null;
  if (!consulta?.trabajadores) return { error: "Consulta no encontrada." } as const;
  return { sesion, supabase, consulta, trabajador: consulta.trabajadores } as const;
}

export type DatosWhatsAppTrabajador = { telefono: string | null; nombre: string; firmada: boolean; enviados: EnlaceEnviado[] } | { error: string };

export async function datosWhatsAppTrabajador(consultaId: string): Promise<DatosWhatsAppTrabajador> {
  const c = await cargar(consultaId);
  if ("error" in c) return { error: c.error! };
  const { data } = await c.supabase
    .from("enlaces_trabajador")
    .select("id, documento, telefono, con_cambios, creado_en, vence, revocado_en, enlaces_trabajador_aperturas(count)")
    .eq("consulta_id", consultaId)
    .order("creado_en", { ascending: false })
    .limit(20);
  return {
    telefono: telefonoTrabajador(c.trabajador.telefono),
    nombre: `${c.trabajador.nombres} ${c.trabajador.apellidos}`,
    firmada: c.consulta.estado === "firmada",
    enviados: (data ?? []).map((e) => ({
      id: e.id,
      documento: e.documento,
      telefono: e.telefono,
      creado: e.creado_en,
      vence: e.vence,
      anulado: Boolean(e.revocado_en),
      conCambios: Boolean(e.con_cambios),
      aperturas: (e.enlaces_trabajador_aperturas as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    })),
  };
}

export type EntradaWhatsAppTrabajador = { consultaId: string; tipo: string; busqueda: string; telefono: string; guardarTelefono: boolean; mensaje?: string };
export type ResultadoWhatsAppTrabajador = { ok: true; whatsapp: string; aviso?: string } | { ok: false; mensaje: string };

export async function enviarAlTrabajador(e: EntradaWhatsAppTrabajador): Promise<ResultadoWhatsAppTrabajador> {
  if (!esDocTrabajador(e.tipo)) return { ok: false, mensaje: "Este documento no se envía al trabajador." };
  const telefono = telefonoTrabajador(e.telefono);
  if (!telefono) return { ok: false, mensaje: "Escribe un celular válido, por ejemplo 0414-1234567." };
  const c = await cargar(e.consultaId);
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { sesion, supabase, consulta, trabajador } = c;
  if (DOCS_TRABAJADOR[e.tipo].firmada && consulta.estado !== "firmada")
    return { ok: false, mensaje: "Firma la consulta antes de enviar este documento." };

  // Escritorio: el enlace vive en la nube y apunta a la consulta y al trabajador; primero se suben si están solo en la PC
  if (ESCRITORIO) {
    const esperando = await subirAhora(supabase, [consulta.id, trabajador.id]);
    if (esperando === null) return { ok: false, mensaje: REQUIERE_INTERNET_WHATSAPP };
    if (esperando.length) return { ok: false, mensaje: "La consulta todavía no llegó a la nube. Espera un momento y vuelve a enviarlo." };
  }

  const ruta = `/imprimir/${e.tipo}/${consulta.id}${consultaSegura(e.busqueda)}`;
  let pdf: Buffer;
  try {
    [pdf] = await pdfDeRutas([ruta]);
  } catch (err) {
    return { ok: false, mensaje: `No se pudo preparar el PDF: ${(err as Error).message}` };
  }
  if (!pdf?.length) return { ok: false, mensaje: "No se pudo preparar el PDF." };
  if (pdf.length > 5 * 1024 * 1024) return { ok: false, mensaje: "El PDF pasa de 5 MB: quita secciones y vuelve a intentarlo." };

  const token = randomBytes(32).toString("base64url");
  const { data: enlace, error: err1 } = await supabase
    .from("enlaces_trabajador")
    .insert({
      org_id: consulta.org_id,
      trabajador_id: trabajador.id,
      consulta_id: consulta.id,
      documento: e.tipo,
      ruta,
      telefono,
      token_hash: hex(createHash("sha256").update(token).digest()),
      enviado_por: sesion.usuarioId,
    })
    .select("id")
    .single();
  if (err1 || !enlace) return { ok: false, mensaje: `No se creó el enlace: ${err1?.message ?? "sin respuesta"}` };
  const nombreArchivo = `${DOCS_TRABAJADOR[e.tipo].nombre} - ${trabajador.nombres} ${trabajador.apellidos}.pdf`.replace(/[\\/:*?"<>|]/g, " ");
  const { error: err2 } = await supabase.from("enlaces_trabajador_archivos").insert({ enlace_id: enlace.id, nombre: nombreArchivo, contenido: hex(pdf) });
  if (err2) {
    await supabase.from("enlaces_trabajador").update({ revocado_en: new Date(ahora()).toISOString() }).eq("id", enlace.id);
    return { ok: false, mensaje: `No se guardó el PDF: ${err2.message}` };
  }

  // El número queda en la ficha solo si el médico lo pide (no bloquea el envío si falla)
  let aviso: string | undefined;
  if (e.guardarTelefono && telefonoTrabajador(trabajador.telefono) !== telefono) {
    const { data: guardado, error } = await supabase.from("trabajadores").update({ telefono: e.telefono.trim() }).eq("id", trabajador.id).select("id");
    if (error || !guardado?.length) aviso = `Enviado. El número no se guardó en la ficha${error ? `: ${error.message}` : " (sin permiso para editarla)."}`;
  }

  const saludo = e.mensaje?.trim().slice(0, 500) || mensajeTrabajador(trabajador.nombres, sesion.organizacion, e.tipo);
  const texto = `${saludo} ${URL_PUBLICA}/t/${token}`;
  return { ok: true, whatsapp: `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`, aviso };
}

export async function anularEnlaceTrabajador(id: string): Promise<{ ok: boolean; mensaje?: string }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud anula enlaces." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("enlaces_trabajador").update({ revocado_en: new Date(ahora()).toISOString() }).eq("id", id).is("revocado_en", null).select("id");
  if (error) return { ok: false, mensaje: error.message };
  return data?.length ? { ok: true } : { ok: false, mensaje: "El enlace ya estaba anulado o no se encontró." };
}
