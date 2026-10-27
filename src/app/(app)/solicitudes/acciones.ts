"use server";

import { revalidatePath } from "next/cache";
import { pdfDeRutas } from "@/lib/pdf-servidor";
import { obtenerSesion } from "@/lib/sesion";
import type { EstadoSolicitud } from "@/lib/solicitudes-tipos";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string };

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;
const ESTADOS: EstadoSolicitud[] = ["pendiente", "en_proceso", "respondida", "rechazada"];
// Documentos de zamorApp con los que se puede responder (se generan en PDF en el servidor)
const DOCUMENTOS: Record<string, string> = {
  informe: "Informe médico",
  "informe-trabajador": "Informe para el trabajador",
  atencion: "Constancia de atención médica",
  constancia: "Constancia de aptitud",
  referencia: "Referencia médica",
  reposo: "Reposo médico",
};

function refrescar() {
  revalidatePath("/solicitudes");
  revalidatePath("/portal");
}

// La empresa (o el servicio, si llegó por teléfono o correo) registra una solicitud
export async function crearSolicitud(_: Resultado | null, d: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  const detalle = texto(d, "detalle");
  const tipoId = texto(d, "tipo_id");
  if (!tipoId || !detalle) return { ok: false, mensaje: "Elige el tipo y describe lo que necesitas." };
  const supabase = await crearClienteServidor();
  const trabajadorId = texto(d, "trabajador_id");
  let empresaId = texto(d, "empresa_id");
  if (trabajadorId) {
    const { data: t } = await supabase.from("trabajadores").select("empresa_id").eq("id", trabajadorId).maybeSingle();
    if (!t) return { ok: false, mensaje: "Ese trabajador no pertenece a tus empresas." };
    empresaId = t.empresa_id;
  }
  if (!empresaId) return { ok: false, mensaje: "Elige la empresa." };
  const { error } = await supabase.from("solicitudes").insert({
    org_id: sesion.orgId,
    empresa_id: empresaId,
    tipo_id: tipoId,
    tipo: "",
    trabajador_id: trabajadorId,
    detalle,
  });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu usuario no puede hacer solicitudes para esta empresa." : error.message };
  refrescar();
  return { ok: true, mensaje: "Solicitud enviada. Te avisamos cuando haya respuesta." };
}

// El servicio cambia el estado, responde y adjunta el documento (archivo propio o generado desde una consulta)
export async function atenderSolicitud(_: Resultado | null, d: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  const id = texto(d, "id");
  const estado = texto(d, "estado") as EstadoSolicitud | null;
  if (!id || !estado || !ESTADOS.includes(estado)) return { ok: false, mensaje: "Datos incompletos." };
  const supabase = await crearClienteServidor();
  const { data: s } = await supabase.from("solicitudes").select("id, org_id, empresa_id, documento_ruta").eq("id", id).maybeSingle();
  if (!s) return { ok: false, mensaje: "Solicitud no encontrada." };

  // El archivo propio lo sube el navegador directo a Storage (la RLS del bucket lo permite solo al servicio);
  // aquí llega su ruta. El documento de una consulta se genera en PDF en el servidor.
  let documentoRuta = texto(d, "subido_ruta") ?? undefined;
  let documentoNombre = texto(d, "subido_nombre") ?? undefined;
  const consultaId = texto(d, "consulta_id");
  const documento = texto(d, "documento");
  if (!documentoRuta && consultaId && documento && DOCUMENTOS[documento]) {
    if (!sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud genera documentos de una consulta." };
    let pdf: Buffer;
    try {
      [pdf] = await pdfDeRutas([`/imprimir/${documento}/${consultaId}`]);
    } catch (err) {
      return { ok: false, mensaje: `No se pudo generar el PDF: ${(err as Error).message}` };
    }
    documentoRuta = `${s.org_id}/${s.empresa_id}/${s.id}/${Date.now()}-${documento}.pdf`;
    documentoNombre = `${DOCUMENTOS[documento]}.pdf`;
    const { error } = await supabase.storage.from("solicitudes").upload(documentoRuta, pdf, { contentType: "application/pdf", upsert: false });
    if (error) return { ok: false, mensaje: `No se pudo guardar el documento: ${error.message}` };
  }

  const { error } = await supabase
    .from("solicitudes")
    .update({ estado, respuesta: texto(d, "respuesta"), ...(documentoRuta ? { documento_ruta: documentoRuta, documento_nombre: documentoNombre } : {}) })
    .eq("id", id);
  if (error) {
    if (documentoRuta) await supabase.storage.from("solicitudes").remove([documentoRuta]);
    return { ok: false, mensaje: error.message };
  }
  // El documento anterior se reemplaza
  if (documentoRuta && s.documento_ruta) await supabase.storage.from("solicitudes").remove([s.documento_ruta]);
  refrescar();
  return { ok: true, mensaje: estado === "respondida" ? "Respondida: la empresa ya recibió el aviso." : "Guardado." };
}
