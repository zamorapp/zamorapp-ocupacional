"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DatosConsulta } from "@/lib/consultas-tipos";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string };

export type DiagnosticoEncontrado = { cie10: string; descripcion: string; usos: number };

export async function buscarDiagnosticos(texto: string): Promise<DiagnosticoEncontrado[]> {
  if (texto.trim().length < 2) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("buscar_diagnosticos", { p_texto: texto, p_limite: 15 });
  return (data ?? []) as DiagnosticoEncontrado[];
}

export type PacienteEncontrado = { id: string; nombre: string; cedula: string; empresa: string };

export async function buscarPacientes(texto: string): Promise<PacienteEncontrado[]> {
  const q = texto.trim().replace(/[%,()]/g, "");
  if (q.length < 2) return [];
  const supabase = await crearClienteServidor();
  const soloNumeros = q.replace(/\D/g, "");
  let consulta = supabase.from("trabajadores").select("id, nombres, apellidos, cedula, empresas(razon_social)").limit(12);
  consulta = soloNumeros.length >= 4
    ? consulta.ilike("cedula", `%${soloNumeros}%`)
    : consulta.or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%`);
  const { data } = await consulta.order("apellidos");
  return (data ?? []).map((t) => ({
    id: t.id,
    nombre: `${t.nombres} ${t.apellidos}`,
    cedula: t.cedula,
    empresa: (t.empresas as unknown as { razon_social: string } | null)?.razon_social ?? "",
  }));
}

// Abre una consulta nueva con el examen precargado en normal y los antecedentes de la última consulta
export async function iniciarConsulta(trabajadorId: string, motivoId?: string, citaId?: string): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para registrar consultas." };
  const supabase = await crearClienteServidor();

  const [{ data: t }, { data: previa }, listas] = await Promise.all([
    supabase.from("trabajadores").select("empresa_id, dependencia_id, puesto_id").eq("id", trabajadorId).single(),
    supabase.from("consultas").select("antecedentes, habitos").eq("trabajador_id", trabajadorId).order("fecha", { ascending: false }).limit(1).maybeSingle(),
    opciones(sesion.orgId, ["examen_funcional", "examen_fisico", "habito"]),
  ]);
  if (!t) return { ok: false, mensaje: "Paciente no encontrado." };

  const plantilla = (lista: "examen_funcional" | "examen_fisico") =>
    listas[lista].map((i) => ({ clave: i.codigo ?? i.id, nombre: i.nombre, valor: i.texto ?? "", normal: i.texto ?? "" }));

  const habitosPrevios = new Map<string, string>(
    (Array.isArray(previa?.habitos) ? previa.habitos : []).map((h: { clave: string; valor: string }) => [h.clave, h.valor]),
  );

  const { data, error } = await supabase
    .from("consultas")
    .insert({
      org_id: sesion.orgId,
      empresa_id: t.empresa_id,
      trabajador_id: trabajadorId,
      dependencia_id: t.dependencia_id,
      puesto_id: t.puesto_id,
      motivo_id: motivoId || null,
      tipo: previa ? "sucesiva" : "primera",
      antecedentes: previa?.antecedentes ?? [],
      habitos: listas.habito.map((h) => ({ clave: h.codigo ?? h.id, nombre: h.nombre, valor: habitosPrevios.get(h.codigo ?? h.id) ?? "" })),
      examen_funcional: plantilla("examen_funcional"),
      examen_fisico: plantilla("examen_fisico"),
    })
    .select("id")
    .single();
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu usuario no tiene acceso clínico. Pide al administrador que te lo active en Usuarios." : error.message };
  // Si viene de la cola, la cita queda "en consulta" y enlazada
  if (citaId) {
    await supabase.from("citas").update({ estado: "en_consulta", consulta_id: data.id }).eq("id", citaId);
  }
  redirect(`/atencion/${data.id}`);
}

export async function guardarConsulta(d: DatosConsulta, cerrar: boolean): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };

  if (cerrar) {
    if (!d.motivoId) return { ok: false, mensaje: "Elige el motivo de consulta antes de cerrar." };
    if (d.reposo.activo && d.reposo.hasta < d.reposo.desde) return { ok: false, mensaje: "El reposo termina antes de empezar." };
  }

  const diags = d.sano ? [] : d.diagnosticos.filter((x) => x.descripcion.trim());
  const supabase = await crearClienteServidor();
  // Todo en una transacción (función guardar_consulta): se guarda completo o no se guarda nada
  const { error } = await supabase.rpc("guardar_consulta", {
    p_id: d.id,
    p_consulta: {
      tipo: d.tipo,
      motivo_id: d.motivoId,
      motivo_texto: d.motivoTexto || null,
      enfermedad_actual: d.enfermedadActual || null,
      antecedentes: d.antecedentes,
      habitos: d.habitos,
      signos_vitales: d.signos,
      examen_funcional: d.examenFuncional,
      examen_fisico: d.examenFisico,
      paraclinicos: d.paraclinicos,
      tratamiento: d.tratamiento.filter((m) => m.medicina),
      indicaciones: d.indicaciones || null,
      interconsultas: d.interconsultas.filter((i) => i.especialidad),
      conclusiones: d.conclusiones || null,
      recomendaciones_empresa: d.recomendacionesEmpresa || null,
      recomendaciones_trabajador: d.recomendacionesTrabajador || null,
      observacion_privada: d.observacionPrivada || null,
      autoriza_paciente: d.autorizaPaciente,
      sano: d.sano,
      potencial_discapacidad: d.potencialDiscapacidad,
      discapacidad_nota: d.potencialDiscapacidad ? d.discapacidadNota || null : null,
      reubicacion: d.reubicacion.activa
        ? { tipo: d.reubicacion.tipo, puesto_actual: d.reubicacion.puestoActual || null, puesto_propuesto: d.reubicacion.puestoPropuesto || null,
            desde: d.reubicacion.desde || null, hasta: d.reubicacion.tipo === "temporal" ? d.reubicacion.hasta || null : null,
            motivo: d.reubicacion.motivo || null, restricciones: d.reubicacion.restricciones || null }
        : null,
      informe_libre: d.informeLibre.cuerpo.trim() ? { titulo: d.informeLibre.titulo || null, dirigido_a: d.informeLibre.dirigidoA || null, cuerpo: d.informeLibre.cuerpo } : null,
    },
    p_diagnosticos: diags.map((x, i) => ({
      cie10: x.cie10.trim().toUpperCase() || "—",
      descripcion: x.descripcion.trim(),
      sistema: x.sistema || null,
      origen: x.origen,
      principal: i === 0 || x.principal,
    })),
    p_aptitud: d.aptitud.clasificacion
      ? {
          clasificacion: d.aptitud.clasificacion,
          observacion: d.aptitud.observacion || null,
          limitaciones: d.aptitud.limitaciones,
          vigente_hasta: d.aptitud.vigenteHasta || null,
        }
      : null,
    p_reposo: d.reposo.activo
      ? { causa: d.reposo.causa, ente: d.reposo.ente, desde: d.reposo.desde, hasta: d.reposo.hasta, cie10: d.reposo.cie10 || null,
          medico_externo: d.reposo.medicoExterno || null, centro_ivss: d.reposo.centroIvss || null, validado_ivss: d.reposo.validadoIvss }
      : null,
    p_cerrar: cerrar,
  });
  if (error) return { ok: false, mensaje: error.message };

  revalidatePath("/", "layout");
  return { ok: true, mensaje: cerrar ? "Consulta cerrada." : "Guardado." };
}

export async function reabrirConsulta(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("consultas").update({ estado: "borrador", hora_cierre: null }).eq("id", id).eq("estado", "cerrada");
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath(`/atencion/${id}`);
  return { ok: true, mensaje: "Consulta reabierta." };
}

// Firma: la consulta queda bloqueada; si hay un error se corrige con corregirConsulta (motivo obligatorio)
export async function firmarConsulta(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("firmar_consulta", { p_id: id });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath(`/atencion/${id}`);
  return { ok: true, mensaje: "Consulta firmada. Si encuentras un error, usa «Corregir» e indica el motivo." };
}

// Corregir una consulta firmada: guarda la versión firmada (no se pierde ni se edita) y la devuelve a borrador.
// Solo el médico autor, el gerente médico o el administrador con acceso clínico (lo valida reabrir_consulta en la base).
export async function corregirConsulta(id: string, motivo: string): Promise<Resultado & { revision?: number }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reabrir_consulta", { p_id: id, p_motivo: motivo.trim() });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath(`/atencion/${id}`);
  return { ok: true, mensaje: "Consulta abierta para corregir. La versión firmada quedó guardada en el historial.", revision: data as number };
}

// Resultados de los exámenes ya solicitados: se pueden escribir también con la consulta cerrada (llegan días después).
// guardar_resultados solo toca resultado, estado y unidad/referencia; con la consulta firmada hay que corregirla.
export async function guardarResultados(id: string, paraclinicos: DatosConsulta["paraclinicos"]): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const resultados = paraclinicos.map((p) => ({ id: p.id, resultado: p.resultado, estado: p.estado ?? "", manual: Boolean(p.manual), unidad: p.unidad ?? "", referencia: p.referencia ?? "" }));
  const { error } = await supabase.rpc("guardar_resultados", { p_id: id, p_resultados: resultados });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Resultados guardados." };
}

// «No recordar más»: apaga el aviso de la campana por resultados pendientes de esta consulta (solo el médico autor)
export async function noRecordarResultados(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("ignorar_recordatorio_resultados", { p_consulta: id });
  if (error) return { ok: false, mensaje: error.message };
  return data ? { ok: true, mensaje: "Listo: no te lo recordaremos más en la campana." } : { ok: false, mensaje: "Solo el médico de la consulta recibe ese recordatorio." };
}

// Duplicar: borrador nuevo de hoy con el contenido clínico de la consulta (sin signos, resultados, aptitud,
// reposo, reubicación ni firma). Lo hace duplicar_consulta en la base, en una sola transacción.
export async function duplicarConsulta(id: string): Promise<Resultado & { id?: string }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("duplicar_consulta", { p_id: id });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu usuario no tiene acceso clínico para crear consultas." : error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Consulta duplicada.", id: data as string };
}
