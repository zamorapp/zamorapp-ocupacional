"use server";

import { revalidatePath } from "next/cache";
// Los reportes recuerdan sus cálculos unos minutos: cada cambio clínico los borra
import { olvidar } from "@/lib/memo";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { DatosConsulta } from "@/lib/consultas-tipos";
import type { ParaclinicoPedido } from "@/lib/alertas-tipos";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { siguienteEnEspera } from "@/lib/citas";
import { fechaCorta, periodoDeConsulta } from "@/lib/periodos";
import { hoyCaracas } from "@/lib/fecha";

export type Resultado = { ok: boolean; mensaje: string };

export type DiagnosticoEncontrado = { cie10: string; descripcion: string; usos: number };

export async function buscarDiagnosticos(texto: string): Promise<DiagnosticoEncontrado[]> {
  if (texto.trim().length < 2) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("buscar_diagnosticos", { p_texto: texto, p_limite: 15 });
  return (data ?? []) as DiagnosticoEncontrado[];
}

// «Alerta para la próxima evaluación»: la deja cualquiera del personal clínico; la base pone autor, hora y empresa
export async function crearAlerta(consultaId: string, texto: string, paraclinicos: ParaclinicoPedido[], revisarAntes: string | null): Promise<Resultado & { id?: string }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para dejar alertas." };
  const limpio = texto.trim().slice(0, 500);
  const pedidos = paraclinicos.filter((p) => p?.nombre?.trim()).slice(0, 30).map((p) => ({ id: String(p.id), nombre: p.nombre.trim().slice(0, 200) }));
  if (!limpio && !pedidos.length) return { ok: false, mensaje: "Escribe qué revisar o elige un paraclínico." };
  if (revisarAntes && !/^\d{4}-\d{2}-\d{2}$/.test(revisarAntes)) return { ok: false, mensaje: "Fecha no válida." };
  const supabase = await crearClienteServidor();
  const { data: c } = await supabase.from("consultas").select("org_id, trabajador_id").eq("id", consultaId).maybeSingle();
  if (!c) return { ok: false, mensaje: "Consulta no encontrada." };
  const { data, error } = await supabase.from("alertas_clinicas")
    .insert({ org_id: c.org_id, trabajador_id: c.trabajador_id, consulta_id: consultaId, texto: limpio, paraclinicos: pedidos, revisar_antes: revisarAntes || null })
    .select("id").single();
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Solo el personal de salud deja alertas." : "No se pudo guardar la alerta." };
  return { ok: true, mensaje: "Alerta guardada para la próxima evaluación.", id: data.id };
}

// «Revisado» (con lo que se hizo) o «Descartar»: solo médico, gerente médico o administrador (lo exige la base)
export async function revisarAlerta(alertaId: string, consultaId: string, respuesta: string, descartar = false): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("alertas_clinicas")
    .update({ estado: descartar ? "descartada" : "revisada", respuesta: respuesta.trim().slice(0, 500) || null, revisada_en_consulta: consultaId })
    .eq("id", alertaId).select("estado").maybeSingle();
  if (error) return { ok: false, mensaje: error.code === "42501" ? "La alerta la marca revisada el médico." : "No se pudo guardar." };
  if (!data) return { ok: false, mensaje: "Alerta no encontrada." };
  return { ok: true, mensaje: descartar ? "Alerta descartada." : "Alerta revisada." };
}

export type PacienteEncontrado = { id: string; nombre: string; cedula: string; empresa: string };

export async function buscarPacientes(texto: string): Promise<PacienteEncontrado[]> {
  const q = texto.trim().replace(/[%,()]/g, "");
  if (q.length < 2 || (await obtenerSesion()).demo) return [];
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
  // Con la caché de 30 s del navegador (staleTimes), el Inicio y la cola no deben mostrar la consulta sin abrir
  revalidatePath("/panel");
  redirect(`/atencion/${data.id}`);
}

// «Siguiente paciente»: toma al primero que espera hoy y le abre la consulta en un clic. La cita se aparta primero
// (en_espera → en_consulta solo si nadie la tomó) para que dos médicos no abran dos consultas al mismo paciente.
export async function atenderSiguiente(): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para registrar consultas." };
  if (!sesion.clinico) return { ok: false, mensaje: "Tu usuario no tiene acceso clínico. Pide al administrador que te lo active en Usuarios." };
  const supabase = await crearClienteServidor();
  for (let intento = 0; intento < 3; intento++) {
    const s = await siguienteEnEspera();
    if (!s) return { ok: false, mensaje: "No hay nadie en espera." };
    const { data: tomada } = await supabase.from("citas").update({ estado: "en_consulta" }).eq("id", s.citaId).eq("estado", "en_espera").select("id");
    if (!tomada?.length) continue; // otro médico la tomó en ese instante: se busca el siguiente
    const devolver = () => supabase.from("citas").update({ estado: "en_espera" }).eq("id", s.citaId).eq("estado", "en_consulta").is("consulta_id", null);
    try {
      const r = await iniciarConsulta(s.trabajadorId, s.motivoId ?? undefined, s.citaId); // si abre, redirige
      await devolver();
      return r;
    } catch (e) {
      if (isRedirectError(e)) throw e; // la consulta se abrió
      await devolver();
      return { ok: false, mensaje: (e as Error).message || "No se pudo abrir la consulta." };
    }
  }
  return { ok: false, mensaje: "La cola cambió mientras tanto. Vuelve a intentarlo." };
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
      fecha: d.fecha,
      copiada_de: d.copiadaDe ?? null,
      tipo: d.tipo,
      motivo_id: d.motivoId,
      motivo_texto: d.motivoTexto || null,
      especialidad: d.especialidad.trim() || null,
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
            motivo: d.reubicacion.motivo || null, restricciones: d.reubicacion.restricciones || null, resultado: d.reubicacion.resultado || null }
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

  if (cerrar) revalidatePath("/atencion"); // la cola cambia al cerrar; el guardado común no vuelve a armar la pantalla
  olvidar("");
  return { ok: true, mensaje: cerrar ? "Consulta cerrada." : "Guardado." };
}

export async function reabrirConsulta(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("consultas").update({ estado: "borrador", hora_cierre: null }).eq("id", id).eq("estado", "cerrada");
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/atencion");
  olvidar("");
  return { ok: true, mensaje: "Consulta reabierta." };
}

// Firma: la consulta queda bloqueada; si hay un error se corrige con corregirConsulta (motivo obligatorio)
export async function firmarConsulta(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("firmar_consulta", { p_id: id });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/atencion");
  olvidar("");
  return { ok: true, mensaje: "Consulta firmada. Si encuentras un error, usa «Corregir» e indica el motivo." };
}

// Corregir una consulta firmada: guarda la versión firmada (no se pierde ni se edita) y la devuelve a borrador.
// Solo el médico autor, el gerente médico o el administrador con acceso clínico (lo valida reabrir_consulta en la base).
export async function corregirConsulta(id: string, motivo: string): Promise<Resultado & { revision?: number }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reabrir_consulta", { p_id: id, p_motivo: motivo.trim() });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/atencion");
  olvidar("");
  return { ok: true, mensaje: "Consulta abierta para corregir. La versión firmada quedó guardada en el historial.", revision: data as number };
}

// Resultados de los exámenes ya solicitados: se pueden escribir también con la consulta cerrada (llegan días después).
// guardar_resultados solo toca resultado, estado y unidad/referencia; con la consulta firmada hay que corregirla.
export async function guardarResultados(id: string, paraclinicos: DatosConsulta["paraclinicos"]): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const resultados = paraclinicos.map((p) => ({ id: p.id, resultado: p.resultado, estado: p.estado ?? "", manual: Boolean(p.manual), unidad: p.unidad ?? "", referencia: p.referencia ?? "" }));
  const { error } = await supabase.rpc("guardar_resultados", { p_id: id, p_resultados: resultados });
  if (error) return { ok: false, mensaje: error.message };
  olvidar("");
  revalidatePath("/panel"); // «Resultados por recibir» del Inicio
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
  revalidatePath("/atencion");
  olvidar("");
  return { ok: true, mensaje: "Consulta duplicada.", id: data as string };
}

// Aviso (no bloquea) al mover la fecha de la evaluación: si la fecha anterior o la nueva cae en un trimestre cuyo
// informe de vigilancia ya se envió a la empresa, ese informe ya no cuadra con la consulta.
export async function avisoVigilanciaEntregada(empresaId: string | null, anterior: string, nueva: string): Promise<string | null> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !empresaId || anterior === nueva) return null;
  try {
    const supabase = await crearClienteServidor();
    const [{ data: envios }, { data: empresa }] = await Promise.all([
      supabase.from("envios").select("ruta, creado_en").eq("empresa_id", empresaId).eq("estado", "enviado")
        .contains("documentos", ["vigilancia"]).not("ruta", "is", null).order("creado_en", { ascending: false }).limit(40),
      supabase.from("empresas").select("mes_inicio_gestion").eq("id", empresaId).maybeSingle(),
    ]);
    for (const e of envios ?? []) {
      const q = Object.fromEntries(new URLSearchParams((e.ruta as string).split("?")[1] ?? ""));
      // Solo períodos fijos (trimestre, ventana o rango); «mes» o «año» relativos dependen del día en que se envió
      if (!["t", "ventana", "rango"].includes(q.p)) continue;
      const p = periodoDeConsulta(q, empresa?.mes_inicio_gestion ?? 1);
      const dentro = (f: string) => p.desde <= f && f <= p.hasta;
      if (dentro(anterior) === dentro(nueva)) continue;
      const enviado = fechaCorta(hoyCaracas(e.creado_en as string));
      return dentro(nueva)
        ? `El informe de vigilancia ${p.etiqueta} ya se envió a la empresa el ${enviado}: esta consulta no aparece en él.`
        : `Esta consulta salió en el informe de vigilancia ${p.etiqueta}, enviado a la empresa el ${enviado}: con la nueva fecha ya no cuadra.`;
    }
  } catch {
    // Sin conexión o sin permiso para ver los envíos: no hay aviso
  }
  return null;
}
