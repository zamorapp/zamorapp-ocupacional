"use server";

import { revalidatePath } from "next/cache";
import { invalidarEmpresas } from "@/lib/empresas";
import { normalizarCedula } from "@/lib/importar";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { supabaseConfigurado } from "@/lib/config";
import { avisarAlServicio } from "@/lib/aviso-servicio";
import { hora12 } from "@/lib/propuesta";

export type Resultado = { ok: boolean; mensaje: string };

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

// La empresa pide la cita; el servicio médico la confirma o reprograma
const TOPE_LOTE = 200;

// Una o varias citas con la misma fecha y motivo, en un solo insert. La RLS decide qué trabajadores ve el usuario:
// los que no aparecen (otra empresa o borrados) se informan como rechazados.
export async function solicitarCita(_: Resultado | null, datos: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  const ids = [...new Set(datos.getAll("trabajador_id").map(String).filter(Boolean))];
  const nuevos = leerNuevos(datos);
  const fecha = texto(datos, "fecha");
  if ((!ids.length && !nuevos.length) || !fecha) return { ok: false, mensaje: "Elige al menos un trabajador y la fecha." };
  if (ids.length + nuevos.length > TOPE_LOTE) return { ok: false, mensaje: `Máximo ${TOPE_LOTE} trabajadores por solicitud.` };
  const hoy = hoyCaracas();
  if (fecha < hoy) return { ok: false, mensaje: "La fecha ya pasó." };

  const supabase = await crearClienteServidor();
  // Con horario del servicio (20261030770000): solo horas con cupo. Varios trabajadores se reparten desde la hora elegida
  // en los turnos siguientes con cupo. Se revisa ANTES de registrar trabajadores nuevos para no dejar nada a medias.
  const hora = texto(datos, "hora");
  let horas: (string | null)[] | null = null;
  const empresaRef = texto(datos, "empresa_nuevos")
    ?? (ids.length ? (await supabase.from("trabajadores").select("empresa_id").eq("id", ids[0]).maybeSingle()).data?.empresa_id : null);
  if (empresaRef) {
    const { data: ag } = await supabase.rpc("agenda_portal", { p_empresa: empresaRef, p_fecha: fecha });
    const agenda = ag as { configurado: boolean; horas?: { hora: string; libres: number }[] } | null;
    if (agenda?.configurado) {
      if (!hora) return { ok: false, mensaje: "Elija una de las horas disponibles." };
      const cupos = (agenda.horas ?? []).filter((h) => h.hora >= hora.slice(0, 5) && h.libres > 0).flatMap((h) => Array<string>(h.libres).fill(h.hora));
      const total = ids.length + nuevos.length;
      if (cupos.length < total) {
        return { ok: false, mensaje: cupos.length
          ? `Desde las ${hora12(hora)} de ese día solo quedan ${cupos.length} ${cupos.length === 1 ? "cupo" : "cupos"} para ${total} trabajadores. Elija una hora más temprana u otro día.`
          : "Esa hora ya no está disponible. Elija otra de la lista." };
      }
      horas = cupos.slice(0, total);
    }
  }
  // Trabajadores que aún no están en la nómina: RR. HH. los registra aquí mismo con cédula y nombre (la RLS exige su empresa)
  if (nuevos.length) {
    const empresaId = texto(datos, "empresa_nuevos");
    if (!empresaId) return { ok: false, mensaje: "Elige la empresa de los trabajadores nuevos." };
    // Ids creados aquí, sin pedir las filas de vuelta (las columnas de salud están ocultas: ver crearPaciente)
    const creados = nuevos.map((n) => ({ ...n, id: crypto.randomUUID(), org_id: sesion.orgId, empresa_id: empresaId }));
    const { error } = await supabase.from("trabajadores").insert(creados);
    if (error) {
      if (error.code === "23505") return { ok: false, mensaje: "No se pudo registrar uno de los trabajadores nuevos. Búscalo por cédula; si no aparece, avísale al servicio médico." };
      return { ok: false, mensaje: error.code === "42501" ? "Tu usuario no puede registrar trabajadores en esa empresa." : error.message };
    }
    ids.push(...creados.map((c) => c.id));
  }
  // En tandas de 100 para no pasar el límite de largo de la URL (200 UUID ≈ 7,5 KB)
  const tandas = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) =>
      supabase.from("trabajadores").select("id, empresa_id").in("id", ids.slice(i * 100, i * 100 + 100)),
    ),
  );
  const validos = tandas.flatMap((t) => t.data ?? []);
  const rechazados = ids.length - validos.length;
  if (!validos.length) return { ok: false, mensaje: "Ninguno de los trabajadores elegidos pertenece a tus empresas." };

  const comun = {
    org_id: sesion.orgId,
    fecha,
    hora,
    motivo_id: texto(datos, "motivo_id"),
    nota_empresa: texto(datos, "nota"),
    estado: "solicitada" as const,
    origen: "portal" as const,
    solicitada_por: sesion.usuarioId,
  };
  const { error } = await supabase.from("citas").insert(validos.map((t, i) => ({ ...comun, ...(horas ? { hora: horas[i] } : {}), empresa_id: t.empresa_id, trabajador_id: t.id })));
  // 23514: la base rechazó una hora (otro la tomó en ese instante); el mensaje ya viene claro para RR. HH.
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu usuario no puede solicitar citas para esta empresa." : error.message };
  const reparto = horas && new Set(horas).size > 1
    ? ` Se repartieron por turnos: ${[...new Set(horas)].map((h) => `${hora12(h!)} (${horas!.filter((x) => x === h).length})`).join(", ")}.`
    : "";
  invalidarEmpresas();
  revalidatePath("/portal");
  const n = validos.length;
  const { data: emp } = await supabase.from("empresas").select("razon_social").in("id", [...new Set(validos.map((t) => t.empresa_id))]);
  const nombres = (emp ?? []).map((e) => e.razon_social).join(", ");
  avisarAlServicio({
    rol: sesion.rol,
    empresaId: String(validos[0].empresa_id),
    asunto: `${n === 1 ? "Nueva cita pedida" : `${n} citas pedidas`} · ${nombres}`,
    lineas: [
      `${sesion.nombre} (RR. HH. de ${nombres}) pidió ${n === 1 ? "una cita" : `${n} citas`} para el ${fecha.split("-").reverse().join("/")}${hora ? ` a las ${hora}` : ""}.`,
      ...(nuevos.length ? [`Registró ${nuevos.length === 1 ? "un trabajador nuevo" : `${nuevos.length} trabajadores nuevos`}: ${nuevos.map((x) => `${x.nombres} ${x.apellidos} (${x.cedula})`).join(", ")}.`] : []),
      "Confírmala o propón otra hora en Atención médica.",
    ],
    ruta: "/atencion",
  });
  return {
    ok: true,
    mensaje: `${n === 1 ? "Solicitud enviada" : `${n} solicitudes enviadas`} al servicio médico.${reparto}${rechazados ? ` ${rechazados} no se enviaron: no pertenecen a tus empresas.` : ""}`,
  };
}

type Nuevo = { cedula: string; nombres: string; apellidos: string };

// «nuevo» llega como JSON por cada trabajador que no está en la nómina; se limpia y se descarta lo incompleto
function leerNuevos(datos: FormData): Nuevo[] {
  const vistos = new Set<string>();
  return datos.getAll("nuevo").flatMap((v) => {
    try {
      const n = JSON.parse(String(v)) as Partial<Nuevo>;
      const cedula = normalizarCedula(String(n.cedula ?? ""));
      const nombres = String(n.nombres ?? "").trim().slice(0, 80);
      const apellidos = String(n.apellidos ?? "").trim().slice(0, 80);
      if (!cedula || !nombres || !apellidos || vistos.has(cedula)) return [];
      vistos.add(cedula);
      return [{ cedula, nombres, apellidos }];
    } catch {
      return [];
    }
  });
}

export async function cancelarSolicitud(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("citas").update({ estado: "cancelada" }).eq("id", id).eq("estado", "solicitada");
  if (error) return { ok: false, mensaje: error.message };
  invalidarEmpresas();
  revalidatePath("/portal");
  return { ok: true, mensaje: "" };
}

// RR. HH. responde a la otra hora propuesta por el servicio: Aceptar (queda confirmada) o Pedir otra (vuelve al servicio)
export async function responderPropuesta(ids: string[], r: { aceptar: boolean; hora?: string | null; fecha?: string | null; nota?: string | null }): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  if (!ids.length) return { ok: false, mensaje: "Nada que responder." };
  if (!r.aceptar && !r.fecha) return { ok: false, mensaje: "Indique el día que prefiere." };
  const supabase = await crearClienteServidor();
  // Uno por uno: al pedir otra hora varios trabajadores se reparten igual que al pedir (la base valida cada turno)
  let agenda: { hora: string; libres: number }[] | null = null;
  if (!r.aceptar && r.hora) {
    const { data: c } = await supabase.from("citas").select("empresa_id").eq("id", ids[0]).maybeSingle();
    const { data: ag } = c ? await supabase.rpc("agenda_portal", { p_empresa: c.empresa_id, p_fecha: r.fecha }) : { data: null };
    const a = ag as { configurado: boolean; horas?: { hora: string; libres: number }[] } | null;
    if (a?.configurado) agenda = a.horas ?? [];
  }
  const cupos = agenda ? agenda.filter((h) => h.hora >= r.hora!.slice(0, 5) && h.libres > 0).flatMap((h) => Array<string>(h.libres).fill(h.hora)) : null;
  if (cupos && cupos.length < ids.length) {
    return { ok: false, mensaje: `Desde las ${hora12(r.hora!)} de ese día solo quedan ${cupos.length} cupos para ${ids.length} trabajadores. Elija otra hora u otro día.` };
  }
  for (const [i, id] of ids.entries()) {
    const { error } = await supabase.rpc("responder_propuesta", {
      p_cita: id, p_aceptar: r.aceptar, p_hora: (cupos ? cupos[i] : r.hora) || null, p_fecha: r.fecha || null, p_nota: r.nota?.trim() || null,
    });
    if (error) return { ok: false, mensaje: i ? `${i} respondidas; las demás no: ${error.message}` : error.message };
  }
  revalidatePath("/portal");
  return { ok: true, mensaje: r.aceptar ? "Listo: cita confirmada." : "Listo: el servicio médico recibió su nueva propuesta." };
}

// Horas libres de un día (solo cifras) para elegir al pedir o al pedir otra hora
export async function agendaPortal(empresaId: string, fecha: string) {
  // Modo demo (sin Supabase): una mañana de ejemplo para ver cómo elige RR. HH.
  if (!supabaseConfigurado) {
    const horas = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30"].map((hora, i) => ({ hora, libres: [0, 1, 2, 2, 0, 1, 2, 2][i] }));
    return { configurado: true, horas, dias: [0, 1, 2, 5, 6].map((d) => ({ fecha: sumarDias(fecha, d), libres: 8 })) };
  }
  if (!empresaId || !fecha) return { configurado: false };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("agenda_portal", { p_empresa: empresaId, p_fecha: fecha });
  return (data as { configurado: boolean; horas?: { hora: string; libres: number }[]; dias?: { fecha: string; libres: number }[] } | null) ?? { configurado: false };
}
