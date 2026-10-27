"use server";

import { revalidatePath } from "next/cache";
import type { Evento } from "@/lib/eventos-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string; id?: string };

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

// Fecha y hora local de Venezuela (datetime-local) → ISO
const aIso = (v: string | null) => (v ? new Date(`${v}:00-04:00`).toISOString() : null);

export async function reportarEvento(_: Resultado | null, datos: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para registrar eventos." };

  const tipo = texto(datos, "tipo") as Evento["tipo"] | null;
  const trabajadorId = texto(datos, "trabajador_id");
  let empresaId = texto(datos, "empresa_id");
  const fecha = aIso(texto(datos, "fecha_hora"));
  if (!tipo) return { ok: false, mensaje: "Elige el tipo de evento." };
  if (!fecha) return { ok: false, mensaje: "Indica la fecha y hora." };
  if (tipo !== "incidente" && !trabajadorId) return { ok: false, mensaje: "Elige el trabajador afectado." };

  const supabase = await crearClienteServidor();
  if (trabajadorId) {
    const { data: t } = await supabase.from("trabajadores").select("empresa_id").eq("id", trabajadorId).single();
    empresaId = t?.empresa_id ?? empresaId;
  }
  if (!empresaId) return { ok: false, mensaje: "Elige la empresa." };
  // Desde una consulta: solo se enlaza si es una consulta visible de ese mismo trabajador
  let consultaId = texto(datos, "consulta_id");
  if (consultaId) {
    const { data: c } = await supabase.from("consultas").select("id").eq("id", consultaId).eq("trabajador_id", trabajadorId ?? "").maybeSingle();
    consultaId = c?.id ?? null;
  }

  const { data, error } = await supabase
    .from("eventos")
    .insert({
      org_id: sesion.orgId,
      empresa_id: empresaId,
      trabajador_id: trabajadorId,
      tipo,
      subtipo: tipo === "accidente" ? texto(datos, "subtipo") ?? "trabajo" : null,
      fecha_hora: fecha,
      // En enfermedad ocupacional, el plazo corre desde el diagnóstico
      fecha_diagnostico: tipo === "enfermedad" ? fecha : null,
      lugar: texto(datos, "lugar"),
      descripcion: texto(datos, "descripcion"),
      gravedad: texto(datos, "gravedad"),
      // Si se registra desde una consulta, queda enlazado a ella
      consulta_id: consultaId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu rol no permite registrar eventos." : error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Evento registrado.", id: data.id };
}

export async function guardarEvento(e: Evento): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  const supabase = await crearClienteServidor();

  // El estado avanza solo según lo registrado, salvo que ya esté cerrado
  let estado = e.estado;
  if (estado !== "cerrado") {
    if (e.causasInmediatas || e.causasBasicas || e.acciones.length) estado = "investigando";
    else if (e.fechaDeclaracion) estado = "declarado";
    else estado = "abierto";
  }

  const { error } = await supabase
    .from("eventos")
    .update({
      subtipo: e.subtipo,
      fecha_hora: e.fechaHora,
      lugar: e.lugar || null,
      descripcion: e.descripcion || null,
      testigos: e.testigos || null,
      parte_cuerpo: e.parteCuerpo || null,
      naturaleza_lesion: e.naturalezaLesion || null,
      agente: e.agente || null,
      forma: e.forma || null,
      gravedad: e.gravedad || null,
      con_tiempo_perdido: e.conTiempoPerdido,
      dias_perdidos: e.diasPerdidos || 0,
      dias_cargados: e.diasCargados || 0,
      fecha_aviso: e.fechaAviso,
      fecha_declaracion: e.fechaDeclaracion,
      numero_declaracion: e.numeroDeclaracion || null,
      cie10: e.cie10 || null,
      diagnostico: e.diagnostico || null,
      fecha_diagnostico: e.fechaDiagnostico,
      en_anexo1: e.enAnexo1,
      fecha_informe_nt02: e.fechaInformeNt02,
      estado_certificacion: e.estadoCertificacion || null,
      causas_inmediatas: e.causasInmediatas || null,
      causas_basicas: e.causasBasicas || null,
      acciones: e.acciones.filter((a) => a.descripcion.trim()),
      estado,
      turno: e.turno || null,
      actividad_momento: e.actividadMomento || null,
      motivo_actividad: e.motivoActividad || null,
      lesiones: e.lesiones || null,
      testigos_detalle: e.testigosDetalle.filter((t) => t.nombre.trim()),
      acto_inseguro: e.actoInseguro || null,
      condicion_insegura: e.condicionInsegura || null,
      incapacidad: e.incapacidad,
      // Los días cargados los recalcula la base según la incapacidad (COVENIN 474, sección 4)
      cargos: e.incapacidad === "parcial_permanente" ? e.cargos.filter((c) => c.concepto.trim() && c.dias > 0) : [],
      observaciones: e.observaciones || null,
      potencial_discapacidad: e.potencialDiscapacidad,
      certificacion_fecha: e.certificacionFecha || null,
      certificacion_numero: e.certificacionNumero || null,
      discapacidad: e.discapacidad,
      discapacidad_pct: e.discapacidad ? e.discapacidadPct : null,
    })
    .eq("id", e.id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Guardado." };
}

export async function cerrarEvento(id: string, cerrar: boolean): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("eventos").update({ estado: cerrar ? "cerrado" : "investigando" }).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: cerrar ? "Evento cerrado." : "Evento reabierto." };
}
