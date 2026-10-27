import "server-only";
import { obtenerConsulta } from "@/lib/consultas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/sesion";

export type AjustesDocumentos = {
  palabra_aptitud?: string;
  titulo_constancia?: string;
  observacion_idoneidad?: string | null;
  firma_paciente_constancia?: boolean;
  firma_medico_ocupacional?: boolean;
  reposo_pie_copia?: string | null;
  reposo_pie_original?: string | null;
  orden_nota?: string | null;
  mensaje_cita?: string | null;
  mensaje_aptitud?: string | null;
  certificado_titulo?: string | null;
  certificado_nota?: string | null;
  firma_sello_separados?: boolean;
  membrete_lema?: string | null;
  certificacion_trabajador?: string | null;
  constancia_copias?: boolean;
  orden_nota_preempleo?: string | null;
};

export type DatosDocumento = NonNullable<Awaited<ReturnType<typeof obtenerDocumento>>>;

// Reúne todo lo que necesita cualquier documento de una consulta
export async function obtenerDocumento(consultaId: string) {
  const consulta = await obtenerConsulta(consultaId);
  if (!consulta) return null;
  const supabase = await crearClienteServidor();

  const { data: c } = await supabase.from("consultas").select("org_id, origen, medico_id, medico_historico_id, motivo_id, dependencia_id, empresa_id, hora_inicio, hora_cierre").eq("id", consultaId).single();
  if (!c) return null;

  const [{ data: org }, { data: medico }, { data: motivo }, { data: empresa }, { data: dep }, { data: trab }, sesion] = await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, ajustes, logo").eq("id", c.org_id).single(),
    // Consulta importada del SAME atendida por un médico sin cuenta: se muestra su nombre, nunca firma ni sello
    c.origen && c.medico_historico_id
      ? supabase.from("medicos_historicos").select("nombre_completo, cedula, mpps, colegio_medicos, especialidad").eq("id", c.medico_historico_id).maybeSingle()
          .then(({ data: h }) => ({ data: h ? { ...h, registro_inpsasel: null, correo: null, firma_url: null, sello_url: null, mostrar_firma: false, mostrar_sello: false } : null }))
      : c.medico_id
      ? Promise.all([
          supabase.from("perfiles").select("nombre_completo, cedula, mpps, colegio_medicos, registro_inpsasel, especialidad, correo, mostrar_firma, mostrar_sello").eq("id", c.medico_id).maybeSingle(),
          // Firma y sello: privados, solo para personal clínico (firma_sello)
          supabase.rpc("firma_sello", { p_usuario: c.medico_id }).maybeSingle(),
        ]).then(([{ data: p }, { data: img }]) => ({ data: p ? { ...p, ...((img as { firma_url: string | null; sello_url: string | null } | null) ?? { firma_url: null, sello_url: null }) } : null }))
      : Promise.resolve({ data: null }),
    c.motivo_id ? supabase.from("lista_items").select("nombre, codigo, grupo").eq("id", c.motivo_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("empresas").select("razon_social, rif, logo").eq("id", c.empresa_id).single(),
    c.dependencia_id ? supabase.from("dependencias").select("nombre").eq("id", c.dependencia_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("trabajadores").select("fecha_nacimiento, fecha_ingreso, turno, numero_historia, ficha, tipo_contrato, tipo:lista_items(nombre)").eq("id", consulta.trabajador.id).single(),
    obtenerSesion(),
  ]);

  return {
    ...consulta,
    org: { ...(org ?? { nombre: "", rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    medicoDatos: medico as {
      nombre_completo: string; cedula: string | null; mpps: string | null; colegio_medicos: string | null; registro_inpsasel: string | null;
      especialidad: string | null; correo: string | null;
      firma_url: string | null; sello_url: string | null; mostrar_firma: boolean; mostrar_sello: boolean;
    } | null,
    motivo: motivo as { nombre: string; codigo: string | null; grupo: string | null } | null,
    empresa: empresa as { razon_social: string; rif: string; logo: string | null },
    dependencia: (dep as { nombre: string } | null)?.nombre ?? null,
    extra: trab as unknown as {
      fecha_nacimiento: string | null; fecha_ingreso: string | null; turno: string | null; numero_historia: number;
      ficha: string | null; tipo_contrato: string | null; tipo: { nombre: string } | null;
    },
    // Pie de página: quién imprime y cuándo (hora de Venezuela)
    impreso: { por: sesion.nombre, revision: consulta.datos.revision, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date()) },
    hora: c.hora_inicio as string,
    cierre: (c.hora_cierre as string | null) ?? null,
  };
}

// Campos que exige la Res. MPPS 028 (G.O. 40.131) para imprimir un récipe
export function faltantesRecipe(d: DatosDocumento) {
  const f: string[] = [];
  const m = d.medicoDatos;
  if (!m?.nombre_completo) f.push("nombre del médico");
  if (!m?.cedula) f.push("cédula del médico (Mi perfil)");
  if (!m?.mpps) f.push("Nº MPPS del médico (Mi perfil)");
  if (!d.org.nombre) f.push("nombre del centro");
  if (!d.org.direccion) f.push("dirección del centro (Configuración › Organización)");
  if (!d.org.rif) f.push("RIF del centro (Configuración › Organización)");
  if (!d.extra.fecha_nacimiento) f.push("fecha de nacimiento del paciente");
  const meds = d.datos.tratamiento.filter((x) => x.medicina);
  if (!meds.length) f.push("al menos una medicina");
  meds.forEach((x) => {
    const falta = [!x.concentracion && "concentración", !x.presentacion && "presentación", !x.via && "vía", !x.dosis && "dosis", !x.frecuencia && "frecuencia", !x.duracion && "duración"].filter(Boolean);
    if (falta.length) f.push(`${x.medicina}: ${falta.join(", ")}`);
  });
  return f;
}

export type Anexo = { id: string; nombre: string; tipo: string; descripcion: string | null; url: string | null; fecha: string };

// Exámenes escaneados para anexar al imprimir: los subidos en la consulta y los que se subieron a la ficha
// del trabajador ese mismo día sin consulta. URLs firmadas de corta duración (el bucket es privado; RLS: solo clínicos).
export async function obtenerAnexos(d: Pick<DatosDocumento, "datos" | "trabajador">): Promise<Anexo[]> {
  const supabase = await crearClienteServidor();
  const dia = d.datos.fecha.slice(0, 10);
  const { data } = await supabase
    .from("adjuntos")
    .select("id, nombre, ruta, tipo_mime, descripcion, consulta_id, creado_en")
    .eq("trabajador_id", d.trabajador.id)
    .or(`consulta_id.eq.${d.datos.id},and(consulta_id.is.null,creado_en.gte.${dia}T00:00:00-04:00,creado_en.lt.${dia}T23:59:59.999-04:00)`)
    .order("creado_en");
  const lista = data ?? [];
  if (!lista.length) return [];
  const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(lista.map((a) => a.ruta), 1800);
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  return lista.map((a) => ({ id: a.id, nombre: a.nombre, tipo: a.tipo_mime, descripcion: a.descripcion, url: url.get(a.ruta) ?? null, fecha: a.creado_en }));
}
