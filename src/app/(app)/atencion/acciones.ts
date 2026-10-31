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
import { invalidarEmpresas } from "@/lib/empresas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { siguienteEnEspera } from "@/lib/citas";
import { fechaCorta, periodoDeConsulta } from "@/lib/periodos";
import { hoyCaracas } from "@/lib/fecha";

export type Resultado = { ok: boolean; mensaje: string };

export type DiagnosticoEncontrado = { cie10: string; descripcion: string; usos: number };

export async function buscarDiagnosticos(texto: string): Promise<DiagnosticoEncontrado[]> {
  if (texto.trim().length < 2) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("buscar_diagnosticos", { p_texto: texto, p_limite: 40 });
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
export async function revisarAlerta(alertaId: string, consultaId: string | null, respuesta: string, descartar = false): Promise<Resultado> {
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

// Corregir una alerta pendiente (texto y «revisar antes del»): su autor o el médico; la bitácora guarda lo anterior.
// Los paraclínicos pedidos no cambian (la base los protege).
export async function corregirAlerta(alertaId: string, texto: string, revisarAntes: string | null): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase." };
  if (revisarAntes && !/^\d{4}-\d{2}-\d{2}$/.test(revisarAntes)) return { ok: false, mensaje: "Fecha no válida." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("alertas_clinicas")
    .update({ texto: texto.trim().slice(0, 500), revisar_antes: revisarAntes })
    .eq("id", alertaId).eq("estado", "pendiente").select("id").maybeSingle();
  if (error) {
    if (error.code === "42501") return { ok: false, mensaje: "La alerta la corrige quien la dejó o el médico." };
    if (error.code === "23514") return { ok: false, mensaje: "Escribe qué revisar (o deja paraclínicos pedidos)." };
    return { ok: false, mensaje: "No se pudo guardar." };
  }
  if (!data) return { ok: false, mensaje: "La alerta ya fue revisada o no existe." };
  revalidatePath("/pacientes", "layout");
  return { ok: true, mensaje: "Alerta corregida." };
}

// «Agregar "…" a mis diagnósticos / mis medicinas» desde la consulta. Si ya existe con ese nombre (sin importar
// mayúsculas), se usa la que está: nunca dos iguales. La base fija el resto (migración 20261030530000).
export async function agregarAlCatalogo(lista: "diagnostico" | "medicina", nombre: string, codigo = ""): Promise<
  Resultado & { item?: { id: string; nombre: string; codigo: string | null; texto: string | null } }
> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para agregar a tu lista." };
  if (lista !== "diagnostico" && lista !== "medicina") return { ok: false, mensaje: "Lista no válida." };
  const limpio = nombre.replace(/\s+/g, " ").trim();
  const cod = lista === "diagnostico" ? codigo.trim().toUpperCase() : "";
  if (!limpio || limpio.length > 200 || cod.length > 20) return { ok: false, mensaje: "Escribe un nombre de hasta 200 letras." };
  const supabase = await crearClienteServidor();
  const existente = () => supabase.from("lista_items").select("id, nombre, codigo, texto")
    .eq("org_id", sesion.orgId!).eq("lista", lista).eq("activo", true)
    .ilike("nombre", limpio.replace(/[\\%_]/g, (c) => "\\" + c)).limit(1).maybeSingle();
  const { data: ya } = await existente();
  if (ya) return { ok: true, mensaje: "Ya estaba en tu lista.", item: ya };
  const { data, error } = await supabase.from("lista_items")
    .insert({ org_id: sesion.orgId, lista, nombre: limpio, codigo: cod || null, datos: { propio: true } })
    .select("id, nombre, codigo, texto").single();
  if (error) {
    // Otra persona lo agregó al mismo tiempo: se usa ese
    const { data: otro } = await existente();
    if (otro) return { ok: true, mensaje: "Ya estaba en tu lista.", item: otro };
    return { ok: false, mensaje: error.code === "42501" ? "Solo el médico agrega a la lista." : "No se pudo agregar. Intenta de nuevo." };
  }
  return { ok: true, mensaje: "Agregado.", item: data };
}

// inactiva: el trabajador es de una empresa que ya no se atiende. Se sigue encontrando (puede volver como candidato
// a otra empresa) pero sale al final y marcado; para atenderlo hay que pasarlo antes a una empresa activa.
export type PacienteEncontrado = { id: string; nombre: string; cedula: string; empresa: string; inactiva?: boolean; inactivo?: boolean };

export async function buscarPacientes(texto: string): Promise<PacienteEncontrado[]> {
  const q = texto.trim().replace(/[%,()]/g, "");
  if (q.length < 2 || (await obtenerSesion()).demo) return [];
  const supabase = await crearClienteServidor();
  const soloNumeros = q.replace(/\D/g, "");
  let consulta = supabase.from("trabajadores").select("id, nombres, apellidos, cedula, estado, empresas(razon_social, activa)").limit(12);
  consulta = soloNumeros.length >= 4
    ? consulta.ilike("cedula", `%${soloNumeros}%`)
    : consulta.or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%`);
  const { data } = await consulta.order("apellidos");
  const filas = (data ?? []).map((t) => {
    const e = t.empresas as unknown as { razon_social: string; activa: boolean } | null;
    return { id: t.id, nombre: `${t.nombres} ${t.apellidos}`, cedula: t.cedula, empresa: e?.razon_social ?? "", inactiva: e?.activa === false, inactivo: t.estado === "inactivo" };
  });
  // Primero los activos de empresas activas; trabajadores inactivos y empresas inactivas al final (sort estable)
  return filas.sort((a, b) => Number(a.inactiva || a.inactivo) - Number(b.inactiva || b.inactivo));
}

// Candidato que viene de una empresa inactiva: pasa a la empresa activa a la que aspira, como aspirante y sin cargo
// ni dependencia (eran de la otra empresa; el cargo anterior queda en su historial). Sus consultas, reposos y
// documentos anteriores NO se tocan: siguen a nombre de la empresa de entonces, para los reportes y la ley.
// Lo que tenía antes de pasar: con esto «Deshacer» lo devuelve tal cual si se eligió mal la empresa
export type AntesDePasar = {
  empresa_id: string; puesto_id: string | null; dependencia_id: string | null; sede_id: string | null; estado: string; fecha_ingreso: string | null; fecha_egreso: string | null;
  // Período (31-oct): pasar a otra empresa empieza un período nuevo; Deshacer devuelve el anterior y su inactivo
  periodo_desde?: string | null; fecha_inactivo?: string | null; motivo_inactivo?: string | null;
};

export async function pasarAEmpresa(trabajadorId: string, empresaId: string): Promise<Resultado & { antes?: AntesDePasar }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!empresaId) return { ok: false, mensaje: "Elige la empresa a la que pasa." };
  const supabase = await crearClienteServidor();
  const [{ data: destino }, { data: t }] = await Promise.all([
    supabase.from("empresas").select("razon_social, activa").eq("id", empresaId).maybeSingle(),
    supabase.from("trabajadores").select("empresa_id, puesto_id, dependencia_id, sede_id, estado, fecha_ingreso, fecha_egreso, periodo_desde, fecha_inactivo, motivo_inactivo, nombres, apellidos, empresas(activa)").eq("id", trabajadorId).maybeSingle(),
  ]);
  if (!t) return { ok: false, mensaje: "Paciente no encontrado." };
  if (!destino?.activa) return { ok: false, mensaje: "Esa empresa no está activa. Elige una empresa activa." };
  // Solo para quien viene de una empresa inactiva: entre empresas activas el cambio va por la ficha, con su cargo
  if ((t.empresas as unknown as { activa: boolean } | null)?.activa !== false) return { ok: false, mensaje: "Solo se pasa así a quien viene de una empresa inactiva." };
  if (t.empresa_id === empresaId) return { ok: true, mensaje: `${t.nombres} ${t.apellidos} ya es de ${destino.razon_social}.` };
  // Sin pedir la fila de vuelta (columnas de salud ocultas, #41): basta el conteo para saber si la RLS lo dejó
  const { count, error } = await supabase
    .from("trabajadores")
    // Empresa nueva = período nuevo (Cesar, 31-oct): la aptitud y los vencimientos cuentan desde la nueva evaluación
    .update({ empresa_id: empresaId, puesto_id: null, dependencia_id: null, sede_id: null, estado: "aspirante", fecha_ingreso: null, fecha_egreso: null, periodo_desde: hoyCaracas() }, { count: "exact" })
    .eq("id", trabajadorId);
  if (error) return { ok: false, mensaje: "No se pudo pasar a la otra empresa: " + error.message };
  if (!count) return { ok: false, mensaje: "Tu usuario no puede cambiar la empresa de este trabajador." };
  invalidarEmpresas();
  olvidar("");
  revalidatePath("/", "layout");
  const antes: AntesDePasar = { empresa_id: t.empresa_id, puesto_id: t.puesto_id, dependencia_id: t.dependencia_id, sede_id: t.sede_id, estado: t.estado, fecha_ingreso: t.fecha_ingreso, fecha_egreso: t.fecha_egreso,
    periodo_desde: t.periodo_desde, fecha_inactivo: t.fecha_inactivo, motivo_inactivo: t.motivo_inactivo };
  return { ok: true, mensaje: `Pasado a ${destino.razon_social}. Su historia va con él.`, antes };
}

// «Deshacer» del paso anterior: solo si sigue en la empresa a la que se pasó (nadie lo movió ni lo atendió allá)
const ESTADOS_TRABAJADOR = ["aspirante", "activo", "reposo", "egresado", "inactivo"] as const;

export async function deshacerPaso(trabajadorId: string, destinoId: string, antes: AntesDePasar): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  // «antes» viene del navegador: solo se aceptan estos 7 campos, el estado de la lista y una empresa de vuelta INACTIVA
  // (así Deshacer no sirve para mover a nadie entre empresas activas), con cargo, dependencia y sede de esa misma empresa
  const estado = ESTADOS_TRABAJADOR.find((e) => e === antes.estado);
  if (!estado) return { ok: false, mensaje: "No se pudo deshacer: datos no válidos." };
  const supabase = await crearClienteServidor();
  const [{ data: origen }, { data: puesto }, { data: dependencia }, { data: sede }, { data: atendido, error: errorAtendido }] = await Promise.all([
    supabase.from("empresas").select("activa").eq("id", antes.empresa_id).maybeSingle(),
    antes.puesto_id ? supabase.from("puestos").select("empresa_id").eq("id", antes.puesto_id).maybeSingle() : Promise.resolve({ data: null }),
    antes.dependencia_id ? supabase.from("dependencias").select("empresa_id").eq("id", antes.dependencia_id).maybeSingle() : Promise.resolve({ data: null }),
    antes.sede_id ? supabase.from("sedes").select("empresa_id").eq("id", antes.sede_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("tiene_consultas_en", { p_trabajador: trabajadorId, p_empresa: destinoId }),
  ]);
  if (!origen || origen.activa) return { ok: false, mensaje: "Deshacer solo lo devuelve a una empresa inactiva." };
  if ((antes.puesto_id && puesto?.empresa_id !== antes.empresa_id) || (antes.dependencia_id && dependencia?.empresa_id !== antes.empresa_id)
    || (antes.sede_id && sede?.empresa_id !== antes.empresa_id))
    return { ok: false, mensaje: "No se pudo deshacer: datos no válidos." };
  if (errorAtendido || atendido == null) return { ok: false, mensaje: "No se pudo verificar; intenta de nuevo." };
  if (atendido) return { ok: false, mensaje: "Ya tiene una consulta en la nueva empresa: no se puede deshacer." };
  const fecha = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const { count, error } = await supabase
    .from("trabajadores")
    .update({
      empresa_id: antes.empresa_id,
      puesto_id: antes.puesto_id || null,
      dependencia_id: antes.dependencia_id || null,
      sede_id: antes.sede_id || null,
      estado,
      fecha_ingreso: fecha(antes.fecha_ingreso),
      fecha_egreso: fecha(antes.fecha_egreso),
      periodo_desde: fecha(antes.periodo_desde ?? null),
      fecha_inactivo: estado === "inactivo" ? fecha(antes.fecha_inactivo ?? null) : null,
      motivo_inactivo: estado === "inactivo" ? (antes.motivo_inactivo ?? "").slice(0, 200) || null : null,
    }, { count: "exact" })
    .eq("id", trabajadorId)
    .eq("empresa_id", destinoId);
  if (error) return { ok: false, mensaje: "No se pudo deshacer: " + error.message };
  if (!count) return { ok: false, mensaje: "Ya no está en esa empresa: no hay nada que deshacer." };
  invalidarEmpresas();
  olvidar("");
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Deshecho: volvió a su empresa anterior, como estaba." };
}

// Abre una consulta nueva con el examen precargado en normal y los antecedentes de la última consulta
export async function iniciarConsulta(trabajadorId: string, motivoId?: string, citaId?: string): Promise<Resultado & { empresaInactiva?: string; inactivo?: boolean }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para registrar consultas." };
  const supabase = await crearClienteServidor();

  const [{ data: t }, { data: previa }, listas] = await Promise.all([
    supabase.from("trabajadores").select("empresa_id, dependencia_id, puesto_id, estado, empresas(razon_social, activa)").eq("id", trabajadorId).single(),
    supabase.from("consultas").select("antecedentes, habitos").eq("trabajador_id", trabajadorId).order("fecha", { ascending: false }).limit(1).maybeSingle(),
    opciones(sesion.orgId, ["examen_funcional", "examen_fisico", "habito"]),
  ]);
  if (!t) return { ok: false, mensaje: "Paciente no encontrado." };
  // Empresa inactiva: no se abre una consulta a nombre de una empresa que ya no se atiende. Si viene como candidato,
  // primero se pasa a la empresa a la que aspira (pasarAEmpresa); su historia anterior queda intacta.
  const suEmpresa = t.empresas as unknown as { razon_social: string; activa: boolean } | null;
  if (suEmpresa?.activa === false) {
    return {
      ok: false,
      empresaInactiva: suEmpresa.razon_social,
      mensaje: `Es de ${suEmpresa.razon_social}, empresa inactiva. Si viene como candidato, pásalo antes a la empresa a la que aspira (botón «Pasar a otra empresa» en su ficha o en el buscador).`,
    };
  }

  // Inactivo (ya no está en la empresa): se reingresa primero, para que la consulta abra su período nuevo
  if (t.estado === "inactivo") {
    return { ok: false, inactivo: true, mensaje: "Está inactivo (ya no estaba en la empresa). Si vuelve, pulsa «Reingresar» en su ficha: sus datos se conservan y empieza un período nuevo." };
  }

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
  // Se pide la fila de vuelta: sin permiso (RLS) la base no da error, solo no cambia nada, y antes se decía «reabierta» igual
  const { data, error } = await supabase.from("consultas").update({ estado: "borrador", hora_cierre: null }).eq("id", id).eq("estado", "cerrada").select("id");
  if (error) return { ok: false, mensaje: error.message };
  if (!data?.length) return { ok: false, mensaje: "No se pudo reabrir: la consulta ya no está cerrada (recarga la página) o no tienes permiso para editarla." };
  revalidatePath("/atencion");
  olvidar("");
  return { ok: true, mensaje: "Consulta reabierta: puedes editar cualquier pestaña. Al terminar, ciérrala de nuevo." };
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
  return { ok: true, mensaje: "Consulta abierta para corregir: edita cualquier pestaña y vuelve a firmarla. La versión firmada quedó guardada en el historial.", revision: data as number };
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
