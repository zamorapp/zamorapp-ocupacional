"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { datosOrganizacion } from "@/lib/organizacion";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { enlaceWhatsApp } from "@/lib/mensajes";
import { URL_PUBLICA } from "@/lib/invitaciones";
import { pendiente } from "@/lib/paraclinicos";
import type { Paraclinico } from "@/lib/consultas-tipos";
import { COLUMNAS_TELE, deFila } from "@/lib/telemedicina";
import { MEDIOS, TEXTO_SALA, plazoSala, type Consentimiento, type Medio, type Teleconsulta } from "@/lib/telemedicina-tipos";
import { iniciarConsulta, type Resultado } from "./acciones";

const MEDICOS = ["medico", "gerente_medico", "administrador"];
const corto = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

async function permitido(): Promise<Resultado | null> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para registrar la consulta a distancia." };
  if (!MEDICOS.includes(sesion.rol ?? "")) return { ok: false, mensaje: "La consulta a distancia la registra el médico." };
  return null;
}

export type DatosTele = {
  medio: Medio; duracionMin: number | null; ubicacion: string; telefono: string; identidad: string;
  consentimiento: Exclude<Consentimiento, "escrito"> | null; // null = no cambiar
  fallas: string;
  sala: boolean; // dejar en la sala de espera
};

// Guarda (o crea) lo de la consulta a distancia y, si se pide, deja la consulta en la sala de espera.
// La base pone empresa, paciente, autor y horas; «escrito» solo lo da el paciente en su enlace.
export async function guardarTeleconsulta(consultaId: string, d: DatosTele): Promise<Resultado & { tele?: Teleconsulta; sala?: { alertaId: string; revisarAntes: string | null } | null }> {
  const no = await permitido();
  if (no) return no;
  if (!MEDIOS.some((m) => m.valor === d.medio)) return { ok: false, mensaje: "Elige el medio." };
  const duracion = d.duracionMin == null || Number.isNaN(d.duracionMin) ? null : Math.min(600, Math.max(0, Math.round(d.duracionMin)));
  const supabase = await crearClienteServidor();
  const { data: c } = await supabase.from("consultas").select("org_id, trabajador_id, estado, paraclinicos").eq("id", consultaId).maybeSingle();
  if (!c) return { ok: false, mensaje: "Consulta no encontrada." };
  const fila = {
    medio: d.medio, duracion_min: duracion, ubicacion: corto(d.ubicacion, 200), telefono: corto(d.telefono, 40),
    identidad: corto(d.identidad, 200), fallas: corto(d.fallas, 500), ...(d.consentimiento ? { consentimiento: d.consentimiento } : {}),
  };
  const { data: existe } = await supabase.from("teleconsultas").select("id").eq("consulta_id", consultaId).maybeSingle();
  const r = existe
    ? await supabase.from("teleconsultas").update(fila).eq("id", existe.id).select(COLUMNAS_TELE).single()
    : await supabase.from("teleconsultas").insert({ ...fila, org_id: c.org_id, consulta_id: consultaId }).select(COLUMNAS_TELE).single();
  if (r.error) return { ok: false, mensaje: r.error.code === "42501" ? "La consulta a distancia la registra el médico." : "No se pudo guardar." };

  // Sala de espera = «Alerta para la próxima evaluación» con los paraclínicos que aún no tienen resultado
  const { data: enSala } = await supabase.from("alertas_clinicas").select("id, revisar_antes")
    .eq("consulta_id", consultaId).eq("estado", "pendiente").eq("texto", TEXTO_SALA).limit(1).maybeSingle();
  let sala: { alertaId: string; revisarAntes: string | null } | null = enSala ? { alertaId: enSala.id, revisarAntes: enSala.revisar_antes } : null;
  if (d.sala && !enSala) {
    const { ajustes } = await datosOrganizacion();
    const pedidos = ((c.paraclinicos ?? []) as Paraclinico[]).filter(pendiente).slice(0, 30)
      .map((p) => ({ id: String(p.id || p.nombre), nombre: String(p.nombre).trim().slice(0, 200) })).filter((p) => p.nombre);
    const revisar = sumarDias(hoyCaracas(), plazoSala(ajustes.seguimiento_distancia_dias));
    const a = await supabase.from("alertas_clinicas")
      .insert({ org_id: c.org_id, trabajador_id: c.trabajador_id, consulta_id: consultaId, texto: TEXTO_SALA, paraclinicos: pedidos, revisar_antes: revisar })
      .select("id, revisar_antes").single();
    if (a.error) return { ok: false, mensaje: "Se guardó la consulta a distancia, pero no se pudo dejar en la sala de espera." };
    sala = { alertaId: a.data.id, revisarAntes: a.data.revisar_antes };
  } else if (!d.sala && enSala) {
    await supabase.from("alertas_clinicas").update({ estado: "descartada", respuesta: "Quitada de la sala de espera" }).eq("id", enSala.id);
    sala = null;
  }
  revalidatePath("/atencion/a-distancia");
  return { ok: true, mensaje: "Consulta a distancia guardada.", tele: deFila(r.data as Parameters<typeof deFila>[0]), sala };
}

// Enlace «Acepto» de 7 días para el consentimiento por escrito (Ley de Telesalud). Solo se guarda su huella.
// Necesita internet: el paciente lo abre en la nube.
export async function enlaceConsentimiento(consultaId: string): Promise<Resultado & { whatsapp?: string; url?: string; vence?: string | null }> {
  const no = await permitido();
  if (no) return no;
  const supabase = await crearClienteServidor();
  const { data: t } = await supabase.from("teleconsultas").select("id, telefono, consentimiento, consultas(trabajadores(nombres, telefono))").eq("consulta_id", consultaId).maybeSingle();
  if (!t) return { ok: false, mensaje: "Guarda primero la consulta a distancia." };
  if (t.consentimiento === "escrito") return { ok: false, mensaje: "La paciente ya aceptó por escrito." };
  const token = randomBytes(32).toString("base64url");
  const huella = "\\x" + createHash("sha256").update(token, "utf8").digest("hex");
  const { data, error } = await supabase.from("teleconsultas").update({ enlace_hash: huella }).eq("id", t.id).select("enlace_vence").single();
  if (error) return { ok: false, mensaje: "No se pudo crear el enlace." };
  const trab = (t.consultas as unknown as { trabajadores: { nombres: string; telefono: string | null } | null } | null)?.trabajadores;
  const { nombre } = await datosOrganizacion();
  const url = `${URL_PUBLICA}/consentimiento/${token}`;
  const texto = `Hola${trab?.nombres ? ` ${trab.nombres.split(" ")[0]}` : ""}. Para dejar registrada su consulta a distancia con ${nombre}, lea y acepte el consentimiento en este enlace (vence en 7 días):`;
  return { ok: true, mensaje: "Enlace listo.", url, whatsapp: enlaceWhatsApp(t.telefono || trab?.telefono, `${texto} ${url}`), vence: data.enlace_vence };
}

// «Dar N días más» en la sala de espera (desde hoy o desde la fecha que tenía, la más tarde)
export async function extenderSala(alertaId: string, dias = 15): Promise<Resultado & { revisarAntes?: string }> {
  const no = await permitido();
  if (no) return no;
  const supabase = await crearClienteServidor();
  const { data: a } = await supabase.from("alertas_clinicas").select("revisar_antes").eq("id", alertaId).eq("estado", "pendiente").maybeSingle();
  if (!a) return { ok: false, mensaje: "Ya no está en la sala de espera." };
  const hoy = hoyCaracas();
  const desde = a.revisar_antes && a.revisar_antes > hoy ? a.revisar_antes : hoy;
  const revisar = sumarDias(desde, Math.min(90, Math.max(1, Math.round(dias))));
  const { error } = await supabase.from("alertas_clinicas").update({ revisar_antes: revisar }).eq("id", alertaId).eq("estado", "pendiente");
  if (error) return { ok: false, mensaje: "No se pudo cambiar el plazo." };
  revalidatePath("/atencion/a-distancia");
  return { ok: true, mensaje: `Espera hasta el ${revisar.split("-").reverse().join("/")}.`, revisarAntes: revisar };
}

// «Archivar» a mano: queda en la historia como descartada, con el motivo
export async function archivarSala(alertaId: string): Promise<Resultado> {
  const no = await permitido();
  if (no) return no;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("alertas_clinicas").update({ estado: "descartada", respuesta: "Archivada a mano (seguimiento a distancia)" })
    .eq("id", alertaId).eq("estado", "pendiente").select("id").maybeSingle();
  if (error || !data) return { ok: false, mensaje: "No se pudo archivar." };
  revalidatePath("/atencion/a-distancia");
  return { ok: true, mensaje: "Archivada. Queda en su historia." };
}

// «Nueva consulta a distancia» desde la ficha: abre la consulta con motivo Telemedicina y el panel a la vista
export async function iniciarADistancia(trabajadorId: string): Promise<Resultado> {
  const no = await permitido();
  if (no) return no;
  const sesion = await obtenerSesion();
  const supabase = await crearClienteServidor();
  const { data: tel } = await supabase.from("lista_items").select("id").eq("org_id", sesion.orgId).eq("lista", "motivo_consulta").eq("codigo", "TEL").eq("activo", true).limit(1).maybeSingle();
  return iniciarConsulta(trabajadorId, tel?.id ?? undefined, undefined, { distancia: true });
}

// «Abrir control»: consulta nueva del paciente, enlazada a la consulta a distancia (una sola vez)
export async function abrirControl(consultaDistanciaId: string): Promise<Resultado> {
  const no = await permitido();
  if (no) return no;
  const supabase = await crearClienteServidor();
  const { data: t } = await supabase.from("teleconsultas").select("trabajador_id, control_id").eq("consulta_id", consultaDistanciaId).maybeSingle();
  if (!t) return { ok: false, mensaje: "No se encontró la consulta a distancia." };
  return iniciarConsulta(t.trabajador_id, undefined, undefined, { controlDe: t.control_id ? undefined : consultaDistanciaId });
}
