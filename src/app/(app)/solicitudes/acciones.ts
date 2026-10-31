"use server";

import { revalidatePath } from "next/cache";
import { avisarAlServicio } from "@/lib/aviso-servicio";
import { enviarRespuestaSolicitud } from "@/lib/envios";
import { pdfDeRutas } from "@/lib/pdf-servidor";
import { obtenerSesion } from "@/lib/sesion";
import type { EstadoSolicitud } from "@/lib/solicitudes-tipos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ahora } from "@/lib/fecha";

export type Resultado = { ok: boolean; mensaje: string; aviso?: string };

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

// Documentos sin diagnóstico: los puede ver y descargar RR. HH.
const PARA_EMPRESA = ["constancia", "atencion"];

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
  const { data: creada, error } = await supabase.from("solicitudes").insert({
    org_id: sesion.orgId,
    empresa_id: empresaId,
    tipo_id: tipoId,
    tipo: "",
    trabajador_id: trabajadorId,
    detalle,
  }).select("respondida_auto").maybeSingle();
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu usuario no puede hacer solicitudes para esta empresa." : error.message };
  refrescar();
  const { data: emp } = await supabase.from("empresas").select("razon_social").eq("id", empresaId).maybeSingle();
  // Copia de constancia ya firmada: la base la respondió en el mismo paso con el PDF (validar_solicitud_auto)
  const auto = Boolean(creada?.respondida_auto);
  avisarAlServicio({
    rol: sesion.rol,
    empresaId,
    asunto: `${auto ? "Respondida automáticamente" : "Nueva solicitud"} · ${emp?.razon_social ?? "empresa"}`,
    lineas: [
      auto
        ? `${sesion.nombre} (RR. HH. de ${emp?.razon_social ?? "una empresa"}) pidió una copia de constancia de aptitud y zamorApp se la entregó sola (ya estaba firmada):`
        : `${sesion.nombre} (RR. HH. de ${emp?.razon_social ?? "una empresa"}) hizo una solicitud:`,
      detalle.slice(0, 300),
    ],
    ruta: "/solicitudes",
  });
  if (auto) return { ok: true, mensaje: "Lista: la constancia ya estaba firmada. Descárgala en «Documento», en tus solicitudes." };
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
  const [{ data: s }, { data: previa }] = await Promise.all([
    supabase.from("solicitudes").select("id, org_id, empresa_id").eq("id", id).maybeSingle(),
    supabase.from("solicitudes_respuesta").select("documento_ruta").eq("id", id).maybeSingle(),
  ]);
  if (!s) return { ok: false, mensaje: "Solicitud no encontrada." };
  // La vista no le entrega a recepción ni al coordinador SST una respuesta con datos médicos: no la pueden reescribir
  if (!previa) return { ok: false, mensaje: "Esta respuesta lleva datos médicos: la atiende el personal de salud." };

  // El archivo propio lo sube el navegador directo a Storage (la RLS del bucket lo permite solo al servicio);
  // aquí llega su ruta. El documento de una consulta se genera en PDF en el servidor.
  let documentoRuta = texto(d, "subido_ruta") ?? undefined;
  let documentoNombre = texto(d, "subido_nombre") ?? undefined;
  const consultaId = texto(d, "consulta_id");
  const documento = texto(d, "documento");
  const generado = !documentoRuta && consultaId && documento && DOCUMENTOS[documento] ? documento : null;
  if (generado) {
    if (!sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud genera documentos de una consulta." };
    let pdf: Buffer;
    try {
      [pdf] = await pdfDeRutas([`/imprimir/${generado}/${consultaId}`]);
    } catch (err) {
      return { ok: false, mensaje: `No se pudo generar el PDF: ${(err as Error).message}` };
    }
    documentoRuta = `${s.org_id}/${s.empresa_id}/${s.id}/${ahora()}-${generado}.pdf`;
    documentoNombre = `${DOCUMENTOS[generado]}.pdf`;
    const { error } = await supabase.storage.from("solicitudes").upload(documentoRuta, pdf, { contentType: "application/pdf", upsert: false });
    if (error) return { ok: false, mensaje: `No se pudo guardar el documento: ${error.message}` };
  }

  // Quién ve la respuesta: las constancias van a RR. HH.; lo armado de la consulta lleva diagnósticos y queda solo para
  // el personal de salud; un archivo propio o un texto, lo que marque el servicio (el formulario trae marcado «solo salud»)
  const soloSalud = generado ? !PARA_EMPRESA.includes(generado) : d.get("solo_salud") === "1";
  const { error } = await supabase
    .from("solicitudes")
    .update({ estado, respuesta: texto(d, "respuesta"), solo_salud: soloSalud, ...(documentoRuta ? { documento_ruta: documentoRuta, documento_nombre: documentoNombre } : {}) })
    .eq("id", id);
  if (error) {
    if (documentoRuta) await supabase.storage.from("solicitudes").remove([documentoRuta]);
    return { ok: false, mensaje: error.message };
  }
  // El documento anterior se reemplaza
  if (documentoRuta && previa?.documento_ruta) await supabase.storage.from("solicitudes").remove([previa.documento_ruta]);
  // «Responder y enviar»: el documento sale por correo en el mismo paso (constancias a la empresa; lo médico, solo
  // al personal de salud de la empresa). Si el correo falla, la respuesta queda guardada igual y se avisa.
  let envio = "";
  let aviso: string | undefined;
  if (estado === "respondida" && d.get("enviar_correo") === "1" && (documentoRuta || previa?.documento_ruta)) {
    const r = await enviarRespuestaSolicitud(id);
    if (r.ok) envio = ` Correo: ${r.mensaje}`;
    else aviso = `La respuesta quedó guardada, pero el correo no salió: ${r.mensaje}`;
  }
  refrescar();
  return { ok: true, mensaje: (estado === "respondida" ? "Respondida: la empresa ya recibió el aviso." : "Guardado.") + envio, aviso };
}
