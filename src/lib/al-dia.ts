import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { correoDisponible } from "@/lib/correo";
import { enviarLote, enviarRespuestaSolicitud, listarPlantillas, porEnviar } from "@/lib/envios";
import { plantillaInicial } from "@/lib/envios-tipos";
import { ahora, hoyCaracas } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// «Poner todo al día»: lo que el servicio debe a las empresas, en un solo toque.
//   · Citas que RR. HH. pidió desde el portal (de hoy en adelante): quedan confirmadas.
//   · Constancias firmadas que no han salido: van por correo a los contactos con correo (WhatsApp necesita el toque
//     en el teléfono: esas quedan en Envíos › Por enviar).
//   · Solicitudes respondidas cuyo correo falló: se reintentan (las que se respondieron sin correo, a propósito, no).
export type ResumenAlDia = {
  citas: number;
  constancias: number; // salen por correo
  soloWhatsapp: number; // la empresa no tiene contacto con correo
  solicitudes: number;
  correo: boolean; // hay remitente configurado
};

export type ResultadoAlDia = { ok: boolean; mensaje: string; aviso?: string };

const DIAS = 14;
// Vercel corta a los 60 s: se para a los 40 y se avisa que quedan
const LIMITE_MS = 40_000;

async function solicitudesSinEnviar() {
  const supabase = await crearClienteServidor();
  const desde = new Date(ahora() - DIAS * 86_400_000).toISOString();
  const { data: sols } = await supabase.from("solicitudes").select("id").eq("estado", "respondida").gte("respondida_en", desde).limit(200);
  const ids = (sols ?? []).map((s) => s.id);
  if (!ids.length) return [];
  const [{ data: resp }, { data: envios }] = await Promise.all([
    supabase.from("solicitudes_respuesta").select("id, documento_ruta").in("id", ids).not("documento_ruta", "is", null),
    supabase.from("envios").select("ruta, estado").in("ruta", ids.map((id) => `/api/solicitudes/${id}`)),
  ]);
  // Solo las que intentaron salir y fallaron: si alguien desmarcó «Enviar por correo» (p. ej. la entregó en mano), se respeta
  const fallaron = new Set((envios ?? []).filter((e) => e.estado === "fallido").map((e) => e.ruta));
  const salieron = new Set((envios ?? []).filter((e) => e.estado !== "fallido").map((e) => e.ruta));
  return (resp ?? []).map((r) => r.id as string).filter((id) => fallaron.has(`/api/solicitudes/${id}`) && !salieron.has(`/api/solicitudes/${id}`));
}

export async function resumenAlDia(): Promise<ResumenAlDia | null> {
  if (!supabaseConfigurado) return null;
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !sesion.clinico) return null;
  const supabase = await crearClienteServidor();
  const [{ count: citas }, grupos, solicitudes] = await Promise.all([
    supabase.from("citas").select("id", { count: "exact", head: true }).eq("estado", "solicitada").gte("fecha", hoyCaracas()),
    porEnviar(DIAS),
    solicitudesSinEnviar(),
  ]);
  const conCorreo = (g: (typeof grupos)[number]) => g.contactos.some((c) => c.correo);
  return {
    citas: citas ?? 0,
    constancias: grupos.filter(conCorreo).reduce((n, g) => n + g.consultas.length, 0),
    soloWhatsapp: grupos.filter((g) => !conCorreo(g)).reduce((n, g) => n + g.consultas.length, 0),
    solicitudes: solicitudes.length,
    correo: correoDisponible(),
  };
}

export async function ponerAlDia(): Promise<ResultadoAlDia> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  if (!sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud pone al día los envíos." };
  const inicio = performance.now();
  const queda = () => performance.now() - inicio < LIMITE_MS;
  const supabase = await crearClienteServidor();
  const hecho: string[] = [];
  const problemas: string[] = [];
  let pendiente = false;

  // 1. Citas pedidas por el portal
  const { data: citas, error: eCitas } = await supabase
    .from("citas").update({ estado: "citado" }).eq("estado", "solicitada").gte("fecha", hoyCaracas()).select("id");
  if (eCitas) problemas.push(`Citas: ${eCitas.code === "42501" ? "tu rol no permite confirmarlas" : eCitas.message}`);
  else if (citas?.length) hecho.push(`${citas.length} cita${citas.length === 1 ? " confirmada" : "s confirmadas"}`);

  const correo = correoDisponible();
  if (!correo) problemas.push("El correo remitente no está configurado: constancias y solicitudes siguen pendientes");
  else {
    // 2. Constancias firmadas: un correo por empresa y día, a sus contactos con correo
    const [grupos, plantillas] = await Promise.all([porEnviar(DIAS), listarPlantillas()]);
    let constancias = 0;
    for (const g of grupos) {
      const contactos = g.contactos.filter((c) => c.correo);
      if (!contactos.length) continue;
      if (!queda()) { pendiente = true; break; }
      const p = plantillaInicial(plantillas.filter((x) => !x.empresaId || x.empresaId === g.empresaId), g.empresaId);
      const r = await enviarLote({
        empresaId: g.empresaId, fecha: g.fecha, consultaIds: g.consultas.map((c) => c.id), contactoIds: contactos.map((c) => c.id),
        correosExtra: [], telefonosExtra: [], canal: "correo", incluirConsulta: false,
        mensaje: p.mensaje, asunto: p.asunto, mensajeConstancias: p.mensajeConstancias,
      });
      if (r.ok) constancias += g.consultas.length;
      else problemas.push(`${g.empresa}: ${r.mensaje}`);
    }
    if (constancias) hecho.push(`${constancias} constancia${constancias === 1 ? " enviada" : "s enviadas"} por correo`);

    // 3. Solicitudes respondidas cuyo correo falló
    let solicitudes = 0;
    for (const id of await solicitudesSinEnviar()) {
      if (!queda()) { pendiente = true; break; }
      const r = await enviarRespuestaSolicitud(id);
      if (r.ok) solicitudes++;
      else problemas.push(`Solicitud: ${r.mensaje}`);
    }
    if (solicitudes) hecho.push(`${solicitudes} solicitud${solicitudes === 1 ? " enviada" : "es enviadas"}`);
  }

  if (pendiente) problemas.push("Quedan envíos: vuelve a tocar «Poner todo al día»");
  const mensaje = hecho.length ? `Listo: ${hecho.join(" · ")}.` : problemas.length ? "No se pudo completar." : "Ya estaba todo al día.";
  return { ok: hecho.length > 0 || !problemas.length, mensaje, aviso: problemas.length ? problemas.join(". ") + "." : undefined };
}
