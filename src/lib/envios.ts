import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { correoConfigurado, enviarCorreo } from "@/lib/correo";
import {
  CORREO_VALIDO,
  MARCA_FECHA,
  MAX_LOTE,
  mensajeSoloConstancias,
  telefonoWhatsApp,
  type ConsultaLote,
  type Contacto,
  type EntradaEnvio,
  type EnvioHistorial,
  type ResultadoEnvio,
} from "@/lib/envios-tipos";
import { pdfDeRutas } from "@/lib/pdf-servidor";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Módulo de envíos a la empresa. Lo usan la pantalla Envíos (lote por empresa y día) y cualquier otro lote
// (p. ej. constancias por lote): enviarLote() recibe las consultas, los contactos y el canal.
// Todo corre con la sesión del usuario: la RLS y los triggers de la base validan lote, firma y destinatarios.

const URL_PUBLICA = (process.env.ZAMORAPP_URL_PUBLICA || "https://zamorapp-ocupacional.vercel.app").replace(/\/$/, "");

const horaVE = (iso: string) => new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));
const fechaVE = (iso: string) => iso.split("-").reverse().join("/");
const ahoraVE = () =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date());

type FilaConsulta = {
  id: string;
  hora_inicio: string;
  estado: string;
  motivo: { nombre: string } | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string } | null;
  aptitudes: { clasificacion: string }[] | { clasificacion: string } | null;
};

export async function consultasDelDia(empresaId: string, fecha: string): Promise<ConsultaLote[]> {
  const supabase = await crearClienteServidor();
  const [{ data }, { data: envios }] = await Promise.all([
    supabase
      .from("consultas")
      .select("id, hora_inicio, estado, motivo:lista_items(nombre), trabajadores(nombres, apellidos, cedula), aptitudes(clasificacion)")
      .eq("empresa_id", empresaId)
      .eq("fecha", fecha)
      .order("hora_inicio")
      .limit(MAX_LOTE * 2),
    supabase.from("envios").select("consultas").eq("empresa_id", empresaId).eq("fecha_lote", fecha).neq("estado", "fallido"),
  ]);
  const enviadas = new Set((envios ?? []).flatMap((e) => e.consultas as string[]));
  return ((data ?? []) as unknown as FilaConsulta[]).map((c) => {
    const apt = Array.isArray(c.aptitudes) ? c.aptitudes[0] : c.aptitudes;
    return {
      id: c.id,
      hora: horaVE(c.hora_inicio),
      paciente: c.trabajadores ? `${c.trabajadores.nombres} ${c.trabajadores.apellidos}` : "—",
      cedula: c.trabajadores?.cedula ?? "",
      motivo: c.motivo?.nombre ?? null,
      firmada: c.estado === "firmada",
      aptitud: apt?.clasificacion ?? null,
      enviada: enviadas.has(c.id),
    };
  });
}

export async function listarContactos(empresaId: string): Promise<Contacto[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("empresa_contactos")
    .select("id, nombre, cargo, correo, telefono, recibe_consulta")
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .order("recibe_consulta", { ascending: false })
    .order("nombre");
  return (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, cargo: c.cargo, correo: c.correo, telefono: c.telefono, recibeConsulta: c.recibe_consulta }));
}

export async function historialEnvios(empresaId: string, limite = 40): Promise<EnvioHistorial[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("envios")
    .select("id, creado_en, fecha_lote, canal, destinatario, documentos, consultas, estado, error, envio_enlaces(vence, revocado_en, envio_aperturas(count))")
    .eq("empresa_id", empresaId)
    .order("creado_en", { ascending: false })
    .limit(limite);
  type Enlace = { vence: string; revocado_en: string | null; envio_aperturas: { count: number }[] };
  return (data ?? []).map((e) => {
    const l = (Array.isArray(e.envio_enlaces) ? e.envio_enlaces[0] : e.envio_enlaces) as Enlace | null | undefined;
    return {
      id: e.id,
      creadoEn: e.creado_en,
      fechaLote: e.fecha_lote,
      canal: e.canal,
      destinatario: e.destinatario,
      documentos: e.documentos,
      cantidad: (e.consultas as string[]).length,
      estado: e.estado,
      error: e.error,
      enlace: l ? { vence: l.vence, revocado: Boolean(l.revocado_en), aperturas: l.envio_aperturas?.[0]?.count ?? 0 } : null,
    };
  });
}

const hex = (b: Buffer) => "\\x" + b.toString("hex");

export async function enviarLote(e: EntradaEnvio): Promise<ResultadoEnvio> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  if (!sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud envía documentos a la empresa." };
  const ids = [...new Set(e.consultaIds)];
  if (!ids.length) return { ok: false, mensaje: "Marca al menos una evaluación." };
  if (ids.length > MAX_LOTE) return { ok: false, mensaje: `Máximo ${MAX_LOTE} evaluaciones por envío.` };
  if (e.canal === "correo" && !correoConfigurado()) return { ok: false, mensaje: "Falta configurar el correo remitente. Avísale al administrador." };

  const supabase = await crearClienteServidor();
  const [{ data: empresa }, { data: consultas }, contactos] = await Promise.all([
    supabase.from("empresas").select("id, razon_social, nombre_comercial").eq("id", e.empresaId).maybeSingle(),
    supabase.from("consultas").select("id, estado, empresa_id, aptitudes(clasificacion)").in("id", ids),
    listarContactos(e.empresaId),
  ]);
  if (!empresa) return { ok: false, mensaje: "Empresa no encontrada." };
  // Solo firmadas de esta empresa; las demás se avisan y quedan fuera (no bloquean el resto)
  const validas = (consultas ?? []).filter((c) => c.estado === "firmada" && c.empresa_id === e.empresaId);
  const fuera = ids.length - validas.length;
  if (!validas.length) return { ok: false, mensaje: "Ninguna de las evaluaciones marcadas está firmada. Fírmalas y vuelve a enviar." };
  const conConstancia = validas.filter((c) => {
    const a = Array.isArray(c.aptitudes) ? c.aptitudes[0] : c.aptitudes;
    return Boolean((a as { clasificacion: string } | null)?.clasificacion);
  });
  const validasIds = validas.map((c) => c.id);

  // Destinatarios: contactos elegidos de la empresa + escritos a mano (estos solo reciben constancias)
  const elegidos = contactos.filter((c) => e.contactoIds.includes(c.id));
  type Dest = { destino: string; contacto: Contacto | null; consulta: boolean };
  let destinos: Dest[];
  if (e.canal === "correo") {
    const extra = [...new Set(e.correosExtra.map((c) => c.trim().toLowerCase()).filter(Boolean))];
    const malos = extra.filter((c) => !CORREO_VALIDO.test(c));
    if (malos.length) return { ok: false, mensaje: `Correo no válido: ${malos.join(", ")}` };
    destinos = [
      ...elegidos.filter((c) => c.correo).map((c) => ({ destino: c.correo!, contacto: c, consulta: e.incluirConsulta && c.recibeConsulta })),
      ...extra.filter((x) => !elegidos.some((c) => c.correo === x)).map((x) => ({ destino: x, contacto: null, consulta: false })),
    ];
  } else {
    const extra = [...new Set(e.telefonosExtra.map(telefonoWhatsApp).filter((t) => t.length >= 10))];
    destinos = [
      ...elegidos.filter((c) => c.telefono).map((c) => ({ destino: telefonoWhatsApp(c.telefono!), contacto: c, consulta: false })),
      ...extra.map((x) => ({ destino: x, contacto: null, consulta: false })),
    ];
  }
  if (!destinos.length) return { ok: false, mensaje: e.canal === "correo" ? "Elige al menos un contacto con correo." : "Elige al menos un contacto con teléfono." };
  const llevanConsulta = destinos.some((d) => d.consulta);
  if (!conConstancia.length && !llevanConsulta) return { ok: false, mensaje: "Las evaluaciones marcadas no tienen constancia de aptitud." };

  // PDF en el servidor, con la sesión de quien envía
  const nombreEmpresa = empresa.nombre_comercial || empresa.razon_social;
  const sufijo = `${nombreEmpresa} - ${fechaVE(e.fecha).replaceAll("/", "-")}.pdf`.replace(/[\\/:*?"<>|]/g, " ");
  const rutas = [conConstancia.length ? `/imprimir/lote?doc=constancia&ids=${conConstancia.map((c) => c.id).join(",")}` : null, llevanConsulta ? `/imprimir/lote?doc=consulta&ids=${validasIds.join(",")}` : null];
  let pdfs: Buffer[];
  try {
    pdfs = await pdfDeRutas(rutas.filter((r): r is string => r !== null));
  } catch (err) {
    return { ok: false, mensaje: `No se pudo generar el PDF: ${(err as Error).message}` };
  }
  const constancias = conConstancia.length ? { nombre: `Constancias de aptitud - ${sufijo}`, contenido: pdfs[0] } : null;
  const consultaPdf = llevanConsulta ? { nombre: `Consultas médicas - ${sufijo}`, contenido: pdfs[pdfs.length - 1] } : null;

  const cuando = ahoraVE();
  const texto = (e.mensaje.trim() || "").replaceAll(MARCA_FECHA, cuando);
  const asunto = `Evaluaciones médicas · ${nombreEmpresa} · ${fechaVE(e.fecha)}`;
  const detalle: NonNullable<ResultadoEnvio["detalle"]> = [];
  const enlaces: NonNullable<ResultadoEnvio["enlaces"]> = [];

  for (const d of destinos) {
    const docs = [constancias && "constancia", d.consulta && consultaPdf && "consulta"].filter(Boolean) as string[];
    if (!docs.length) continue;
    const cuerpo = d.consulta ? texto : mensajeSoloConstancias(texto);
    const fila = {
      org_id: sesion.orgId,
      empresa_id: e.empresaId,
      fecha_lote: e.fecha,
      canal: e.canal,
      destinatario: d.destino,
      contacto_id: d.contacto?.id ?? null,
      consultas: docs.includes("consulta") ? validasIds : conConstancia.map((c) => c.id),
      documentos: docs,
      asunto,
      mensaje: cuerpo,
    };

    if (e.canal === "correo") {
      // Primero se registra (la base valida firma, empresa y destinatario autorizado); si lo rechaza, el correo no sale
      const { data: registro, error: errReg } = await supabase.from("envios").insert({ ...fila, estado: "enviando" }).select("id").single();
      if (errReg || !registro) {
        detalle.push({ destinatario: d.destino, estado: "fallido", error: `No se envió: ${errReg?.message ?? "sin registro"}` });
        continue;
      }
      let estado: "enviado" | "fallido" = "enviado";
      let error: string | undefined;
      try {
        await enviarCorreo({
          para: d.destino,
          asunto,
          texto: cuerpo,
          nombreRemitente: `${sesion.nombre} · ${sesion.organizacion}`,
          adjuntos: [constancias, d.consulta ? consultaPdf : null].filter((a) => a !== null),
        });
      } catch (err) {
        estado = "fallido";
        error = (err as Error).message.slice(0, 300);
      }
      const { error: errCierre } = await supabase.from("envios").update({ estado, error: error ?? null }).eq("id", registro.id);
      detalle.push({ destinatario: d.destino, estado, error: error ?? (errCierre ? `Enviado; el registro quedó «sin confirmar»: ${errCierre.message}` : undefined) });
      continue;
    }

    // WhatsApp: enlace seguro de 7 días al PDF de constancias (la consulta médica nunca va por enlace)
    const token = randomBytes(32).toString("base64url");
    const { data: envio, error: err1 } = await supabase.from("envios").insert({ ...fila, estado: "enlace" }).select("id").single();
    const { data: enlace, error: err2 } = envio
      ? await supabase.from("envio_enlaces").insert({ org_id: sesion.orgId, envio_id: envio.id, token_hash: hex(createHash("sha256").update(token).digest()) }).select("id").single()
      : { data: null, error: err1 };
    const { error: err3 } = enlace
      ? await supabase.from("envio_archivos").insert({ enlace_id: enlace.id, nombre: constancias!.nombre, contenido: hex(constancias!.contenido) })
      : { error: err2 };
    if (err1 || err2 || err3) {
      detalle.push({ destinatario: d.destino, estado: "fallido", error: (err1 ?? err2 ?? err3)!.message });
      continue;
    }
    const url = `${URL_PUBLICA}/e/${token}`;
    enlaces.push({
      nombre: d.contacto?.nombre ?? `+${d.destino}`,
      whatsapp: `https://wa.me/${d.destino}?text=${encodeURIComponent(`${cuerpo}\n\nConstancias (enlace válido 7 días): ${url}`)}`,
    });
    detalle.push({ destinatario: d.destino, estado: "enlace" });
  }

  const enviados = detalle.filter((x) => x.estado !== "fallido").length;
  const fallidos = detalle.length - enviados;
  const partes = [
    e.canal === "correo" ? `${enviados} correo${enviados === 1 ? "" : "s"} enviado${enviados === 1 ? "" : "s"}` : `${enviados} enlace${enviados === 1 ? "" : "s"} listo${enviados === 1 ? "" : "s"} para WhatsApp`,
    fallidos ? `${fallidos} con error` : null,
    fuera ? `${fuera} evaluación${fuera === 1 ? "" : "es"} sin firmar quedó fuera` : null,
  ].filter(Boolean);
  return { ok: enviados > 0, mensaje: partes.join(" · ") + ".", detalle, enlaces };
}

export async function revocarEnlace(envioId: string) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("envio_enlaces").update({ revocado_en: new Date().toISOString() }).eq("envio_id", envioId).is("revocado_en", null);
  return error ? error.message : null;
}
