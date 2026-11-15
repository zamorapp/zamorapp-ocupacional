// Enlace para que el paciente llene sus datos (/registro/<token>, 7 días, una sola vez). Lo usan el formulario público,
// la bandeja «Por revisar» de Atención médica y sus acciones del servidor. La base repite las reglas
// (migración 20261030895000_solicitudes_paciente.sql).

export const TOKEN_REGISTRO = /^[A-Za-z0-9_-]{40,60}$/;
export const DIAS_ENLACE_PACIENTE = 7;

// Lo que escribe el paciente (la base guarda solo estas claves, ya limpias)
export type DatosPaciente = {
  cedula: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  sexo?: "F" | "M";
  telefono: string;
  correo?: string;
  direccion?: string;
  tipo: "particular" | "empresa";
  empresa?: string;
  cargo?: string;
  motivo_id?: string;
  motivo?: string;
  fecha?: string;
  turno?: "manana" | "tarde";
  // Para la consulta (migración 20261030912000): pasan tal cual a la ficha y a la consulta nueva
  estado_civil?: keyof typeof ESTADO_CIVIL;
  lugar_nacimiento?: string;
  nivel_educativo?: keyof typeof NIVEL_EDUCATIVO;
  lateralidad?: keyof typeof LATERALIDAD;
  profesion?: string;
  fecha_ingreso?: string;
  antecedentes?: { id: string; nombre: string; grupo: string; observacion: string }[];
  habitos?: { clave: string; nombre: string; valor: string }[];
};

export const ESTADO_CIVIL = { soltero: "Soltero(a)", casado: "Casado(a)", concubino: "Unión estable", divorciado: "Divorciado(a)", viudo: "Viudo(a)" } as const;
export const NIVEL_EDUCATIVO = { primaria: "Primaria", bachiller: "Bachiller", tecnico: "Técnico", universitario: "Universitario", postgrado: "Postgrado" } as const;
export const LATERALIDAD = { diestro: "Derecha", zurdo: "Izquierda", ambidiestro: "Las dos" } as const;

// Hábitos del catálogo en preguntas que entiende el paciente. «No» guarda «Niega» (como en la consulta); «Sí» guarda el
// detalle que escribió. Un hábito que no está aquí sale con su nombre y una casilla para escribir.
export const PREGUNTA_HABITO: Record<string, { pregunta: string; detalle: string; no?: string }> = {
  alcohol: { pregunta: "¿Tomas alcohol?", detalle: "¿Qué y cada cuánto?" },
  tabaco: { pregunta: "¿Fumas?", detalle: "¿Cuántos al día y desde cuándo?" },
  cafe: { pregunta: "¿Tomas café?", detalle: "¿Cuántas tazas al día?" },
  medicamentos: { pregunta: "¿Tomas algún medicamento?", detalle: "¿Cuál y cómo lo tomas?" },
  estupefacientes: { pregunta: "¿Consumes alguna droga?", detalle: "¿Cuál?" },
  actividad_fisica: { pregunta: "¿Haces ejercicio?", detalle: "¿Cuál y cuántas veces por semana?", no: "No realiza" },
};
export const valorHabito = (clave: string, si: boolean, detalle: string) =>
  si ? (detalle.trim() ? `Sí: ${detalle.trim()}` : "Sí") : (PREGUNTA_HABITO[clave]?.no ?? "Niega");

export const DIAS_RESULTADOS_PACIENTE = 30;

// «el Dr. César Zamora», «la Dra. …» o el nombre del servicio tal cual (para «consultar con…», «avisarle a…»)
export const conArticulo = (r: string) => (/^dra\.?\s/i.test(r) ? `la ${r}` : /^dr\.?\s/i.test(r) ? `el ${r}` : r);
export const aQuien = (r: string) => conArticulo(r).replace(/^el /, "al ").replace(/^(?!al |la )/, "a ").replace(/^la /, "a la ");

export const TURNOS = { manana: "En la mañana", tarde: "En la tarde" } as const;

export type SolicitudPaciente = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  empresaSugerida: string | null;
  creado: string;
  vence: string;
  recibido: string | null;
  anulado: boolean;
  resultado: "aceptada" | "descartada" | null;
  revisado: string | null;
  datos: DatosPaciente | null;
  trabajadorId: string | null;
  // Seguimiento (20261030918000): cuándo lo abrió en su teléfono y cuándo descargó por primera vez
  abierto?: string | null;
  descargo?: string | null;
  registrado?: boolean; // enlace enviado desde la ficha de un trabajador ya registrado
  soloRegistro?: boolean; // el paciente llenó solo sus datos de registro, sin consulta (20261030929000)
  resultadosHasta?: string | null; // aceptado: hasta cuándo puede enviar resultados (alargable, 20261030931000)
  documentos?: number; // cuántos documentos lleva (sin decir cuáles: eso es dato de salud)
};

// Paciente que ya tiene ficha con esa cédula (cualquier letra: V, E o P)
export type Coincidencia = { id: string; nombre: string; empresa: string; estado: string; telefono: string | null; correo: string | null; direccion: string | null };

export const estadoEnlace = (s: Pick<SolicitudPaciente, "anulado" | "recibido" | "vence" | "resultado">, ahora: number) =>
  s.anulado ? "anulado" : s.resultado ?? (s.recibido ? "por revisar" : Date.parse(s.vence) < ahora ? "vencido" : "esperando");

// registrado: el trabajador ya tiene ficha; no escribe datos (salvo lo que le falte) y el enlace le sirve para sus
// documentos y para enviar sus resultados (20261030918000)
export function mensajePaciente(nombre: string | null, servicio: string, conDocumentos = false, registrado = false, soloRegistro = false) {
  // El nombre tal como lo escribió el servicio («Sra. Francis»), sin cortarlo
  const completo = nombre?.trim().replace(/\s+/g, " ");
  const hola = completo ? `Hola ${completo}, ` : "Hola, ";
  // Descarga única (20261030915000): el trabajador sabe desde el mensaje que tiene 30 minutos tras la primera descarga
  const plazo = conDocumentos ? " Ojo: desde que descargue el primer documento tendrá 30 minutos para bajarlos todos; después, el enlace queda solo para enviar sus resultados." : "";
  if (registrado) {
    const que = conDocumentos ? "le envía sus documentos. Ábralos con este enlace y, cuando tenga sus resultados, envíelos por el mismo enlace" : "le envía este enlace para que nos envíe sus resultados";
    return `${hola}${servicio} ${que} (vale ${DIAS_ENLACE_PACIENTE} días).${plazo} Enlace:`;
  }
  const para = conDocumentos ? "llene sus datos y descargue los documentos que le preparamos" : soloRegistro ? "llene sus datos de registro" : "llene sus datos y pida su consulta";
  return `${hola}${servicio} le envía este enlace para que ${para}. Toma ${soloRegistro ? "1 minuto" : "5 minutos"} (vale ${DIAS_ENLACE_PACIENTE} días).${plazo} Enlace:`;
}

// Edad cumplida a una fecha (aaaa-mm-dd), para mostrarla al revisar
export function edad(nacimiento: string, hoy: string) {
  const [a, m, d] = nacimiento.split("-").map(Number);
  const [ha, hm, hd] = hoy.split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

export const soloDigitosCedula = (c: string) => c.replace(/\D/g, "");
