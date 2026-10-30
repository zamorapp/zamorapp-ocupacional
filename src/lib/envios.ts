import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { supabaseConfigurado } from "@/lib/config";
import { correoConfigurado, correoDisponible, enviarCorreo } from "@/lib/correo";
import { archivoCola, CUBETA_COLA } from "@/lib/envios-cola";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import {
  ASUNTO_ENVIO,
  ASUNTO_INFORME,
  CORREO_VALIDO,
  DOCS_CLINICOS,
  ESPERA_SIN_CONFIRMAR_MIN,
  MAX_LOTE,
  MENSAJE_INFORME,
  mensajeSoloConstancias,
  NOMBRE_DOCUMENTO,
  rellenar,
  telefonoWhatsApp,
  type ConsultaLote,
  type Contacto,
  type DocInforme,
  type EntradaEnvio,
  type EntradaInforme,
  type EnvioHistorial,
  type FilaBitacora,
  type GrupoPorEnviar,
  type Plantilla,
  type ResultadoEnvio,
} from "@/lib/envios-tipos";
import { ahora, hoyCaracas } from "@/lib/fecha";
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
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(ahora()));

type FilaConsulta = {
  id: string;
  hora_inicio: string;
  estado: string;
  motivo: { nombre: string } | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string } | null;
  aptitudes: { clasificacion: string }[] | { clasificacion: string } | null;
};

export async function consultasDelDia(empresaId: string, fecha: string): Promise<ConsultaLote[]> {
  if (!supabaseConfigurado) return []; // modo demo: sin nube, pantalla vacía en vez de error
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
  if (!supabaseConfigurado) return []; // modo demo: sin nube, pantalla vacía en vez de error
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
  if (!supabaseConfigurado) return []; // modo demo: sin nube, pantalla vacía en vez de error
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("envios")
    .select(CAMPOS_HISTORIAL)
    .eq("empresa_id", empresaId)
    .order("creado_en", { ascending: false })
    .limit(limite);
  return (data ?? []).map(aHistorial);
}

const CAMPOS_HISTORIAL = "id, creado_en, fecha_lote, canal, destinatario, documentos, consultas, estado, error, reintento_de, envio_enlaces(vence, revocado_en, envio_aperturas(count))";
type Enlace = { vence: string; revocado_en: string | null; envio_aperturas: { count: number }[] };
type FilaEnvio = {
  id: string; creado_en: string; fecha_lote: string; canal: EnvioHistorial["canal"]; destinatario: string; documentos: string[];
  consultas: string[]; estado: EnvioHistorial["estado"]; error: string | null; reintento_de: string | null; envio_enlaces: Enlace[] | Enlace | null;
};
function aHistorial(e: FilaEnvio): EnvioHistorial {
  const l = Array.isArray(e.envio_enlaces) ? e.envio_enlaces[0] : e.envio_enlaces;
  return {
    id: e.id,
    creadoEn: e.creado_en,
    fechaLote: e.fecha_lote,
    canal: e.canal,
    destinatario: e.destinatario,
    documentos: e.documentos,
    cantidad: e.consultas.length,
    estado: e.estado,
    error: e.error,
    enlace: l ? { vence: l.vence, revocado: Boolean(l.revocado_en), aperturas: l.envio_aperturas?.[0]?.count ?? 0 } : null,
    reintentoDe: e.reintento_de,
  };
}

const sinConfirmarViejo = (estado: string, creadoEn: string) => estado === "enviando" && ahora() - new Date(creadoEn).getTime() > ESPERA_SIN_CONFIRMAR_MIN * 60_000;

export type FiltrosBitacora = { empresaId?: string; estado?: string; canal?: string; desde?: string; hasta?: string };

// Bitácora de todas las empresas: qué salió, a quién, quién lo envió y qué falló (y si ya se reintentó)
export async function bitacora(f: FiltrosBitacora, limite = 300): Promise<FilaBitacora[]> {
  if (!supabaseConfigurado) return []; // modo demo: sin nube, pantalla vacía en vez de error
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("envios")
    .select(`${CAMPOS_HISTORIAL}, empresa_id, asunto, enviado_por, empresas(razon_social, nombre_comercial)`)
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (f.empresaId) q = q.eq("empresa_id", f.empresaId);
  if (f.canal === "correo" || f.canal === "whatsapp") q = q.eq("canal", f.canal);
  if (["fallido", "enviado", "enlace", "enviando", "en_cola"].includes(f.estado ?? "")) q = q.eq("estado", f.estado!);
  if (f.estado === "pendiente") q = q.in("estado", ["fallido", "enviando"]);
  if (f.desde) q = q.gte("creado_en", `${f.desde}T00:00:00-04:00`);
  if (f.hasta) q = q.lte("creado_en", `${f.hasta}T23:59:59-04:00`);
  const { data } = await q;
  type Fila = FilaEnvio & { empresa_id: string; asunto: string; enviado_por: string; empresas: { razon_social: string; nombre_comercial: string | null } | null };
  const filas = (data ?? []) as unknown as Fila[];
  const ids = filas.map((e) => e.id);
  const autores = [...new Set(filas.map((e) => e.enviado_por))];
  const [{ data: hijos }, { data: perfiles }] = await Promise.all([
    ids.length ? supabase.from("envios").select("reintento_de").in("reintento_de", ids) : Promise.resolve({ data: [] as { reintento_de: string }[] }),
    autores.length ? supabase.from("perfiles").select("id, nombre_completo").in("id", autores) : Promise.resolve({ data: [] as { id: string; nombre_completo: string }[] }),
  ]);
  const reintentados = new Set((hijos ?? []).map((h) => h.reintento_de));
  const nombres = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo as string]));
  return filas.map((e) => {
    const reintentado = reintentados.has(e.id);
    return {
      ...aHistorial(e),
      empresaId: e.empresa_id,
      empresa: e.empresas ? e.empresas.nombre_comercial || e.empresas.razon_social : "—",
      asunto: e.asunto,
      enviadoPor: nombres.get(e.enviado_por) ?? null,
      reintentado,
      reintentable: e.canal === "correo" && !reintentado && (e.estado === "fallido" || sinConfirmarViejo(e.estado, e.creado_en)),
    };
  });
}

export async function listarPlantillas(): Promise<Plantilla[]> {
  if (!supabaseConfigurado) return []; // modo demo: sin nube, pantalla vacía en vez de error
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("plantillas_correo")
    .select("id, empresa_id, nombre, asunto, mensaje, mensaje_constancias, predeterminada")
    .eq("activo", true)
    .order("predeterminada", { ascending: false })
    .order("nombre");
  return (data ?? []).map((p) => ({
    id: p.id,
    empresaId: p.empresa_id,
    nombre: p.nombre,
    asunto: p.asunto,
    mensaje: p.mensaje,
    mensajeConstancias: p.mensaje_constancias,
    predeterminada: p.predeterminada,
  }));
}

const hex = (b: Buffer) => "\\x" + b.toString("hex");

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;
type Adjunto = { nombre: string; contenido: Buffer };
type Detalle = NonNullable<ResultadoEnvio["detalle"]>[number];

// Un correo: primero se registra (la base valida firma, empresa y destinatario autorizado); si lo rechaza, el correo no sale.
// Después se cierra el registro como enviado o fallido.
async function correoRegistrado(supabase: Cliente, fila: Record<string, unknown>, adjuntos: Adjunto[], remitente: string, cola: Cola): Promise<Detalle> {
  const destinatario = String(fila.destinatario);
  if (!correoConfigurado()) return correoEnCola(supabase, fila, adjuntos, cola);
  const { data: registro, error: errReg } = await supabase.from("envios").insert({ ...fila, estado: "enviando" }).select("id").single();
  if (errReg || !registro) return { destinatario, estado: "fallido", error: `No se envió: ${errReg?.message ?? "sin registro"}` };
  let estado: "enviado" | "fallido" = "enviado";
  let error: string | undefined;
  try {
    await enviarCorreo({ para: destinatario, asunto: String(fila.asunto), texto: String(fila.mensaje), nombreRemitente: remitente, adjuntos });
  } catch (err) {
    estado = "fallido";
    error = (err as Error).message.slice(0, 300);
  }
  const { error: errCierre } = await supabase.from("envios").update({ estado, error: error ?? null }).eq("id", registro.id);
  return { destinatario, estado, error: error ?? (errCierre ? `Enviado; el registro quedó «sin confirmar»: ${errCierre.message}` : undefined) };
}

// Escritorio: la clave de Gmail vive solo en Vercel, así que el correo no sale de la PC. Se registra «en_cola», su PDF
// (armado aquí, desde la copia local) queda en el bucket privado y la puerta local le pide a la web que lo envíe con la
// sesión de nube de quien lo registró. Sin internet queda en cola en la PC y sale solo al volver (plan local primero, 5.e).
type Cola = { id: string; d: Detalle }[];
async function correoEnCola(supabase: Cliente, fila: Record<string, unknown>, adjuntos: Adjunto[], cola: Cola): Promise<Detalle> {
  const destinatario = String(fila.destinatario);
  const { data: registro, error: errReg } = await supabase.from("envios").insert({ ...fila, estado: "en_cola" }).select("id, enviado_por").single();
  if (errReg || !registro) return { destinatario, estado: "fallido", error: `No se envió: ${errReg?.message ?? "sin registro"}` };
  for (const [i, a] of adjuntos.entries()) {
    const { error } = await supabase.storage.from(CUBETA_COLA).upload(`${registro.enviado_por}/${registro.id}/${archivoCola(i, a.nombre)}`, a.contenido, { contentType: "application/pdf" });
    if (error) {
      const motivo = `No se guardó el PDF para enviarlo: ${error.message}`.slice(0, 300);
      await supabase.from("envios").update({ estado: "fallido", error: motivo }).eq("id", registro.id);
      return { destinatario, estado: "fallido", error: motivo };
    }
  }
  const d: Detalle = { destinatario, estado: "en_cola" };
  cola.push({ id: registro.id, d });
  return d;
}

// Le pide a la puerta local que la web envíe ya lo que quedó en cola; lo que no salga ahora sale en la próxima sincronía
async function despacharCola(supabase: Cliente, cola: Cola) {
  if (!cola.length) return;
  const { data } = await supabase.auth.getSession();
  const r = (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/zamorapp/enviar-cola`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ids: cola.map((c) => c.id) }),
    signal: AbortSignal.timeout(120_000),
  }).then((x) => x.json()).catch(() => null)) as { resultados?: { id: string; estado: Detalle["estado"]; error?: string }[] } | null;
  for (const c of cola) {
    const x = r?.resultados?.find((y) => y.id === c.id);
    if (x && x.estado !== "en_cola") Object.assign(c.d, { estado: x.estado, error: x.error });
  }
}
const textoCola = (n: number) => (n ? `${n} en cola: sale${n === 1 ? "" : "n"} solo al volver el internet` : null);

// Un PDF por grupo: lo que puede leer cualquiera de la empresa (constancias) y lo clínico (solo personal de salud)
const PUBLICOS = ["constancia", "atencion"];
const rutaLote = (docs: string[], ids: string[]) => `/imprimir/lote?doc=${docs.join(",")}&ids=${ids.join(",")}`;
const nombreGrupo = (docs: string[]) =>
  docs.length === 1 ? NOMBRE_DOCUMENTO[docs[0]] : docs.every((d) => PUBLICOS.includes(d)) ? "Constancias" : "Documentos médicos";
// Grupos de un envío ya registrado (para reintentarlo): constancias aparte de lo clínico, como se mandó
const gruposDe = (documentos: string[]) =>
  [documentos.filter((d) => PUBLICOS.includes(d)), documentos.filter((d) => DOCS_CLINICOS.includes(d))].filter((g) => g.length);

// Escritorio: sube ya a la nube lo guardado en la PC (las `filas`). null = sin internet; si no, las que aún esperan.
async function subirAhora(supabase: Cliente, filas: string[]): Promise<string[] | null> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/zamorapp/subir-ahora`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filas }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!r || r.status === 503) return null;
  const j = (await r.json().catch(() => null)) as { esperando?: string[] } | null;
  return j?.esperando ?? filas;
}
export const REQUIERE_INTERNET_WHATSAPP = "Requiere internet: el enlace de WhatsApp se crea en la nube. Conéctate y vuelve a enviarlo (el correo, en cambio, queda en cola).";

// Registra el envío por WhatsApp con su enlace seguro de 7 días y el PDF que abre; devuelve el wa.me listo.
// En el escritorio la fila del envío se guarda en la PC: antes de crear el enlace (que vive solo en la nube y apunta
// a ese envío) se sube; sin internet no se registra nada y se avisa que requiere internet.
async function enlaceRegistrado(supabase: Cliente, orgId: string, fila: Record<string, unknown>, archivo: Adjunto, nombre: string, texto: string) {
  const destinatario = String(fila.destinatario);
  if (ESCRITORIO && (await subirAhora(supabase, [])) === null)
    return { detalle: { destinatario, estado: "fallido", error: REQUIERE_INTERNET_WHATSAPP } as Detalle, enlace: null };
  const token = randomBytes(32).toString("base64url");
  const { data: envio, error: err1 } = await supabase.from("envios").insert({ ...fila, estado: "enlace" }).select("id").single();
  if (ESCRITORIO && envio && (await subirAhora(supabase, [envio.id]))?.length !== 0)
    return { detalle: { destinatario, estado: "fallido", error: "El envío quedó guardado en la PC pero no llegó a la nube a tiempo para crear el enlace. Vuelve a enviarlo en un momento." } as Detalle, enlace: null };
  const { data: enlace, error: err2 } = envio
    ? await supabase.from("envio_enlaces").insert({ org_id: orgId, envio_id: envio.id, token_hash: hex(createHash("sha256").update(token).digest()) }).select("id").single()
    : { data: null, error: err1 };
  const { error: err3 } = enlace ? await supabase.from("envio_archivos").insert({ enlace_id: enlace.id, nombre: archivo.nombre, contenido: hex(archivo.contenido) }) : { error: err2 };
  if (err1 || err2 || err3) return { detalle: { destinatario, estado: "fallido", error: (err1 ?? err2 ?? err3)!.message } as Detalle, enlace: null };
  const url = `${URL_PUBLICA}/e/${token}`;
  return {
    detalle: { destinatario, estado: "enlace" } as Detalle,
    enlace: { nombre, whatsapp: `https://wa.me/${destinatario}?text=${encodeURIComponent(`${texto} ${url}`)}` },
  };
}

const nombreArchivo = (empresa: string, fecha: string) => `${empresa} - ${fechaVE(fecha).replaceAll("/", "-")}.pdf`.replace(/[\\/:*?"<>|]/g, " ");

export async function enviarLote(e: EntradaEnvio): Promise<ResultadoEnvio> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  if (!sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud envía documentos a la empresa." };
  const ids = [...new Set(e.consultaIds)];
  if (!ids.length) return { ok: false, mensaje: "Marca al menos una evaluación." };
  if (ids.length > MAX_LOTE) return { ok: false, mensaje: `Máximo ${MAX_LOTE} evaluaciones por envío.` };
  if (e.canal === "correo" && !correoDisponible()) return { ok: false, mensaje: "Falta configurar el correo remitente. Avísale al administrador." };

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
  const extras = new Set(e.extras ?? []);
  // Constancias (para todos) y documentos clínicos (solo para quien recibe la consulta)
  const publicos = [conConstancia.length ? "constancia" : null, extras.has("atencion") ? "atencion" : null].filter((x): x is string => x !== null);
  const clinicos = ["consulta", ...(["referencia", "recipe"] as const).filter((x) => extras.has(x))];
  if (!publicos.length && !llevanConsulta) return { ok: false, mensaje: "Las evaluaciones marcadas no tienen constancia de aptitud." };
  const idsPublicos = extras.has("atencion") ? validasIds : conConstancia.map((c) => c.id);

  // PDF en el servidor, con la sesión de quien envía
  const nombreEmpresa = empresa.nombre_comercial || empresa.razon_social;
  const sufijo = nombreArchivo(nombreEmpresa, e.fecha);
  const rutas = [publicos.length ? rutaLote(publicos, idsPublicos) : null, llevanConsulta ? rutaLote(clinicos, validasIds) : null];
  let pdfs: Buffer[];
  try {
    pdfs = await pdfDeRutas(rutas.filter((r): r is string => r !== null));
  } catch (err) {
    return { ok: false, mensaje: `No se pudo generar el PDF: ${(err as Error).message}` };
  }
  const constancias = publicos.length ? { nombre: `${nombreGrupo(publicos)} - ${sufijo}`, contenido: pdfs[0] } : null;
  const consultaPdf = llevanConsulta ? { nombre: `${nombreGrupo(clinicos)} - ${sufijo}`, contenido: pdfs[pdfs.length - 1] } : null;

  const cuando = ahoraVE();
  const marcas = (cantidad: number) => ({ fechaHora: cuando, empresa: nombreEmpresa, fecha: fechaVE(e.fecha), cantidad });
  const detalle: NonNullable<ResultadoEnvio["detalle"]> = [];
  const cola: Cola = [];
  const enlaces: NonNullable<ResultadoEnvio["enlaces"]> = [];

  for (const d of destinos) {
    const docs = [...(constancias ? publicos : []), ...(d.consulta && consultaPdf ? clinicos : [])];
    if (!docs.length) continue;
    const todas = docs.includes("consulta") || docs.includes("atencion");
    const cantidad = todas ? validasIds.length : conConstancia.length;
    const texto = rellenar(e.mensaje.trim(), marcas(cantidad));
    const paraRRHH = e.mensajeConstancias?.trim();
    const cuerpo = d.consulta ? texto : paraRRHH ? rellenar(paraRRHH, marcas(cantidad)) : mensajeSoloConstancias(texto);
    const asunto = rellenar(e.asunto?.trim() || ASUNTO_ENVIO, marcas(cantidad)).slice(0, 200);
    const fila = {
      org_id: sesion.orgId,
      empresa_id: e.empresaId,
      fecha_lote: e.fecha,
      canal: e.canal,
      destinatario: d.destino,
      contacto_id: d.contacto?.id ?? null,
      consultas: todas ? validasIds : idsPublicos,
      documentos: docs,
      asunto,
      mensaje: cuerpo,
    };

    if (e.canal === "correo") {
      detalle.push(await correoRegistrado(supabase, fila, [constancias, d.consulta ? consultaPdf : null].filter((a) => a !== null), `${sesion.nombre} · ${sesion.organizacion}`, cola));
      continue;
    }

    // WhatsApp: enlace seguro de 7 días al PDF de constancias (lo clínico nunca va por enlace)
    const r = await enlaceRegistrado(supabase, sesion.orgId, fila, constancias!, d.contacto?.nombre ?? `+${d.destino}`, `${cuerpo}\n\nConstancias (enlace válido 7 días):`);
    detalle.push(r.detalle);
    if (r.enlace) enlaces.push(r.enlace);
  }

  await despacharCola(supabase, cola);
  const enviados = detalle.filter((x) => x.estado === "enviado" || x.estado === "enlace").length;
  const enCola = detalle.filter((x) => x.estado === "en_cola").length;
  const fallidos = detalle.length - enviados - enCola;
  const partes = [
    e.canal === "correo" ? (enviados || !enCola ? `${enviados} correo${enviados === 1 ? "" : "s"} enviado${enviados === 1 ? "" : "s"}` : null) : `${enviados} enlace${enviados === 1 ? "" : "s"} listo${enviados === 1 ? "" : "s"} para WhatsApp`,
    textoCola(enCola),
    fallidos ? `${fallidos} con error` : null,
    fuera ? `${fuera} evaluación${fuera === 1 ? "" : "es"} sin firmar quedó fuera` : null,
  ].filter(Boolean);
  return { ok: enviados + enCola > 0, mensaje: partes.join(" · ") + ".", detalle, enlaces };
}

// La página del informe, siempre de esa empresa (la base lo vuelve a exigir al registrar el envío)
export function rutaInformeValida(documento: string, ruta: string, empresaId: string) {
  if (documento === "puesto") return /^\/imprimir\/puesto\/[0-9a-f-]{36}$/.test(ruta);
  if (documento !== "vigilancia" && documento !== "atendidos") return false;
  const m = /^\/imprimir\/(vigilancia|atendidos)\?([A-Za-z0-9=&_.:-]*)$/.exec(ruta);
  const q = new URLSearchParams(m?.[2] ?? "");
  // «para» lo pone solo el servidor (versión para la empresa); si viene del navegador, se rechaza
  return Boolean(m && m[1] === documento && q.getAll("empresa").join() === empresaId && !q.has("para"));
}
// La vigilancia que sale a la empresa es siempre su versión sin discapacidad ni cifras pequeñas (#41)
const rutaParaEmpresa = (documento: DocInforme, ruta: string) => (documento === "vigilancia" ? `${ruta}&para=empresa` : ruta);

// Informe (puesto, vigilancia o pacientes atendidos) a los contactos de la empresa: mismo registro, texto y bitácora
// que las evaluaciones. Por correo va el PDF; por WhatsApp, un enlace seguro de 7 días.
export async function enviarInforme(e: EntradaInforme): Promise<ResultadoEnvio> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  if (!sesion.clinico && sesion.rol !== "administrador") return { ok: false, mensaje: "Solo el servicio médico envía informes a la empresa." };
  if (!rutaInformeValida(e.documento, e.ruta, e.empresaId)) return { ok: false, mensaje: "Ese informe no es de esta empresa." };
  const ruta = rutaParaEmpresa(e.documento, e.ruta);
  if (e.canal === "correo" && !correoDisponible()) return { ok: false, mensaje: "Falta configurar el correo remitente. Avísale al administrador." };

  const supabase = await crearClienteServidor();
  const [{ data: empresa }, contactos] = await Promise.all([
    supabase.from("empresas").select("id, razon_social, nombre_comercial").eq("id", e.empresaId).maybeSingle(),
    listarContactos(e.empresaId),
  ]);
  if (!empresa) return { ok: false, mensaje: "Empresa no encontrada." };
  const elegidos = contactos.filter((c) => e.contactoIds.includes(c.id));
  let destinos: { destino: string; contacto: Contacto | null }[];
  if (e.canal === "correo") {
    const extra = [...new Set(e.correosExtra.map((c) => c.trim().toLowerCase()).filter(Boolean))];
    const malos = extra.filter((c) => !CORREO_VALIDO.test(c));
    if (malos.length) return { ok: false, mensaje: `Correo no válido: ${malos.join(", ")}` };
    destinos = [
      ...elegidos.filter((c) => c.correo).map((c) => ({ destino: c.correo!, contacto: c })),
      ...extra.filter((x) => !elegidos.some((c) => c.correo === x)).map((x) => ({ destino: x, contacto: null })),
    ];
  } else {
    const extra = [...new Set(e.telefonosExtra.map(telefonoWhatsApp).filter((t) => t.length >= 10))];
    destinos = [...elegidos.filter((c) => c.telefono).map((c) => ({ destino: telefonoWhatsApp(c.telefono!), contacto: c })), ...extra.map((x) => ({ destino: x, contacto: null }))];
  }
  if (!destinos.length) return { ok: false, mensaje: e.canal === "correo" ? "Elige al menos un contacto con correo." : "Elige al menos un contacto con teléfono." };

  const nombreEmpresa = empresa.nombre_comercial || empresa.razon_social;
  const documento = NOMBRE_DOCUMENTO[e.documento];
  const hoy = hoyCaracas();
  let archivo: Adjunto;
  try {
    archivo = { nombre: `${documento} - ${nombreArchivo(nombreEmpresa, hoy)}`, contenido: (await pdfDeRutas([ruta]))[0] };
  } catch (err) {
    return { ok: false, mensaje: `No se pudo generar el PDF: ${(err as Error).message}` };
  }
  const valores = { fechaHora: ahoraVE(), empresa: nombreEmpresa, fecha: fechaVE(hoy), cantidad: 1, documento: documento.toLowerCase() };
  const mensaje = rellenar(e.mensaje.trim() || MENSAJE_INFORME, valores);
  const asunto = rellenar(e.asunto.trim() || ASUNTO_INFORME, { ...valores, documento }).slice(0, 200);
  const detalle: Detalle[] = [];
  const cola: Cola = [];
  const enlaces: NonNullable<ResultadoEnvio["enlaces"]> = [];
  for (const d of destinos) {
    const fila = {
      org_id: sesion.orgId, empresa_id: e.empresaId, fecha_lote: hoy, canal: e.canal, destinatario: d.destino, contacto_id: d.contacto?.id ?? null,
      consultas: [], documentos: [e.documento], ruta, asunto, mensaje,
    };
    if (e.canal === "correo") {
      detalle.push(await correoRegistrado(supabase, fila, [archivo], `${sesion.nombre} · ${sesion.organizacion}`, cola));
      continue;
    }
    const r = await enlaceRegistrado(supabase, sesion.orgId, fila, archivo, d.contacto?.nombre ?? `+${d.destino}`, `${mensaje}\n\n${documento} (enlace válido 7 días):`);
    detalle.push(r.detalle);
    if (r.enlace) enlaces.push(r.enlace);
  }
  await despacharCola(supabase, cola);
  const bien = detalle.filter((x) => x.estado === "enviado" || x.estado === "enlace").length;
  const enCola = detalle.filter((x) => x.estado === "en_cola").length;
  const mal = detalle.length - bien - enCola;
  const partes = [
    e.canal === "correo" ? (bien || !enCola ? `${bien} correo${bien === 1 ? "" : "s"} enviado${bien === 1 ? "" : "s"}` : null) : `${bien} enlace${bien === 1 ? "" : "s"} listo${bien === 1 ? "" : "s"} para WhatsApp`,
    textoCola(enCola),
    mal ? `${mal} con error` : null,
  ].filter(Boolean);
  return { ok: bien + enCola > 0, mensaje: partes.join(" · ") + ".", detalle, enlaces };
}

export async function revocarEnlace(envioId: string) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("envio_enlaces").update({ revocado_en: new Date(ahora()).toISOString() }).eq("envio_id", envioId).is("revocado_en", null);
  return error ? error.message : null;
}

const MAX_REINTENTOS = 10;

// Reintenta correos fallidos o sin confirmar: vuelve a generar el PDF y manda el mismo correo (mismo destinatario,
// documentos y texto) como un envío nuevo enlazado al original. La base vuelve a validar firma y autorización.
export async function reintentarEnvios(ids: string[]): Promise<ResultadoEnvio> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  if (!sesion.clinico) return { ok: false, mensaje: "Solo el personal de salud reenvía documentos a la empresa." };
  if (!correoDisponible()) return { ok: false, mensaje: "Falta configurar el correo remitente. Avísale al administrador." };
  const lista = [...new Set(ids)].slice(0, MAX_REINTENTOS);
  if (!lista.length) return { ok: false, mensaje: "No hay envíos para reintentar." };
  const supabase = await crearClienteServidor();
  const [{ data }, { data: hijos }] = await Promise.all([
    supabase
      .from("envios")
      .select("id, org_id, empresa_id, fecha_lote, canal, destinatario, contacto_id, consultas, documentos, ruta, asunto, mensaje, estado, creado_en, empresas(razon_social, nombre_comercial)")
      .in("id", lista),
    supabase.from("envios").select("reintento_de").in("reintento_de", lista),
  ]);
  type Original = {
    id: string; org_id: string; empresa_id: string; fecha_lote: string; canal: string; destinatario: string; contacto_id: string | null;
    consultas: string[]; documentos: string[]; ruta: string | null; asunto: string; mensaje: string; estado: string; creado_en: string;
    empresas: { razon_social: string; nombre_comercial: string | null } | null;
  };
  const yaReintentados = new Set((hijos ?? []).map((h) => h.reintento_de));
  const originales = ((data ?? []) as unknown as Original[]).filter(
    (o) => o.canal === "correo" && !yaReintentados.has(o.id) && (o.estado === "fallido" || sinConfirmarViejo(o.estado, o.creado_en)),
  );
  if (!originales.length) return { ok: false, mensaje: "Esos envíos ya salieron o ya se reintentaron." };

  // Un PDF por lote y documento, compartido entre los reintentos que llevan las mismas consultas
  const pdfs = new Map<string, Buffer>();
  const detalle: Detalle[] = [];
  const cola: Cola = [];
  for (const o of originales) {
    const empresa = o.empresas ? o.empresas.nombre_comercial || o.empresas.razon_social : "Empresa";
    const adjuntos: Adjunto[] = [];
    try {
      // Informe: el mismo PDF de su ruta; documentos de consultas: un PDF por grupo, como en el envío original
      const partes = o.ruta ? [{ ruta: o.ruta, nombre: NOMBRE_DOCUMENTO[o.documentos[0]] }] : gruposDe(o.documentos).map((g) => ({ ruta: rutaLote(g, o.consultas), nombre: nombreGrupo(g) }));
      for (const p of partes) {
        if (!pdfs.has(p.ruta)) pdfs.set(p.ruta, (await pdfDeRutas([p.ruta]))[0]);
        adjuntos.push({ nombre: `${p.nombre} - ${nombreArchivo(empresa, o.fecha_lote)}`, contenido: pdfs.get(p.ruta)! });
      }
    } catch (err) {
      detalle.push({ destinatario: o.destinatario, estado: "fallido", error: `No se pudo generar el PDF: ${(err as Error).message}` });
      continue;
    }
    const fila = {
      org_id: o.org_id,
      empresa_id: o.empresa_id,
      fecha_lote: o.fecha_lote,
      canal: "correo",
      destinatario: o.destinatario,
      contacto_id: o.contacto_id,
      consultas: o.consultas,
      documentos: o.documentos,
      ruta: o.ruta,
      asunto: o.asunto,
      mensaje: o.mensaje,
      reintento_de: o.id,
    };
    detalle.push(await correoRegistrado(supabase, fila, adjuntos, `${sesion.nombre} · ${sesion.organizacion}`, cola));
  }
  await despacharCola(supabase, cola);
  const bien = detalle.filter((d) => d.estado === "enviado").length;
  const enCola = detalle.filter((d) => d.estado === "en_cola").length;
  const mal = detalle.length - bien - enCola;
  const resto = [...new Set(ids)].length - lista.length;
  const partes = [
    bien || !enCola ? `${bien} correo${bien === 1 ? "" : "s"} reenviado${bien === 1 ? "" : "s"}` : null,
    textoCola(enCola),
    mal ? `${mal} volvió a fallar` : null,
    resto > 0 ? `quedan ${resto}: vuelve a tocar «Reintentar»` : null,
  ].filter(Boolean);
  return { ok: bien + enCola > 0, mensaje: partes.join(" · ") + ".", detalle };
}

// Correos fallidos o sin confirmar de los últimos 30 días que aún no se reintentaron (número en la pestaña Bitácora)
export async function contarPendientes(): Promise<number> {
  if (!supabaseConfigurado) return 0; // modo demo: sin nube, pantalla vacía en vez de error
  const supabase = await crearClienteServidor();
  const desde = new Date(ahora() - 30 * 86_400_000).toISOString();
  const { data } = await supabase.from("envios").select("id, estado, creado_en").eq("canal", "correo").in("estado", ["fallido", "enviando"]).gte("creado_en", desde).limit(200);
  const candidatos = (data ?? []).filter((e) => e.estado === "fallido" || sinConfirmarViejo(e.estado, e.creado_en));
  if (!candidatos.length) return 0;
  const { data: hijos } = await supabase.from("envios").select("reintento_de").in("reintento_de", candidatos.map((e) => e.id));
  const hechos = new Set((hijos ?? []).map((h) => h.reintento_de));
  return candidatos.filter((e) => !hechos.has(e.id)).length;
}

// Bandeja «Por enviar»: lo firmado con constancia de aptitud en los últimos días que aún no salió a la empresa
// (ni por correo ni por enlace). Se llena sola al firmar y se vacía al enviar.
export async function porEnviar(dias = 14): Promise<GrupoPorEnviar[]> {
  if (!supabaseConfigurado) return []; // modo demo: sin nube, pantalla vacía en vez de error
  const supabase = await crearClienteServidor();
  const desde = new Date(ahora() - dias * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  const [{ data: consultas }, { data: envios }] = await Promise.all([
    supabase
      .from("consultas")
      .select("id, fecha, hora_inicio, empresa_id, empresas(razon_social, nombre_comercial), trabajadores(nombres, apellidos), aptitudes(clasificacion)")
      .eq("estado", "firmada")
      .gte("fecha", desde)
      .order("fecha", { ascending: false })
      .order("hora_inicio")
      .limit(1000),
    supabase.from("envios").select("consultas").gte("fecha_lote", desde).neq("estado", "fallido").limit(3000),
  ]);
  const enviadas = new Set((envios ?? []).flatMap((e) => e.consultas as string[]));
  type Fila = {
    id: string; fecha: string; empresa_id: string;
    empresas: { razon_social: string; nombre_comercial: string | null } | null;
    trabajadores: { nombres: string; apellidos: string } | null;
    aptitudes: { clasificacion: string }[] | { clasificacion: string } | null;
  };
  const grupos = new Map<string, GrupoPorEnviar>();
  for (const c of (consultas ?? []) as unknown as Fila[]) {
    const apt = Array.isArray(c.aptitudes) ? c.aptitudes[0] : c.aptitudes;
    if (!apt?.clasificacion || enviadas.has(c.id)) continue;
    const clave = `${c.empresa_id}|${c.fecha}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        empresaId: c.empresa_id,
        empresa: c.empresas ? c.empresas.nombre_comercial || c.empresas.razon_social : "—",
        fecha: c.fecha,
        consultas: [],
        contactos: [],
      });
    }
    grupos.get(clave)!.consultas.push({ id: c.id, paciente: c.trabajadores ? `${c.trabajadores.nombres} ${c.trabajadores.apellidos}` : "—", aptitud: apt.clasificacion });
  }
  const empresas = [...new Set([...grupos.values()].map((g) => g.empresaId))];
  if (empresas.length) {
    const { data: cts } = await supabase
      .from("empresa_contactos")
      .select("id, empresa_id, nombre, cargo, correo, telefono, recibe_consulta")
      .in("empresa_id", empresas)
      .eq("activo", true)
      .order("nombre");
    for (const g of grupos.values()) {
      g.contactos = (cts ?? [])
        .filter((c) => c.empresa_id === g.empresaId)
        .map((c) => ({ id: c.id, nombre: c.nombre, cargo: c.cargo, correo: c.correo, telefono: c.telefono, recibeConsulta: c.recibe_consulta }));
    }
  }
  return [...grupos.values()];
}
