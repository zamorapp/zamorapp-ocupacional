"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { resolverCatalogos } from "@/lib/catalogos-trabajador";
import { invalidarEmpresas } from "@/lib/empresas";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { ahora, hoyCaracas } from "@/lib/fecha";
import { URL_PUBLICA } from "@/lib/invitaciones";
import { olvidar } from "@/lib/memo";
import { numeroWhatsApp } from "@/lib/mensajes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajePaciente, soloDigitosCedula, type Coincidencia, type DatosPaciente, type SolicitudPaciente } from "@/lib/solicitudes-paciente";
import { docsElegidos, type DocumentosRegistro, type EleccionRegistro } from "@/lib/registro-documentos";
import { aplicarPerfilParaclinicos } from "./[id]/perfiles";
import type { Item } from "@/lib/listas";

// Enlace para que el paciente llene sus datos (20261030895000). Todo con la sesión del servicio: la RLS deja crear, ver
// y revisar solo al personal del servicio sin límite de empresas; el trigger impide tocar lo que escribió el paciente.

type R = { ok: true; mensaje?: string } | { ok: false; mensaje: string };
const ROLES_SERVICIO = new Set(["administrador", "gerente_medico", "medico", "enfermeria", "recepcion"]);
const hex = (b: Buffer) => "\\x" + b.toString("hex");
const SIN_INTERNET = "Requiere internet: el enlace del paciente vive en la nube. Conéctate y vuelve a intentarlo.";
const errorNube = (m: string) => (ESCRITORIO && /fetch|network|ECONN|internet|timeout/i.test(m) ? SIN_INTERNET : m);

async function servicio() {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "No disponible en modo demo." } as const;
  if (!sesion.rol || !ROLES_SERVICIO.has(sesion.rol)) return { error: "Solo el personal del servicio maneja estos enlaces." } as const;
  return { sesion, supabase: await crearClienteServidor() } as const;
}

// 0414-1234567 para la ficha (la base guarda 584141234567)
const telefonoFicha = (t: string | undefined) => (t && t.startsWith("58") && t.length === 12 ? `0${t.slice(2, 5)}-${t.slice(5)}` : t ? `+${t}` : null);

export type EnlaceNuevo = { ok: true; enlace: string; whatsapp: string; texto: string } | { ok: false; mensaje: string };

const FIRMANTES = new Set(["administrador", "gerente_medico", "medico"]);

// Lo que el paciente descarga al terminar (20261030906000): la orden lleva los exámenes del perfil elegido, copiados
// al crear el enlace (si después cambia el perfil, este enlace no cambia).
async function documentosElegidos(s: Exclude<Awaited<ReturnType<typeof servicio>>, { error: string }>, el: EleccionRegistro): Promise<DocumentosRegistro | string> {
  const d: DocumentosRegistro = {};
  if (el.orden) {
    if (!/^[0-9a-f-]{36}$/i.test(el.orden.perfilId)) return "Elige el perfil de exámenes de la orden.";
    const { data } = await s.supabase.from("lista_items").select("id, lista, codigo, nombre, grupo, texto, orden, activo, datos")
      .eq("org_id", s.sesion.orgId!).in("lista", ["grupo_paraclinicos", "paraclinico"]).eq("activo", true);
    const items = (data ?? []) as (Item & { lista: string })[];
    const perfil = items.find((i) => i.id === el.orden!.perfilId && i.lista === "grupo_paraclinicos");
    if (!perfil) return "Ese perfil de exámenes ya no existe. Elige otro.";
    const examenes = aplicarPerfilParaclinicos([], perfil.texto ?? "", items.filter((i) => i.lista === "paraclinico"))
      .map((x) => (x.grupo ? { nombre: x.nombre, grupo: x.grupo } : { nombre: x.nombre }));
    if (!examenes.length) return `El perfil «${perfil.nombre}» no tiene exámenes.`;
    d.orden = { examenes, perfil: perfil.nombre, ...(el.orden.motivoId && /^[0-9a-f-]{36}$/i.test(el.orden.motivoId) ? { motivo_id: el.orden.motivoId } : {}) };
  }
  if (el.controlTa) d.control_ta = { dias: el.controlTa === 14 ? 14 : 7 };
  if (el.dieta) d.dieta = { dieta: el.dieta, plan: [] };
  if (el.bienestar) d.bienestar = { tema: [] };
  if (el.firma && docsElegidos(d).length) {
    if (!s.sesion.clinico || !FIRMANTES.has(s.sesion.rol ?? "")) return "Solo un médico envía documentos con su firma y sello.";
    d.firma = true;
  }
  return d;
}

export async function crearEnlacePaciente(e: { nombre: string; telefono: string; empresaId: string | null; documentos?: EleccionRegistro }): Promise<EnlaceNuevo> {
  const s = await servicio();
  if ("error" in s) return { ok: false, mensaje: s.error! };
  const documentos = e.documentos ? await documentosElegidos(s, e.documentos) : {};
  if (typeof documentos === "string") return { ok: false, mensaje: documentos };
  const telefono = e.telefono.trim() ? numeroWhatsApp(e.telefono) : null;
  if (e.telefono.trim() && !telefono) return { ok: false, mensaje: "Revisa el celular (ejemplo: 0414-1234567) o déjalo vacío para elegir el contacto en WhatsApp." };
  const nombre = e.nombre.trim().slice(0, 120) || null;
  const token = randomBytes(32).toString("base64url");
  const { error } = await s.supabase.from("solicitudes_paciente").insert({
    org_id: s.sesion.orgId,
    token_hash: hex(createHash("sha256").update(token).digest()),
    nombre,
    telefono,
    empresa_id: e.empresaId && /^[0-9a-f-]{36}$/i.test(e.empresaId) ? e.empresaId : null,
    creado_por: s.sesion.usuarioId,
    ...(docsElegidos(documentos).length ? { documentos } : {}),
  });
  if (error) return { ok: false, mensaje: errorNube(`No se creó el enlace: ${error.message}`) };
  const enlace = `${URL_PUBLICA}/registro/${token}`;
  const texto = `${mensajePaciente(nombre, s.sesion.organizacion, docsElegidos(documentos).length > 0)} ${enlace}`;
  revalidatePath("/atencion");
  return { ok: true, enlace, texto, whatsapp: `https://wa.me/${telefono ?? ""}?text=${encodeURIComponent(texto)}` };
}

type Fila = {
  id: string; nombre: string | null; telefono: string | null; creado_en: string; vence: string; recibido_en: string | null;
  anulado_en: string | null; resultado: SolicitudPaciente["resultado"]; revisado_en: string | null; datos: DatosPaciente | Record<string, never>;
  trabajador_id: string | null; empresas: { razon_social: string } | null;
};

// Por revisar (todas) y los últimos enlaces enviados, para la bandeja de Atención médica
export async function listarSolicitudesPaciente(): Promise<{ porRevisar: SolicitudPaciente[]; enviados: SolicitudPaciente[]; coincidencias: Record<string, Coincidencia> }> {
  const vacio = { porRevisar: [], enviados: [], coincidencias: {} };
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !sesion.rol || !ROLES_SERVICIO.has(sesion.rol)) return vacio;
  const supabase = await crearClienteServidor();
  const campos = "id, nombre, telefono, creado_en, vence, recibido_en, anulado_en, resultado, revisado_en, datos, trabajador_id, empresas(razon_social)";
  const [{ data: pendientes, error }, { data: ultimos }] = await Promise.all([
    supabase.from("solicitudes_paciente").select(campos).not("recibido_en", "is", null).is("resultado", null).order("recibido_en").limit(100).abortSignal(AbortSignal.timeout(4000)),
    supabase.from("solicitudes_paciente").select(campos).order("creado_en", { ascending: false }).limit(15).abortSignal(AbortSignal.timeout(4000)),
    supabase.rpc("purgar_solicitudes_paciente" as never).abortSignal(AbortSignal.timeout(4000)),
  ]);
  // Tabla aún sin migrar o sin internet en el escritorio (corte a los 4 s): la pantalla sigue sin la bandeja
  if (error) return vacio;
  const mapa = (f: Fila): SolicitudPaciente => ({
    id: f.id, nombre: f.nombre, telefono: f.telefono, empresaSugerida: f.empresas?.razon_social ?? null, creado: f.creado_en, vence: f.vence,
    recibido: f.recibido_en, anulado: Boolean(f.anulado_en), resultado: f.resultado, revisado: f.revisado_en,
    datos: "cedula" in f.datos ? (f.datos as DatosPaciente) : null, trabajadorId: f.trabajador_id,
  });
  const porRevisar = ((pendientes ?? []) as unknown as Fila[]).map(mapa);
  // ¿Ya tiene ficha? Por los dígitos de la cédula, con cualquier letra
  const coincidencias: Record<string, Coincidencia> = {};
  const cedulas = [...new Set(porRevisar.flatMap((s) => (s.datos ? ["V", "E", "P"].map((l) => `${l}-${soloDigitosCedula(s.datos!.cedula)}`) : [])))];
  if (cedulas.length) {
    const { data } = await supabase.from("trabajadores").select("id, cedula, nombres, apellidos, estado, telefono, correo, direccion, empresas(razon_social)").in("cedula", cedulas);
    const porDigitos = new Map((data ?? []).map((t) => [soloDigitosCedula(t.cedula), t]));
    for (const s of porRevisar) {
      const t = s.datos && porDigitos.get(soloDigitosCedula(s.datos.cedula));
      if (t) coincidencias[s.id] = {
        id: t.id, nombre: `${t.nombres} ${t.apellidos}`, empresa: (t.empresas as unknown as { razon_social: string } | null)?.razon_social ?? "",
        estado: t.estado, telefono: t.telefono, correo: t.correo, direccion: t.direccion,
      };
    }
  }
  return { porRevisar, enviados: ((ultimos ?? []) as unknown as Fila[]).map(mapa), coincidencias };
}

// Empresa de los pacientes particulares: solo la marcada por la RPC de «Pacientes particulares» (#262). Nunca se busca
// por nombre: podría fichar al paciente en una empresa real.
async function empresaParticular(supabase: Awaited<ReturnType<typeof crearClienteServidor>>): Promise<string | null> {
  const { data, error } = await supabase.rpc("empresa_particulares" as never);
  return !error && typeof data === "string" ? data : null;
}

export type Aceptar = { id: string; empresa: string; motivoId: string | null; fecha: string; hora: string | null; actualizarContacto: boolean };

// Aceptar: si la cédula ya tiene ficha, se usa esa (y, si se pide, se actualizan teléfono, correo y dirección); si no,
// se crea la ficha en la empresa elegida. Luego la cita del día elegido y la solicitud queda «aceptada».
export async function aceptarSolicitudPaciente(a: Aceptar): Promise<R & { trabajadorId?: string }> {
  const s = await servicio();
  if ("error" in s) return { ok: false, mensaje: s.error! };
  const { supabase, sesion } = s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha) || a.fecha < hoyCaracas()) return { ok: false, mensaje: "Elige un día de hoy en adelante." };
  if (a.hora && !/^\d{2}:\d{2}$/.test(a.hora)) return { ok: false, mensaje: "Revisa la hora." };
  const { data: sol } = await supabase.from("solicitudes_paciente").select("id, datos, recibido_en, resultado").eq("id", a.id).maybeSingle();
  const d = sol?.datos as DatosPaciente | undefined;
  if (!sol || !d?.cedula) return { ok: false, mensaje: "No se encontró la solicitud." };
  if (sol.resultado) return { ok: false, mensaje: "Esta solicitud ya se revisó." };

  const digitos = soloDigitosCedula(d.cedula);
  const { data: previos } = await supabase.from("trabajadores").select("id, empresa_id, telefono, correo, direccion")
    .in("cedula", ["V", "E", "P"].map((l) => `${l}-${digitos}`)).limit(1);
  let trabajador = previos?.[0] ?? null;
  let aviso: string | undefined;

  if (trabajador) {
    if (a.actualizarContacto) {
      const cambios = Object.fromEntries(Object.entries({ telefono: telefonoFicha(d.telefono), correo: d.correo ?? null, direccion: d.direccion ?? null })
        .filter(([k, v]) => v && v !== trabajador![k as "telefono"]));
      if (Object.keys(cambios).length) {
        const { data: ok, error } = await supabase.from("trabajadores").update(cambios).eq("id", trabajador.id).select("id");
        if (error || !ok?.length) aviso = `Los datos de contacto no se actualizaron${error ? `: ${error.message}` : " (sin permiso para editar la ficha)"}.`;
      }
    }
  } else {
    const empresaId = a.empresa === "particular" ? await empresaParticular(supabase) : a.empresa;
    if (!empresaId || !/^[0-9a-f-]{36}$/i.test(empresaId))
      return { ok: false, mensaje: a.empresa === "particular" ? "Todavía no está activa la opción de pacientes particulares: elige una empresa o actualiza zamorApp." : "Elige la empresa del paciente." };
    const cat = d.cargo && a.empresa !== "particular" ? await resolverCatalogos(supabase, sesion.orgId!, empresaId, [], [d.cargo]) : null;
    // El id se crea aquí y no se pide la fila de vuelta (columnas de salud ocultas, ver crearPaciente)
    const id = crypto.randomUUID();
    const { error } = await supabase.from("trabajadores").insert({
      id, org_id: sesion.orgId!, empresa_id: empresaId, cedula: d.cedula, nombres: d.nombres, apellidos: d.apellidos,
      sexo: d.sexo ?? null, fecha_nacimiento: d.fecha_nacimiento, telefono: telefonoFicha(d.telefono), correo: d.correo ?? null,
      direccion: d.direccion ?? null, puesto_id: cat?.puesto(d.cargo ?? null) ?? null,
    });
    if (error) return { ok: false, mensaje: `No se pudo crear la ficha: ${error.message}` };
    trabajador = { id, empresa_id: empresaId, telefono: null, correo: null, direccion: null };
    invalidarEmpresas();
  }

  const citaId = crypto.randomUUID();
  const { error: errCita } = await supabase.from("citas").insert({
    id: citaId, org_id: sesion.orgId!, empresa_id: trabajador.empresa_id, trabajador_id: trabajador.id, fecha: a.fecha, hora: a.hora || null,
    motivo_id: a.motivoId && /^[0-9a-f-]{36}$/i.test(a.motivoId) ? a.motivoId : null,
    // Sin el motivo que escribió el paciente: la cita la ve RR. HH. de su empresa; ese texto queda solo con el servicio
    observacion: "Pidió la cita por enlace",
  });
  if (errCita) return { ok: false, mensaje: `La ficha quedó lista, pero la cita no: ${errCita.message}. Agéndala con «Agendar».`, trabajadorId: trabajador.id } as R;
  const { error: errSol } = await supabase.from("solicitudes_paciente").update({ resultado: "aceptada", trabajador_id: trabajador.id, cita_id: citaId }).eq("id", a.id);
  if (errSol) aviso = `Ficha y cita listas, pero la solicitud sigue en «Por revisar»: ${errorNube(errSol.message)}`;
  revalidatePath("/", "layout");
  olvidar("");
  return { ok: true, mensaje: aviso ?? (previos?.length ? "Cita agendada en su ficha." : "Ficha creada y cita agendada."), trabajadorId: trabajador.id };
}

async function cambiar(id: string, accion: "descartar" | "deshacer" | "anular"): Promise<R> {
  const s = await servicio();
  if ("error" in s) return { ok: false, mensaje: s.error! };
  const tabla = s.supabase.from("solicitudes_paciente");
  const q = accion === "descartar" ? tabla.update({ resultado: "descartada" }).eq("id", id).is("resultado", null)
    : accion === "deshacer" ? tabla.update({ resultado: null }).eq("id", id).eq("resultado", "descartada")
    : tabla.update({ anulado_en: new Date(ahora()).toISOString() }).eq("id", id).is("anulado_en", null).is("recibido_en", null);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, mensaje: errorNube(error.message) };
  revalidatePath("/atencion");
  return data?.length ? { ok: true } : { ok: false, mensaje: "Ya había cambiado. Recarga la pantalla." };
}

export async function descartarSolicitudPaciente(id: string) { return cambiar(id, "descartar"); }
export async function deshacerDescarte(id: string) { return cambiar(id, "deshacer"); }
export async function anularEnlacePaciente(id: string) { return cambiar(id, "anular"); }
