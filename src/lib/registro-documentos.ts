// Documentos que el paciente descarga al terminar su registro por enlace (/registro/<token>), ya llenos con sus datos.
// El servicio los elige al crear el enlace; la base los guarda limpios y los entrega con documentos_registro_paciente
// (migración 20261030906000_registro_documentos.sql). Sin consulta: las hojas se arman con los datos que escribió.
import type { DatosDocumento } from "@/lib/documentos";
import type { Paraclinico } from "@/lib/consultas-tipos";
import { conArticulo, edad } from "@/lib/solicitudes-paciente";
import { sumarDias } from "@/lib/fecha";
import { CLASES, claseDeducida, FAMILIA, type Clase } from "@/lib/estudios";

export const DOCS_REGISTRO = {
  orden: { nombre: "Orden de exámenes", ruta: "orden" },
  // Texto libre del médico (20261030929000)
  recomendaciones: { nombre: "Recomendaciones del médico", ruta: "recomendaciones" },
  "control-ta": { nombre: "Control de tensión arterial", ruta: "control-ta" },
  dieta: { nombre: "Recomendaciones nutricionales", ruta: "dieta" },
  bienestar: { nombre: "Recomendaciones de bienestar", ruta: "bienestar" },
} as const;
export type DocRegistro = keyof typeof DOCS_REGISTRO;
export const esDocRegistro = (t: string): t is DocRegistro => t in DOCS_REGISTRO;

// Examen de la orden con su clase (laboratorio, rayos X, eco…), fijada al crear el enlace con el catálogo
export type ExamenOrden = { nombre: string; grupo?: string; clase?: Clase };

// Cada clase sale en su propia orden (Cesar, 06-nov): sangre aparte; rayos X, eco, tomografía y resonancia cada uno en
// la suya (se hacen en sitios distintos); los estudios funcionales (espirometría, audiometría, ECG) juntos.
export type ParteOrden = "laboratorio" | "eco" | "rayos_x" | "tomografia" | "resonancia" | "imagen" | "funcional";
export const PARTES_ORDEN: Record<ParteOrden, string> = {
  laboratorio: "laboratorio", rayos_x: "rayos X", eco: "ecografía", tomografia: "tomografía", resonancia: "resonancia magnética",
  imagen: "otros estudios de imagen", funcional: "estudios funcionales",
};
export const esParteOrden = (t: string | undefined): t is ParteOrden => Boolean(t && t in PARTES_ORDEN);
const parteDe = (e: ExamenOrden): ParteOrden => {
  const c = e.clase && e.clase in CLASES ? e.clase : claseDeducida(e.nombre, e.grupo);
  return FAMILIA[c] === "funcional" ? "funcional" : (c as ParteOrden);
};
// Las órdenes que salen de una lista de exámenes, en orden fijo (laboratorio primero)
export function partesOrden(examenes: ExamenOrden[]): { parte: ParteOrden; nombre: string; examenes: ExamenOrden[] }[] {
  return (Object.keys(PARTES_ORDEN) as ParteOrden[])
    .sort((a, b) => (a === "laboratorio" ? -1 : b === "laboratorio" ? 1 : 0))
    .map((parte) => ({ parte, nombre: `Orden de ${PARTES_ORDEN[parte]}`, examenes: examenes.filter((e) => parteDe(e) === parte) }))
    .filter((x) => x.examenes.length > 0);
}

// Lo que guarda la base (claves de la columna «documentos»)
export type DocumentosRegistro = {
  orden?: { examenes: ExamenOrden[]; motivo_id?: string; perfil?: string };
  control_ta?: { dias: 7 | 14 };
  dieta?: { dieta: string; plan: string[] };
  bienestar?: { tema: string[] };
  recomendaciones?: { texto: string };
  firma?: boolean;
  // Se mandó después de atenderlo: «las indicaciones que conversaste con…» (20261030912000)
  conversadas?: boolean;
};

// Lo que el servicio marca en el diálogo «Enlace al paciente»
export type EleccionRegistro = {
  // sin: exámenes del perfil que el médico desmarcó para este paciente (p. ej. de «Rutina» solo hematología y glicemia)
  // sueltos: exámenes del catálogo elegidos uno a uno (ids), con o sin perfil (20261030929000)
  // otros: exámenes escritos a mano que no están en el catálogo (electrolitos, coprocultivo…), varios a la vez
  orden: { perfilId: string | null; motivoId: string | null; sin?: string[]; sueltos?: string[]; otros?: string[] } | null;
  controlTa: 7 | 14 | null;
  dieta: string | null;
  bienestar: boolean;
  temas?: string[];
  recomendaciones?: string | null;
  firma: boolean;
  conversadas?: boolean;
};

// «Otros» exámenes escritos a mano: separados por coma, punto y coma o renglón; sin repetir; hasta 120 letras cada uno
export const MAX_OTROS = 30;
export function partirOtros(texto: string): string[] {
  const vistos = new Set<string>();
  return texto.split(/[,;\n]+/).map((x) => x.replace(/\s+/g, " ").trim().slice(0, 120)).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).filter((x) => {
    const k = x.toLowerCase();
    if (x.length < 2 || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).slice(0, MAX_OTROS);
}

export const docsElegidos = (d: DocumentosRegistro | null | undefined): DocRegistro[] =>
  d ? (["orden", "recomendaciones", "control-ta", "dieta", "bienestar"] as const).filter((t) => (t === "control-ta" ? d.control_ta : d[t])) : [];
export const MAX_RECOMENDACIONES = 2500;

// Lo que ve el paciente al terminar: una fila por documento y una por cada orden (laboratorio, rayos X…)
export type FilaRegistro = { tipo: DocRegistro; parte?: ParteOrden; nombre: string; detalle: string };
export function filasRegistro(d: DocumentosRegistro): FilaRegistro[] {
  return docsElegidos(d).flatMap((tipo): FilaRegistro[] => tipo === "orden"
    ? partesOrden(d.orden?.examenes ?? []).map((x) => ({ tipo, parte: x.parte, nombre: x.nombre, detalle: x.examenes.map((e) => e.nombre).join(", ") }))
    : [{ tipo, nombre: DOCS_REGISTRO[tipo].nombre, detalle: tipo === "control-ta" ? `${d.control_ta?.dias ?? 7} días` : "" }]);
}

type Medico = NonNullable<DatosDocumento["medicoDatos"]>;
export type VistaRegistro = {
  folio: string;
  // Nombre que escribió el servicio al crear el enlace («Sra. Francis»): el saludo lo usa tal cual (20261030931000)
  saludo?: string | null;
  recibido: string;
  // Fin de la ventana de 30 minutos que abre el primer «Descargar PDF» (null = aún no descarga)
  descarga_hasta?: string | null;
  documentos: Omit<DocumentosRegistro, "firma">;
  persona: { cedula: string; nombres: string; apellidos: string; fecha_nacimiento?: string; sexo?: string; empresa?: string; cargo?: string; tipo?: string };
  org: { nombre: string; rif: string | null; direccion: string | null; telefono: string | null; correo: string | null; logo: string | null; ajustes: DatosDocumento["org"]["ajustes"] };
  empresa: { razon_social: string; rif: string; logo: string | null; proyecto: string | null } | null;
  motivo: { nombre: string; codigo: string | null; grupo: string | null } | null;
  // Sin imágenes de firma y sello ni correo (Analizar 06-nov): solo nombre y registros
  medico: Pick<Medico, "nombre_completo" | "cedula" | "mpps" | "colegio_medicos" | "registro_inpsasel" | "especialidad"> | null;
  firmado: boolean;
};

// Quién le envía la información: el titular del membrete («Dr. César Zamora») o el médico, si no el servicio
const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");

export const remitente = (v: Pick<VistaRegistro, "org" | "medico">) =>
  v.org.ajustes.membrete_titular?.trim() || v.medico?.nombre_completo || v.org.nombre;

// Frase de arriba de la lista: después de la consulta (Cesar, 06-nov) «conversaste con el Dr. …»; antes, «te envía»
export const fraseIndicaciones = (quien: string, conversadas: boolean | undefined) =>
  conversadas ? `Aquí tiene las indicaciones que conversó en consulta con ${conArticulo(quien)}.` : `Aquí tiene las indicaciones que le envía ${conArticulo(quien)}.`;

// «¡Listo, Sra. Francis!»: el nombre completo que escribió el servicio; si no escribió nada, los nombres del paciente;
// si tampoco hay, «¡Listo!». Nunca se corta en la primera palabra (Cesar, 12-nov: saludaba «¡Listo, Sra!»).
export const saludoListo = (saludo: string | null | undefined, nombres?: string | null) => {
  const n = (saludo?.trim() || nombres?.trim() || "").replace(/\s+/g, " ");
  return n ? `¡Listo, ${n}!` : "¡Listo!";
};

const fechaCaracas = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date(iso));

// Arma los datos de una hoja como si fuera una consulta vacía del paciente: solo nombre, cédula, empresa, cargo y la
// lista de exámenes elegida. Las hojas (Orden, ControlTension, PlanAlimentacion, Bienestar) no saben la diferencia.
// parte: solo los exámenes de esa orden (laboratorio, rayos X…); sin parte, todos
// imagenes: firma y sello del médico, SOLO en el PDF aplanado que arma el servidor (registro-pdf.ts) y en la vista previa
// del propio médico. En la página que abre el paciente nunca llegan.
export type ImagenesHoja = { firma: string | null; sello: string | null };
export function documentoDeRegistro(v: VistaRegistro, hoy: string, parte?: ParteOrden, imagenes?: ImagenesHoja | null): DatosDocumento {
  const p = v.persona;
  const fecha = fechaCaracas(v.recibido);
  const examenes = v.documentos.orden?.examenes ?? [];
  const elegidos = parte ? partesOrden(examenes).find((x) => x.parte === parte)?.examenes ?? [] : examenes;
  const paraclinicos: Paraclinico[] = elegidos.map((e, i) => ({ id: `registro-${i}`, nombre: e.nombre, grupo: e.grupo ?? null, resultado: "" }));
  const empresa = v.empresa ?? { razon_social: p.tipo === "empresa" && p.empresa ? p.empresa : "Particular", rif: "", logo: null, proyecto: null };
  return {
    medico: v.medico?.nombre_completo ?? null,
    medicoId: null,
    firmadaEnSame: null,
    registrada: fecha,
    nueva: false,
    trabajador: {
      id: v.folio,
      nombre: `${p.nombres} ${p.apellidos}`,
      cedula: p.cedula,
      edad: p.fecha_nacimiento ? edad(p.fecha_nacimiento, hoy) : null,
      sexo: p.sexo ?? null,
      empresa: empresa.razon_social,
      empresaId: null,
      cargo: p.cargo ?? "",
      riesgos: {},
    },
    datos: {
      id: v.folio, estado: "borrador", revision: 1, fecha, tipo: "primera", motivoId: null, motivoTexto: "", especialidad: "", enfermedadActual: "",
      antecedentes: [], habitos: [], signos: {}, examenFuncional: [], examenFisico: [], paraclinicos, diagnosticos: [],
      aptitud: { clasificacion: "", observacion: "", limitaciones: [], vigenteHasta: "" },
      tratamiento: [], indicaciones: "", interconsultas: [],
      reposo: { activo: false, causa: "enfermedad_comun", ente: "servicio_medico", desde: fecha, hasta: fecha, cie10: "", medicoExterno: "", centroIvss: "", validadoIvss: false },
      reubicacion: { activa: false, tipo: "temporal", puestoActual: "", puestoPropuesto: "", desde: fecha, hasta: "", motivo: "", restricciones: "", resultado: "" },
      informeLibre: { titulo: "Recomendaciones", dirigidoA: "", cuerpo: v.documentos.recomendaciones?.texto ?? "" },
      conclusiones: "", recomendacionesEmpresa: "", recomendacionesTrabajador: "", observacionPrivada: "",
      autorizaPaciente: false, sano: false, potencialDiscapacidad: false, discapacidadNota: "", riesgos: null,
    },
    org: v.org,
    medicoDatos: v.medico ? {
      ...v.medico, correo: null,
      firma_url: v.firmado ? imagenes?.firma ?? null : null, sello_url: v.firmado ? imagenes?.sello ?? null : null,
      mostrar_firma: Boolean(v.firmado && imagenes?.firma), mostrar_sello: Boolean(v.firmado && imagenes?.sello),
    } : null,
    motivo: v.motivo,
    empresa,
    dependencia: null,
    extra: { fecha_nacimiento: p.fecha_nacimiento ?? null, fecha_ingreso: null, fecha_ingreso_cargo: null, turno: null, numero_historia: 0, ficha: null, tipo_contrato: null, tipo: null },
    impreso: { por: remitente(v), revision: 1, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(v.recibido)) },
    hora: "",
    cierre: null,
    sin: [],
    copia: false,
    firmaEnlace: v.firmado && v.medico
      ? `Firmado digitalmente · folio ${v.folio.slice(0, 8).toUpperCase()} · válida solo para ${p.cedula} hasta el ${fechaCorta(sumarDias(fecha, 7))}`
      : null,
  };
}
