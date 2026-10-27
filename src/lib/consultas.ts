import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { DatosConsulta, EstadoConsulta, MedicionSignos, Paraclinico, ReposoPrevio } from "@/lib/consultas-tipos";
import { contarResultados } from "@/lib/paraclinicos";
import { empresaActivaId } from "@/lib/empresa-activa";
import type { Aptitud } from "@/lib/pacientes";
import { crearClienteServidor } from "@/lib/supabase/server";

export type ResumenConsulta = {
  id: string;
  fecha: string;
  hora: string;
  estado: EstadoConsulta;
  tipo: string;
  motivo: string | null;
  trabajadorId: string;
  paciente: string;
  cedula: string;
  empresa: string;
  aptitud: Aptitud | null;
  tieneReposo: boolean;
  tieneTratamiento: boolean;
  pendientes: number; // paraclínicos solicitados sin resultado (las consultas importadas del SAME no cuentan)
};

type FilaResumen = {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: EstadoConsulta;
  tipo: string;
  trabajador_id: string;
  motivo: { nombre: string } | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string } | null;
  empresas: { razon_social: string } | null;
  aptitudes: { clasificacion: Aptitud }[] | { clasificacion: Aptitud } | null;
  reposos: { id: string }[] | null;
  tratamiento: unknown[] | null;
  paraclinicos: Paraclinico[] | null;
  origen: string | null;
};

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));

export async function listarConsultas(opciones: { desde?: string; trabajadorId?: string; limite?: number } = {}): Promise<ResumenConsulta[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  let q = supabase
    .from("consultas")
    .select("id, fecha, hora_inicio, estado, tipo, trabajador_id, motivo:lista_items(nombre), trabajadores(nombres, apellidos, cedula), empresas(razon_social), aptitudes(clasificacion), reposos(id), tratamiento, paraclinicos, origen")
    .order("fecha", { ascending: false })
    .order("hora_inicio", { ascending: false })
    .limit(opciones.limite ?? 200);
  if (opciones.desde) q = q.gte("fecha", opciones.desde);
  if (opciones.trabajadorId) q = q.eq("trabajador_id", opciones.trabajadorId);
  else {
    const empresa = await empresaActivaId();
    if (empresa) q = q.eq("empresa_id", empresa);
  }
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as FilaResumen[]).map((c) => {
    const apt = Array.isArray(c.aptitudes) ? c.aptitudes[0] : c.aptitudes;
    return {
      id: c.id,
      fecha: c.fecha,
      hora: hora(c.hora_inicio),
      estado: c.estado,
      tipo: c.tipo,
      motivo: c.motivo?.nombre ?? null,
      trabajadorId: c.trabajador_id,
      paciente: c.trabajadores ? `${c.trabajadores.nombres} ${c.trabajadores.apellidos}` : "",
      cedula: c.trabajadores?.cedula ?? "",
      empresa: c.empresas?.razon_social ?? "",
      aptitud: apt?.clasificacion ?? null,
      tieneReposo: (c.reposos ?? []).length > 0,
      tieneTratamiento: (c.tratamiento ?? []).length > 0,
      pendientes: c.origen ? 0 : contarResultados(c.paraclinicos ?? []).pendientes,
    };
  });
}

export type ConsultaCompleta = {
  datos: DatosConsulta;
  trabajador: { id: string; nombre: string; cedula: string; edad: number | null; sexo: string | null; empresa: string; cargo: string; riesgos: Record<string, string[]> };
  medico: string | null;
  medicoId: string | null;
  // Recién creada y nunca guardada: la plantilla del motivo se aplica sola al abrirla
  nueva: boolean;
};

export async function obtenerConsulta(id: string): Promise<ConsultaCompleta | null> {
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data: c } = await supabase.from("consultas").select("*").eq("id", id).maybeSingle();
  if (!c) return null;

  const [{ data: t }, { data: diags }, { data: apt }, { data: rep }, { data: med }] = await Promise.all([
    supabase.from("trabajadores").select("id, nombres, apellidos, cedula, sexo, fecha_nacimiento, empresas(razon_social), puestos(nombre, riesgos)").eq("id", c.trabajador_id).maybeSingle(),
    supabase.from("diagnosticos").select("cie10, descripcion, sistema, origen, principal").eq("consulta_id", id).order("principal", { ascending: false }),
    supabase.from("aptitudes").select("clasificacion, observacion, limitaciones, vigente_hasta").eq("consulta_id", id).maybeSingle(),
    supabase.from("reposos").select("causa, ente_emisor, desde, hasta, cie10, medico_externo, centro_ivss, validado_ivss").eq("consulta_id", id).maybeSingle(),
    c.origen && c.medico_historico_id ? supabase.from("medicos_historicos").select("nombre_completo").eq("id", c.medico_historico_id).maybeSingle()
      : c.medico_id ? supabase.from("perfiles").select("nombre_completo").eq("id", c.medico_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const tr = t as unknown as {
    id: string; nombres: string; apellidos: string; cedula: string; sexo: string | null; fecha_nacimiento: string | null;
    empresas: { razon_social: string } | null; puestos: { nombre: string; riesgos: Record<string, string[]> } | null;
  } | null;
  const nac = tr?.fecha_nacimiento ? new Date(tr.fecha_nacimiento) : null;
  const edad = nac ? Math.floor((Date.now() - nac.getTime()) / (365.25 * 864e5)) : null;

  return {
    medico: (med as { nombre_completo: string } | null)?.nombre_completo ?? null,
    medicoId: c.medico_id ?? null,
    nueva: c.estado === "borrador" && c.actualizado_en === c.creado_en,
    trabajador: {
      id: c.trabajador_id,
      nombre: tr ? `${tr.nombres} ${tr.apellidos}` : "",
      cedula: tr?.cedula ?? "",
      edad,
      sexo: tr?.sexo ?? null,
      empresa: tr?.empresas?.razon_social ?? "",
      cargo: tr?.puestos?.nombre ?? "",
      riesgos: tr?.puestos?.riesgos ?? {},
    },
    datos: {
      id: c.id,
      estado: c.estado,
      revision: c.revision ?? 1,
      fecha: c.fecha,
      tipo: c.tipo,
      motivoId: c.motivo_id,
      motivoTexto: c.motivo_texto ?? "",
      enfermedadActual: c.enfermedad_actual ?? "",
      antecedentes: c.antecedentes ?? [],
      habitos: Array.isArray(c.habitos) ? c.habitos : [],
      signos: c.signos_vitales ?? {},
      examenFuncional: c.examen_funcional ?? [],
      examenFisico: c.examen_fisico ?? [],
      paraclinicos: c.paraclinicos ?? [],
      diagnosticos: (diags ?? []).map((d) => ({ ...d, sistema: d.sistema ?? "" })),
      aptitud: {
        clasificacion: apt?.clasificacion ?? "",
        observacion: apt?.observacion ?? "",
        limitaciones: apt?.limitaciones ?? [],
        vigenteHasta: apt?.vigente_hasta ?? "",
      },
      tratamiento: c.tratamiento ?? [],
      indicaciones: c.indicaciones ?? "",
      interconsultas: c.interconsultas ?? [],
      reposo: rep
        ? { activo: true, causa: rep.causa, ente: rep.ente_emisor, desde: rep.desde, hasta: rep.hasta, cie10: rep.cie10 ?? "",
            medicoExterno: rep.medico_externo ?? "", centroIvss: rep.centro_ivss ?? "", validadoIvss: rep.validado_ivss ?? false }
        : { activo: false, causa: "enfermedad_comun", ente: "servicio_medico", desde: c.fecha, hasta: c.fecha, cie10: "", medicoExterno: "", centroIvss: "", validadoIvss: false },
      reubicacion: c.reubicacion
        ? {
            activa: true, tipo: c.reubicacion.tipo === "definitiva" ? "definitiva" : "temporal", puestoActual: c.reubicacion.puesto_actual ?? "", puestoPropuesto: c.reubicacion.puesto_propuesto ?? "",
            desde: c.reubicacion.desde ?? c.fecha, hasta: c.reubicacion.hasta ?? "", motivo: c.reubicacion.motivo ?? "", restricciones: c.reubicacion.restricciones ?? "",
          }
        : { activa: false, tipo: "temporal", puestoActual: "", puestoPropuesto: "", desde: c.fecha, hasta: "", motivo: "", restricciones: "" },
      informeLibre: { titulo: c.informe_libre?.titulo ?? "", dirigidoA: c.informe_libre?.dirigido_a ?? "", cuerpo: c.informe_libre?.cuerpo ?? "" },
      conclusiones: c.conclusiones ?? "",
      recomendacionesEmpresa: c.recomendaciones_empresa ?? "",
      recomendacionesTrabajador: c.recomendaciones_trabajador ?? "",
      observacionPrivada: c.observacion_privada ?? "",
      autorizaPaciente: c.autoriza_paciente,
      sano: c.sano ?? false,
      potencialDiscapacidad: c.potencial_discapacidad ?? false,
      discapacidadNota: c.discapacidad_nota ?? "",
    },
  };
}

// Versiones firmadas anteriores de una consulta corregida (la más reciente primero). Solo personal clínico (RLS).
export type VersionConsulta = { revision: number; firmadaEn: string | null; motivo: string; reabiertaEn: string; por: string };

export async function listarVersiones(consultaId: string): Promise<VersionConsulta[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("consultas_versiones").select("revision, firmada_en, motivo, reabierta_en, reabierta_por")
    .eq("consulta_id", consultaId).order("revision", { ascending: false });
  const ids = [...new Set((data ?? []).map((v) => v.reabierta_por))];
  const { data: perfiles } = ids.length ? await supabase.from("perfiles").select("id, nombre_completo").in("id", ids) : { data: [] };
  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo as string]));
  return (data ?? []).map((v) => ({ revision: v.revision, firmadaEn: v.firmada_en, motivo: v.motivo, reabiertaEn: v.reabierta_en, por: nombre.get(v.reabierta_por) ?? "Usuario" }));
}

// Historial del trabajador para la consulta: signos de consultas anteriores (cerradas o firmadas, las más
// recientes) y reposos de los últimos dos años, sin los de esta consulta. Solo personal clínico (RLS).
export type HistorialConsulta = { mediciones: MedicionSignos[]; reposos: ReposoPrevio[]; discapacidadRegistrada: boolean };

export async function historialConsulta(trabajadorId: string, consultaId: string): Promise<HistorialConsulta> {
  const vacio = { mediciones: [], reposos: [], discapacidadRegistrada: false };
  if (!supabaseConfigurado) return vacio;
  const supabase = await crearClienteServidor();
  const hace2Anios = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
  const [{ data: cs }, { data: rs }, { data: t }] = await Promise.all([
    supabase.from("consultas").select("fecha, signos_vitales").eq("trabajador_id", trabajadorId).neq("estado", "borrador").neq("id", consultaId)
      .order("fecha", { ascending: false }).order("hora_inicio", { ascending: false }).limit(24),
    supabase.from("reposos").select("consulta_id, desde, hasta, causa, ente_emisor").eq("trabajador_id", trabajadorId).gte("hasta", hace2Anios)
      .order("desde", { ascending: false }).limit(60),
    supabase.from("trabajadores").select("discapacidad").eq("id", trabajadorId).maybeSingle(),
  ]);
  return {
    mediciones: (cs ?? []).filter((c) => c.signos_vitales && Object.keys(c.signos_vitales).length).map((c) => ({ fecha: c.fecha, signos: c.signos_vitales })).reverse(),
    reposos: (rs ?? []).filter((r) => r.consulta_id !== consultaId)
      .map((r) => ({ consultaId: r.consulta_id, desde: r.desde, hasta: r.hasta, causa: r.causa, ente: r.ente_emisor })),
    discapacidadRegistrada: t?.discapacidad ?? false,
  };
}
