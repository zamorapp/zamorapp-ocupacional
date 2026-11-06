// Documentos que el paciente descarga al terminar su registro por enlace (/registro/<token>), ya llenos con sus datos.
// El servicio los elige al crear el enlace; la base los guarda limpios y los entrega con documentos_registro_paciente
// (migración 20261030906000_registro_documentos.sql). Sin consulta: las hojas se arman con los datos que escribió.
import type { DatosDocumento } from "@/lib/documentos";
import type { Paraclinico } from "@/lib/consultas-tipos";
import { edad } from "@/lib/solicitudes-paciente";

export const DOCS_REGISTRO = {
  orden: { nombre: "Orden de exámenes", ruta: "orden" },
  "control-ta": { nombre: "Control de tensión arterial", ruta: "control-ta" },
  dieta: { nombre: "Recomendaciones nutricionales", ruta: "dieta" },
  bienestar: { nombre: "Recomendaciones de bienestar", ruta: "bienestar" },
} as const;
export type DocRegistro = keyof typeof DOCS_REGISTRO;
export const esDocRegistro = (t: string): t is DocRegistro => t in DOCS_REGISTRO;

// Lo que guarda la base (claves de la columna «documentos»)
export type DocumentosRegistro = {
  orden?: { examenes: { nombre: string; grupo?: string }[]; motivo_id?: string; perfil?: string };
  control_ta?: { dias: 7 | 14 };
  dieta?: { dieta: string; plan: string[] };
  bienestar?: { tema: string[] };
  firma?: boolean;
};

// Lo que el servicio marca en el diálogo «Enlace al paciente»
export type EleccionRegistro = {
  orden: { perfilId: string; motivoId: string | null } | null;
  controlTa: 7 | 14 | null;
  dieta: string | null;
  bienestar: boolean;
  firma: boolean;
};

export const docsElegidos = (d: DocumentosRegistro | null | undefined): DocRegistro[] =>
  d ? (["orden", "control-ta", "dieta", "bienestar"] as const).filter((t) => (t === "control-ta" ? d.control_ta : d[t])) : [];

type Medico = NonNullable<DatosDocumento["medicoDatos"]>;
export type VistaRegistro = {
  folio: string;
  recibido: string;
  documentos: Omit<DocumentosRegistro, "firma">;
  persona: { cedula: string; nombres: string; apellidos: string; fecha_nacimiento?: string; sexo?: string; empresa?: string; cargo?: string; tipo?: string };
  org: { nombre: string; rif: string | null; direccion: string | null; telefono: string | null; correo: string | null; logo: string | null; ajustes: DatosDocumento["org"]["ajustes"] };
  empresa: { razon_social: string; rif: string; logo: string | null; proyecto: string | null } | null;
  motivo: { nombre: string; codigo: string | null; grupo: string | null } | null;
  medico: Medico | null;
};

// Quién le envía la información: el titular del membrete («Dr. César Zamora») o el médico, si no el servicio
export const remitente = (v: Pick<VistaRegistro, "org" | "medico">) =>
  v.org.ajustes.membrete_titular?.trim() || v.medico?.nombre_completo || v.org.nombre;

const fechaCaracas = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date(iso));

// Arma los datos de una hoja como si fuera una consulta vacía del paciente: solo nombre, cédula, empresa, cargo y la
// lista de exámenes elegida. Las hojas (Orden, ControlTension, PlanAlimentacion, Bienestar) no saben la diferencia.
export function documentoDeRegistro(v: VistaRegistro, hoy: string): DatosDocumento {
  const p = v.persona;
  const fecha = fechaCaracas(v.recibido);
  const paraclinicos: Paraclinico[] = (v.documentos.orden?.examenes ?? []).map((e, i) => ({ id: `registro-${i}`, nombre: e.nombre, grupo: e.grupo ?? null, resultado: "" }));
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
      informeLibre: { titulo: "", dirigidoA: "", cuerpo: "" },
      conclusiones: "", recomendacionesEmpresa: "", recomendacionesTrabajador: "", observacionPrivada: "",
      autorizaPaciente: false, sano: false, potencialDiscapacidad: false, discapacidadNota: "", riesgos: null,
    },
    org: v.org,
    medicoDatos: v.medico,
    motivo: v.motivo,
    empresa,
    dependencia: null,
    extra: { fecha_nacimiento: p.fecha_nacimiento ?? null, fecha_ingreso: null, fecha_ingreso_cargo: null, turno: null, numero_historia: 0, ficha: null, tipo_contrato: null, tipo: null },
    impreso: { por: remitente(v), revision: 1, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(v.recibido)) },
    hora: "",
    cierre: null,
    sin: [],
    copia: false,
  };
}
