"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copiaDeUrl, faltantesRecipe, obtenerDocumento, opcionesDeUrl } from "@/lib/documentos";
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
  type DocTrabajador,
  type EnlaceEnviado,
  type EnvioTrabajador,
} from "@/lib/whatsapp-trabajador";

// «WhatsApp al trabajador» en la barra de impresión: el médico marca qué documentos de esta consulta van; cada uno se
// arma en PDF (con las opciones que dejó en su hoja) y todos quedan tras UN enlace de 7 días; sale un wa.me listo.
// Todo con la sesión del médico: la RLS y el trigger de enlaces_trabajador validan personal de salud, consulta, ruta y firma.

const URL_PUBLICA = (process.env.ZAMORAPP_URL_PUBLICA || "https://zamorapp-ocupacional.vercel.app").replace(/\/$/, "");
const hex = (b: Buffer) => "\\x" + b.toString("hex");
const MAX_PDF = 5 * 1024 * 1024;

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

// Qué documentos tienen contenido en esta consulta (los que no, se muestran desactivados con el motivo)
async function disponibles(consultaId: string): Promise<Partial<Record<DocTrabajador, string>>> {
  const base = await obtenerDocumento(consultaId);
  if (!base) return {};
  const d = base.datos;
  const faltan: Partial<Record<DocTrabajador, string>> = {};
  if (!d.tratamiento.length && !d.indicaciones.trim()) faltan.recipe = "sin tratamiento";
  else if (faltantesRecipe({ ...base, sin: opcionesDeUrl(undefined), copia: copiaDeUrl(undefined, base.org.ajustes) }).length) faltan.recipe = "faltan datos del récipe";
  if (!d.aptitud.clasificacion) faltan.constancia = "sin elegibilidad";
  if (!d.reposo.activo) faltan.reposo = "sin reposo";
  if (!d.paraclinicos.length) faltan.orden = "sin exámenes";
  if (!d.interconsultas.length) faltan.referencia = "sin referencia";
  return faltan;
}

export type DatosWhatsAppTrabajador =
  | { telefono: string | null; nombre: string; firmada: boolean; noDisponibles: Partial<Record<DocTrabajador, string>>; envios: EnvioTrabajador[] }
  | { error: string };

export async function datosWhatsAppTrabajador(consultaId: string): Promise<DatosWhatsAppTrabajador> {
  const c = await cargar(consultaId);
  if ("error" in c) return { error: c.error! };
  const [{ data }, noDisponibles] = await Promise.all([
    c.supabase
      .from("enlaces_trabajador")
      .select("id, paquete, documento, telefono, con_cambios, creado_en, vence, revocado_en, enlaces_trabajador_aperturas(exito)")
      .eq("consulta_id", consultaId)
      .order("creado_en", { ascending: false })
      .limit(60),
    disponibles(consultaId),
  ]);
  const docs: EnlaceEnviado[] = (data ?? []).map((e) => {
    const ap = (e.enlaces_trabajador_aperturas as unknown as { exito: boolean }[] | null) ?? [];
    return {
      id: e.id,
      paquete: e.paquete,
      documento: e.documento,
      telefono: e.telefono,
      creado: e.creado_en,
      vence: e.vence,
      anulado: Boolean(e.revocado_en),
      conCambios: Boolean(e.con_cambios),
      aperturas: ap.filter((a) => a.exito).length,
      fallos: ap.filter((a) => !a.exito).length,
    };
  });
  const envios = new Map<string, EnvioTrabajador>();
  for (const x of docs) {
    const k = x.paquete ?? x.id;
    const e = envios.get(k) ?? { paquete: k, telefono: x.telefono, creado: x.creado, vence: x.vence, docs: [] };
    e.docs.push(x);
    envios.set(k, e);
  }
  return {
    telefono: telefonoTrabajador(c.trabajador.telefono),
    nombre: `${c.trabajador.nombres} ${c.trabajador.apellidos}`,
    firmada: c.consulta.estado === "firmada",
    noDisponibles,
    envios: [...envios.values()].slice(0, 10),
  };
}

export type EntradaWhatsAppTrabajador = {
  consultaId: string;
  documentos: { tipo: string; busqueda: string }[];
  telefono: string;
  guardarTelefono: boolean;
  mensaje?: string;
};
export type ResultadoWhatsAppTrabajador = { ok: true; whatsapp: string; aviso?: string } | { ok: false; mensaje: string };

export async function enviarAlTrabajador(e: EntradaWhatsAppTrabajador): Promise<ResultadoWhatsAppTrabajador> {
  const elegidos = [...new Map(e.documentos.filter((d) => esDocTrabajador(d.tipo)).map((d) => [d.tipo as DocTrabajador, d.busqueda])).entries()];
  if (!elegidos.length) return { ok: false, mensaje: "Marca al menos un documento." };
  const telefono = telefonoTrabajador(e.telefono);
  if (!telefono) return { ok: false, mensaje: "Revisa el número. Ejemplos: 0414-1234567 o +57 300 1234567." };
  const c = await cargar(e.consultaId);
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { sesion, supabase, consulta, trabajador } = c;
  if (consulta.estado !== "firmada" && elegidos.some(([t]) => DOCS_TRABAJADOR[t].clinico))
    return { ok: false, mensaje: "Firma la consulta antes de enviar documentos médicos. Las hojas de tensión, dieta y bienestar sí salen sin firmar." };
  const faltan = await disponibles(consulta.id);
  const sinContenido = elegidos.filter(([t]) => faltan[t]);
  if (sinContenido.length)
    return { ok: false, mensaje: `Quita ${sinContenido.map(([t]) => `${DOCS_TRABAJADOR[t].corto} (${faltan[t]})`).join(", ")}.` };

  // Escritorio: el enlace vive en la nube y apunta a la consulta y al trabajador; primero se suben si están solo en la PC
  if (ESCRITORIO) {
    const esperando = await subirAhora(supabase, [consulta.id, trabajador.id]);
    if (esperando === null) return { ok: false, mensaje: REQUIERE_INTERNET_WHATSAPP };
    if (esperando.length) return { ok: false, mensaje: "La consulta todavía no llegó a la nube. Espera un momento y vuelve a enviarlo." };
  }

  const rutas = elegidos.map(([t, q]) => `/imprimir/${t}/${consulta.id}${consultaSegura(q)}`);
  let pdfs: Buffer[];
  try {
    pdfs = await pdfDeRutas(rutas);
  } catch (err) {
    return { ok: false, mensaje: `No se pudo preparar el PDF: ${(err as Error).message}` };
  }
  const malo = elegidos.findIndex((_, i) => !pdfs[i]?.length || pdfs[i].length > MAX_PDF);
  if (malo >= 0) return { ok: false, mensaje: `No se pudo preparar ${DOCS_TRABAJADOR[elegidos[malo][0]].corto} (vacío o de más de 5 MB).` };

  // Un token para el trabajador; cada documento guarda sha256(token:documento) y comparte «paquete»
  const token = randomBytes(32).toString("base64url");
  const paquete = randomUUID();
  const creados: string[] = [];
  const deshacer = async () => {
    if (creados.length) await supabase.from("enlaces_trabajador").update({ revocado_en: new Date(ahora()).toISOString() }).in("id", creados).select("id");
  };
  for (const [i, [tipo]] of elegidos.entries()) {
    const { data: enlace, error: err1 } = await supabase
      .from("enlaces_trabajador")
      .insert({
        org_id: consulta.org_id,
        trabajador_id: trabajador.id,
        consulta_id: consulta.id,
        documento: tipo,
        ruta: rutas[i],
        telefono,
        token_hash: hex(createHash("sha256").update(`${token}:${tipo}`).digest()),
        paquete,
        enviado_por: sesion.usuarioId,
      })
      .select("id")
      .single();
    if (err1 || !enlace) {
      await deshacer();
      return { ok: false, mensaje: `No se creó el enlace (${DOCS_TRABAJADOR[tipo].corto}): ${err1?.message ?? "sin respuesta"}` };
    }
    creados.push(enlace.id);
    const nombreArchivo = `${DOCS_TRABAJADOR[tipo].corto} - ${trabajador.nombres} ${trabajador.apellidos}.pdf`.replace(/[\\/:*?"<>|]/g, " ");
    const { error: err2 } = await supabase.from("enlaces_trabajador_archivos").insert({ enlace_id: enlace.id, nombre: nombreArchivo, contenido: hex(pdfs[i]) });
    if (err2) {
      await deshacer();
      return { ok: false, mensaje: `No se guardó el PDF (${DOCS_TRABAJADOR[tipo].corto}): ${err2.message}` };
    }
  }

  // El número queda en la ficha solo si el médico lo pide (no bloquea el envío si falla)
  let aviso: string | undefined;
  if (e.guardarTelefono && telefonoTrabajador(trabajador.telefono) !== telefono) {
    const { data: guardado, error } = await supabase.from("trabajadores").update({ telefono: e.telefono.trim() }).eq("id", trabajador.id).select("id");
    if (error || !guardado?.length) aviso = `Enviado. El número no se guardó en la ficha${error ? `: ${error.message}` : " (sin permiso para editarla)."}`;
  }

  const saludo = e.mensaje?.trim().slice(0, 600) || mensajeTrabajador(trabajador.nombres, sesion.organizacion, elegidos.map(([t]) => t));
  const texto = `${saludo} ${URL_PUBLICA}/t/${token}`;
  return { ok: true, whatsapp: `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`, aviso };
}

// Anula un envío completo (todos sus documentos)
export async function anularEnvioTrabajador(paquete: string): Promise<{ ok: boolean; mensaje?: string }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud anula enlaces." };
  if (!/^[0-9a-f-]{36}$/i.test(paquete)) return { ok: false, mensaje: "Envío no válido." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("enlaces_trabajador")
    .update({ revocado_en: new Date(ahora()).toISOString() })
    .or(`paquete.eq.${paquete},id.eq.${paquete}`)
    .is("revocado_en", null)
    .select("id");
  if (error) return { ok: false, mensaje: error.message };
  return data?.length ? { ok: true } : { ok: false, mensaje: "El enlace ya estaba anulado o no se encontró." };
}
