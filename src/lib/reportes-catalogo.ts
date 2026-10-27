import { ETIQUETA_ESTADO_CONSULTA, ETIQUETA_ORIGEN } from "@/lib/consultas-tipos";
import { ETIQUETA_APTITUD, ETIQUETA_ESTADO } from "@/lib/pacientes";

// Catálogo de reportes (los del SAME y más). Solo datos: lo usan la pantalla, la impresión y el Excel.
// Cada reporte sale de public.reporte_listado(fuente, empresa, desde, hasta) y se arma con estas columnas.

export type TipoColumna = "texto" | "fecha" | "num" | "si_no";
export type Columna = {
  k: string;
  t: string;
  tipo?: TipoColumna;
  ancho?: number; // ancho en Excel (caracteres)
  total?: boolean; // se suma en la fila de totales
  clinico?: boolean; // dato clínico: vacío para quien no es personal de salud
  etiqueta?: "aptitud" | "origen" | "causa" | "ente" | "estado_cita" | "estado_trabajador" | "sexo" | "estado_consulta";
  opcional?: boolean; // solo aparece si se marca en «Mostrar» (parámetro ver=)
};
// Opción del reporte (parámetro o_<k>); "sql" la recibe la base en p_opciones, si no la usa la app
export type Opcion = { k: string; t: string; valores: [string, string][]; sql?: boolean };
export type Resumen = { titulo: string; por: string; valor?: string; separar?: boolean; limite?: number };

export type DefReporte = {
  clave: string;
  titulo: string;
  corto: string;
  grupo: "Atención" | "Morbilidad" | "Aptitud y ausentismo" | "Gestión";
  descripcion: string;
  fuente: string;
  columnas: Columna[];
  filtros: string[];
  resumenes: Resumen[];
  periodo?: boolean; // false: no depende del período (padrón)
  clinico?: boolean; // reporte con datos médicos: solo personal de salud
  horizontal?: boolean; // impresión en carta apaisada
  pivote?: { filas: string; columnas: string }; // resumen de atendidos: empresas (o médicos o dependencias) × motivos
  opciones?: Opcion[];
  ranking?: boolean; // agrega posición y % sobre el total (morbilidad)
  nota?: string;
};

const PACIENTE: Columna[] = [
  { k: "cedula", t: "Cédula", ancho: 12 },
  { k: "paciente", t: "Paciente", ancho: 30 },
];
const fecha = (k = "fecha", t = "Fecha"): Columna => ({ k, t, tipo: "fecha", ancho: 11 });

export const REPORTES: DefReporte[] = [
  {
    clave: "relacion",
    titulo: "Resumen de pacientes atendidos",
    corto: "Atendidos (resumen)",
    grupo: "Atención",
    descripcion: "Consultas y pacientes de cada empresa (o de cada médico o dependencia), desglosado por motivo de consulta.",
    fuente: "atendidos",
    horizontal: true,
    pivote: { filas: "empresa", columnas: "motivo" },
    opciones: [{ k: "filas", t: "Resumir por", valores: [["empresa", "Empresa"], ["medico", "Médico"], ["dependencia", "Dependencia"]] }],
    columnas: [{ k: "empresa", t: "Empresa" }, { k: "medico", t: "Médico" }, { k: "dependencia", t: "Dependencia" }, { k: "motivo", t: "Motivo" }, { k: "cedula", t: "Cédula" }],
    filtros: ["motivo", "medico"],
    resumenes: [{ titulo: "Consultas por empresa", por: "empresa" }, { titulo: "Consultas por médico", por: "medico" }, { titulo: "Por motivo de consulta", por: "motivo" }],
  },
  {
    clave: "atendidos",
    titulo: "Detalle de pacientes atendidos",
    corto: "Atendidos (detalle)",
    grupo: "Atención",
    descripcion: "Cada consulta cerrada o firmada del período, por empresa: paciente, motivo, aptitud, diagnósticos y médico.",
    fuente: "atendidos",
    horizontal: true,
    columnas: [
      fecha(),
      { k: "historia", t: "Historia", tipo: "num", ancho: 9 },
      ...PACIENTE,
      { k: "edad", t: "Edad", tipo: "num", ancho: 6 },
      { k: "sexo", t: "Sexo", etiqueta: "sexo", ancho: 6 },
      { k: "empresa", t: "Empresa", ancho: 28 },
      { k: "dependencia", t: "Dependencia", ancho: 18 },
      { k: "cargo", t: "Cargo", ancho: 20 },
      { k: "motivo", t: "Motivo", ancho: 18 },
      { k: "aptitud", t: "Aptitud", etiqueta: "aptitud", ancho: 16 },
      { k: "diagnosticos", t: "Diagnósticos", clinico: true, ancho: 40 },
      { k: "medico", t: "Médico", ancho: 24 },
    ],
    filtros: ["motivo", "aptitud", "sexo", "dependencia", "medico"],
    resumenes: [
      { titulo: "Por motivo de consulta", por: "motivo" },
      { titulo: "Por empresa", por: "empresa" },
      { titulo: "Por aptitud", por: "aptitud" },
      { titulo: "Por sexo", por: "sexo" },
    ],
  },
  {
    clave: "estadistica",
    titulo: "Estadística médica por profesional",
    corto: "Estadística médica",
    grupo: "Atención",
    descripcion: "Consultas, pacientes, firmadas y duración promedio de cada médico, por motivo.",
    fuente: "estadistica",
    columnas: [
      { k: "medico", t: "Médico", ancho: 28 },
      { k: "motivo", t: "Motivo", ancho: 22 },
      { k: "consultas", t: "Consultas", tipo: "num", total: true },
      { k: "pacientes", t: "Pacientes", tipo: "num", total: true },
      { k: "firmadas", t: "Firmadas", tipo: "num", total: true },
      { k: "minutos", t: "Min. promedio", tipo: "num" },
    ],
    filtros: ["medico", "motivo"],
    resumenes: [{ titulo: "Consultas por médico", por: "medico", valor: "consultas" }, { titulo: "Consultas por motivo", por: "motivo", valor: "consultas" }],
    nota: "Duración: de la apertura al cierre de la consulta (se ignoran las que quedaron abiertas más de 8 horas).",
  },
  {
    clave: "medicos",
    titulo: "Producción por médico",
    corto: "Por médico",
    grupo: "Atención",
    descripcion: "Lo que hizo cada médico en el período: consultas, pacientes, primeras y sucesivas, aptitudes, reposos e interconsultas.",
    fuente: "medicos",
    horizontal: true,
    columnas: [
      { k: "medico", t: "Médico", ancho: 28 },
      { k: "consultas", t: "Consultas", tipo: "num", total: true },
      { k: "pacientes", t: "Pacientes", tipo: "num", total: true },
      { k: "empresas", t: "Empresas", tipo: "num" },
      { k: "primera", t: "Primera vez", tipo: "num", total: true },
      { k: "sucesiva", t: "Sucesivas", tipo: "num", total: true },
      { k: "derivada", t: "Derivadas", tipo: "num", total: true },
      { k: "firmadas", t: "Firmadas", tipo: "num", total: true },
      { k: "aptitudes", t: "Aptitudes", tipo: "num", total: true },
      { k: "restringidas", t: "Restringidas o no elegibles", tipo: "num", total: true, ancho: 12 },
      { k: "reposos", t: "Reposos", tipo: "num", total: true },
      { k: "dias_reposo", t: "Días de reposo", tipo: "num", total: true },
      { k: "interconsultas", t: "Interconsultas", tipo: "num", total: true },
      { k: "dias_trabajados", t: "Días con consulta", tipo: "num" },
      { k: "minutos", t: "Min. promedio", tipo: "num" },
    ],
    filtros: [],
    resumenes: [{ titulo: "Consultas por médico", por: "medico", valor: "consultas" }, { titulo: "Pacientes por médico", por: "medico", valor: "pacientes" }],
    nota: "Incluye a los médicos que atendieron en el SAME. Para ver sus pacientes uno por uno, usa «Atendidos (detalle)» con el filtro Médico.",
  },
  {
    clave: "citas",
    titulo: "Citas y asistencia",
    corto: "Citas",
    grupo: "Atención",
    descripcion: "Agenda del período: citados, atendidos, inasistencias y cancelaciones.",
    fuente: "citas",
    columnas: [
      fecha(),
      { k: "hora", t: "Hora", ancho: 7 },
      ...PACIENTE,
      { k: "empresa", t: "Empresa", ancho: 28 },
      { k: "motivo", t: "Motivo", ancho: 18 },
      { k: "estado", t: "Estado", etiqueta: "estado_cita", ancho: 14 },
      { k: "observacion", t: "Observación", ancho: 30 },
    ],
    filtros: ["estado", "motivo"],
    resumenes: [{ titulo: "Por estado", por: "estado" }, { titulo: "Por motivo", por: "motivo" }, { titulo: "Por empresa", por: "empresa" }],
  },
  {
    clave: "morbilidad",
    titulo: "Morbilidad por diagnóstico (CIE-10)",
    corto: "Morbilidad",
    grupo: "Morbilidad",
    descripcion: "Diagnósticos del período ordenados por frecuencia, con pacientes, sexo, grupo etario y origen.",
    fuente: "morbilidad",
    clinico: true,
    horizontal: true,
    ranking: true,
    opciones: [{ k: "agrupar", t: "Agrupar por", sql: true, valores: [["", "General"], ["empresa", "Empresa"], ["dependencia", "Dependencia"]] }],
    columnas: [
      { k: "grupo", t: "Grupo", ancho: 24 },
      { k: "cie10", t: "CIE-10", ancho: 9 },
      { k: "descripcion", t: "Diagnóstico", ancho: 40 },
      { k: "sistema", t: "Aparato o sistema", ancho: 22 },
      { k: "casos", t: "Casos", tipo: "num", total: true },
      { k: "pacientes", t: "Pacientes", tipo: "num", total: true },
      { k: "femenino", t: "F", tipo: "num", total: true },
      { k: "masculino", t: "M", tipo: "num", total: true },
      { k: "e_menor_18", t: "< 18", tipo: "num", total: true },
      { k: "e_18_39", t: "18-39", tipo: "num", total: true },
      { k: "e_40_59", t: "40-59", tipo: "num", total: true },
      { k: "e_60_mas", t: "60 +", tipo: "num", total: true },
      { k: "ocupacional", t: "Ocupac.", tipo: "num", total: true },
      { k: "comun", t: "Común", tipo: "num", total: true },
    ],
    filtros: ["sistema"],
    resumenes: [{ titulo: "Casos por aparato o sistema", por: "sistema", valor: "casos" }, { titulo: "Diez primeras causas", por: "descripcion", valor: "casos" }],
    nota: "% atendidos: pacientes con el diagnóstico sobre los pacientes atendidos en el período (proporción de la población atendida afectada, como el SAME). % casos: sobre el total de diagnósticos.",
  },
  {
    clave: "diagnosticos",
    titulo: "Relación de diagnósticos",
    corto: "Diagnósticos",
    grupo: "Morbilidad",
    descripcion: "Cada diagnóstico emitido con su paciente, motivo, aparato o sistema y origen (común u ocupacional).",
    fuente: "diagnosticos",
    clinico: true,
    horizontal: true,
    columnas: [
      fecha(),
      ...PACIENTE,
      { k: "edad", t: "Edad", tipo: "num", ancho: 6 },
      { k: "sexo", t: "Sexo", etiqueta: "sexo", ancho: 6 },
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "motivo", t: "Motivo", ancho: 16 },
      { k: "cie10", t: "CIE-10", ancho: 9 },
      { k: "descripcion", t: "Diagnóstico", ancho: 36 },
      { k: "sistema", t: "Aparato o sistema", ancho: 20 },
      { k: "origen", t: "Origen", etiqueta: "origen", ancho: 20 },
      { k: "principal", t: "Principal", tipo: "si_no", ancho: 9 },
    ],
    filtros: ["origen", "sistema", "sexo", "motivo"],
    resumenes: [{ titulo: "Por origen", por: "origen" }, { titulo: "Por aparato o sistema", por: "sistema" }, { titulo: "Por empresa", por: "empresa" }],
  },
  {
    clave: "declaracion",
    titulo: "Diagnósticos de declaración obligatoria",
    corto: "Declaración obligatoria",
    grupo: "Morbilidad",
    descripcion: "Enfermedades de notificación obligatoria (MPPS) y diagnósticos de origen ocupacional que se declaran al INPSASEL, con su plazo y si ya hay un evento registrado.",
    fuente: "declaracion",
    clinico: true,
    horizontal: true,
    columnas: [
      fecha(),
      ...PACIENTE,
      { k: "edad", t: "Edad", tipo: "num", ancho: 6 },
      { k: "sexo", t: "Sexo", etiqueta: "sexo", ancho: 6 },
      { k: "empresa", t: "Empresa", ancho: 24 },
      { k: "cie10", t: "CIE-10", ancho: 9 },
      { k: "descripcion", t: "Diagnóstico", ancho: 30 },
      { k: "notificacion", t: "Se notifica a", ancho: 26 },
      { k: "plazo", t: "Plazo", ancho: 20 },
      { k: "evento", t: "Evento Nº", tipo: "num", ancho: 9 },
      { k: "declarado", t: "Declarado", tipo: "si_no", ancho: 9 },
    ],
    filtros: ["notificacion", "declarado", "sexo"],
    resumenes: [{ titulo: "Por tipo de notificación", por: "notificacion" }, { titulo: "Por diagnóstico", por: "descripcion" }, { titulo: "Por empresa", por: "empresa" }],
    nota: "La lista de enfermedades de notificación obligatoria se edita en Configuración › Listas › Diagnósticos de declaración obligatoria (código = inicio del CIE-10). Los ocupacionales salen por el origen marcado en el diagnóstico.",
  },
  {
    clave: "discapacidad",
    titulo: "Pacientes con potencial discapacidad",
    corto: "Potencial discapacidad",
    grupo: "Morbilidad",
    descripcion: "Trabajadores activos con discapacidad registrada, reposo prolongado, aptitud no elegible o con restricciones, o diagnóstico ocupacional.",
    fuente: "discapacidad",
    clinico: true,
    opciones: [{ k: "umbral_dias", t: "Reposo prolongado desde", sql: true, valores: [["90", "90 días"], ["30", "30 días"], ["60", "60 días"], ["180", "180 días"], ["365", "365 días"]] }],
    horizontal: true,
    columnas: [
      ...PACIENTE,
      { k: "edad", t: "Edad", tipo: "num", ancho: 6 },
      { k: "sexo", t: "Sexo", etiqueta: "sexo", ancho: 6 },
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "cargo", t: "Cargo", ancho: 20 },
      { k: "dias_reposo", t: "Días de reposo", tipo: "num", total: true },
      { k: "ultima_aptitud", t: "Última aptitud", etiqueta: "aptitud", ancho: 16 },
      { k: "restricciones", t: "Restricciones", ancho: 30 },
      { k: "ocupacionales", t: "Diagnósticos ocupacionales", ancho: 34 },
      { k: "criterios", t: "Por qué aparece", ancho: 36 },
      { k: "nota_medico", t: "Nota del médico", ancho: 30, clinico: true },
    ],
    filtros: ["ultima_aptitud"],
    resumenes: [{ titulo: "Por criterio", por: "criterios", separar: true }, { titulo: "Por empresa", por: "empresa" }],
    nota: "Reposo prolongado: días de reposo dentro del período (sin pre/postnatal, paternidad ni lactancia) iguales o mayores al umbral elegido.",
  },
  {
    clave: "aptitud",
    titulo: "Aptitud emitida",
    corto: "Aptitud",
    grupo: "Aptitud y ausentismo",
    descripcion: "Constancias de aptitud del período: resultado, restricciones y vigencia de cada trabajador.",
    fuente: "aptitud",
    clinico: true,
    horizontal: true,
    columnas: [
      fecha(),
      ...PACIENTE,
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "dependencia", t: "Dependencia", ancho: 18 },
      { k: "cargo", t: "Cargo", ancho: 20 },
      { k: "motivo", t: "Motivo", ancho: 16 },
      { k: "aptitud", t: "Resultado", etiqueta: "aptitud", ancho: 16 },
      { k: "restricciones", t: "Restricciones", ancho: 30 },
      fecha("vigente_hasta", "Vigente hasta"),
      { k: "observacion", t: "Observación", ancho: 30, opcional: true },
      { k: "conclusiones", t: "Conclusiones", ancho: 40, opcional: true },
      { k: "recomendaciones_empresa", t: "Recomendaciones a la empresa", ancho: 40, opcional: true },
      { k: "recomendaciones_trabajador", t: "Recomendaciones al trabajador", ancho: 40, opcional: true },
    ],
    filtros: ["aptitud", "motivo", "dependencia"],
    resumenes: [{ titulo: "Por resultado", por: "aptitud" }, { titulo: "Por motivo", por: "motivo" }, { titulo: "Por empresa", por: "empresa" }],
  },
  {
    clave: "limitaciones",
    titulo: "Limitaciones ocupacionales",
    corto: "Limitaciones",
    grupo: "Aptitud y ausentismo",
    descripcion: "Trabajadores declarados aptos con restricciones y cuáles son, para planificar su puesto.",
    fuente: "limitaciones",
    opciones: [{ k: "vigentes", t: "Mostrar", sql: true, valores: [["", "Las emitidas en el período"], ["true", "Las vigentes hoy (sin importar el período)"]] }],
    clinico: true,
    horizontal: true,
    columnas: [
      fecha(),
      ...PACIENTE,
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "cargo", t: "Cargo", ancho: 20 },
      { k: "aptitud", t: "Resultado", etiqueta: "aptitud", ancho: 16 },
      { k: "restricciones", t: "Limitaciones", ancho: 40 },
      { k: "observacion", t: "Observación", ancho: 30 },
      fecha("vigente_hasta", "Vigente hasta"),
    ],
    filtros: ["aptitud"],
    resumenes: [{ titulo: "Limitaciones más frecuentes", por: "restricciones", separar: true }, { titulo: "Por empresa", por: "empresa" }],
  },
  {
    clave: "reposos",
    titulo: "Reposos médicos",
    corto: "Reposos",
    grupo: "Aptitud y ausentismo",
    descripcion: "Reposos que tocan el período: causa, ente emisor, días totales y días dentro del período.",
    fuente: "reposos",
    clinico: true,
    opciones: [{ k: "solo_iniciados", t: "Reposos que vienen de antes", sql: true, valores: [["", "Incluirlos"], ["true", "Solo los iniciados en el período"]] }],
    horizontal: true,
    columnas: [
      ...PACIENTE,
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "dependencia", t: "Dependencia", ancho: 18 },
      { k: "causa", t: "Causa", etiqueta: "causa", ancho: 20 },
      { k: "ente_emisor", t: "Ente emisor", etiqueta: "ente", ancho: 16 },
      fecha("desde", "Desde"),
      fecha("hasta", "Hasta"),
      { k: "dias", t: "Días", tipo: "num", total: true },
      { k: "dias_periodo", t: "En el período", tipo: "num", total: true },
      { k: "cie10", t: "CIE-10", ancho: 9 },
      { k: "diagnostico", t: "Diagnóstico", ancho: 30 },
      { k: "validado_ivss", t: "Validado IVSS", tipo: "si_no", ancho: 9 },
      { k: "duracion", t: "Duración", ancho: 14 },
      fecha("reintegro", "Reintegro"),
      { k: "medico_externo", t: "Médico externo", ancho: 22, opcional: true },
      { k: "centro_ivss", t: "Centro IVSS", ancho: 22, opcional: true },
    ],
    filtros: ["causa", "ente_emisor", "validado_ivss", "duracion", "dependencia"],
    resumenes: [
      { titulo: "Reposos por duración", por: "duracion" },
      { titulo: "Días por causa", por: "causa", valor: "dias_periodo" },
      { titulo: "Días por ente emisor", por: "ente_emisor", valor: "dias_periodo" },
      { titulo: "Días por dependencia", por: "dependencia", valor: "dias_periodo" },
    ],
  },
  {
    clave: "interconsultas",
    titulo: "Interconsultas (referencias a especialistas)",
    corto: "Interconsultas",
    grupo: "Gestión",
    descripcion: "Referencias a especialidades emitidas en las consultas del período.",
    fuente: "interconsultas",
    clinico: true,
    columnas: [
      fecha(),
      ...PACIENTE,
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "motivo", t: "Motivo de consulta", ancho: 16 },
      { k: "especialidad", t: "Especialidad", ancho: 22 },
      { k: "motivo_referencia", t: "Motivo de la referencia", ancho: 36 },
    ],
    filtros: ["especialidad", "motivo"],
    resumenes: [{ titulo: "Por especialidad", por: "especialidad" }, { titulo: "Por empresa", por: "empresa" }],
  },
  {
    clave: "examenes",
    titulo: "Exámenes aplicados",
    corto: "Exámenes",
    grupo: "Gestión",
    descripcion: "Paraclínicos registrados en las consultas: cuántos de cada uno, por grupo y por empresa.",
    fuente: "examenes",
    clinico: true,
    columnas: [
      fecha(),
      ...PACIENTE,
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "motivo", t: "Motivo", ancho: 16 },
      { k: "grupo", t: "Grupo", ancho: 18 },
      { k: "examen", t: "Examen", ancho: 28 },
      { k: "resultado", t: "Resultado", ancho: 24 },
      { k: "estado_resultado", t: "Estado", ancho: 13 },
    ],
    filtros: ["estado_resultado", "grupo", "examen", "motivo"],
    resumenes: [{ titulo: "Exámenes más aplicados", por: "examen" }, { titulo: "Pendientes de resultado", por: "estado_resultado" }, { titulo: "Por grupo", por: "grupo" }, { titulo: "Por empresa", por: "empresa" }],
  },
  {
    clave: "pacientes",
    titulo: "Padrón de pacientes",
    corto: "Pacientes",
    grupo: "Gestión",
    descripcion: "Trabajadores registrados con su última consulta y su aptitud vigente. No depende del período.",
    fuente: "pacientes",
    periodo: false,
    horizontal: true,
    columnas: [
      { k: "historia", t: "Historia", tipo: "num", ancho: 9 },
      ...PACIENTE,
      { k: "edad", t: "Edad", tipo: "num", ancho: 6 },
      { k: "sexo", t: "Sexo", etiqueta: "sexo", ancho: 6 },
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "dependencia", t: "Dependencia", ancho: 18 },
      { k: "cargo", t: "Cargo", ancho: 20 },
      { k: "tipo_paciente", t: "Tipo de paciente", ancho: 14 },
      { k: "turno", t: "Turno", ancho: 10 },
      fecha("fecha_ingreso", "Ingreso"),
      { k: "estado", t: "Estado", etiqueta: "estado_trabajador", ancho: 11 },
      fecha("ultima_consulta", "Última consulta"),
      { k: "aptitud", t: "Aptitud", etiqueta: "aptitud", ancho: 16 },
      fecha("vigente_hasta", "Vigente hasta"),
      { k: "vigilancia", t: "Vigilancia clínica", ancho: 20 },
      // Ficha patronímica completa: se marcan en «Mostrar» y salen también en el Excel
      { ...fecha("fecha_nacimiento", "Nacimiento"), opcional: true },
      { k: "lugar_nacimiento", t: "Lugar de nacimiento", ancho: 18, opcional: true },
      { k: "nivel_educativo", t: "Nivel educativo", ancho: 16, opcional: true },
      { k: "profesion", t: "Profesión", ancho: 18, opcional: true },
      { k: "tipo_contrato", t: "Contrato", ancho: 12, opcional: true },
      { k: "ficha", t: "Ficha", ancho: 10, opcional: true },
      { ...fecha("fecha_egreso", "Egreso"), opcional: true },
      { k: "grupo_sanguineo", t: "Grupo sanguíneo", ancho: 9, opcional: true },
      { k: "lateralidad", t: "Lateralidad", ancho: 11, opcional: true },
      { k: "discapacidad", t: "Discapacidad", tipo: "si_no", ancho: 9, opcional: true },
      { k: "telefono", t: "Teléfono", ancho: 14, opcional: true },
      { k: "correo", t: "Correo", ancho: 24, opcional: true },
      { k: "direccion", t: "Dirección", ancho: 30, opcional: true },
      { k: "autoriza_envio_resultados", t: "Autoriza envío", tipo: "si_no", ancho: 9, opcional: true },
    ],
    filtros: ["estado", "tipo_paciente", "turno", "vigilancia", "aptitud", "dependencia", "sexo"],
    resumenes: [{ titulo: "Por estado", por: "estado" }, { titulo: "Por aptitud vigente", por: "aptitud" }, { titulo: "Bajo vigilancia clínica", por: "vigilancia" }, { titulo: "Por empresa", por: "empresa" }],
    nota: "Vigilancia clínica: trabajadores con diagnósticos en su historia; de origen ocupacional si alguno es ocupacional o accidente laboral.",
  },  {
    clave: "vencimientos",
    titulo: "Vencimientos de aptitud y examen periódico",
    corto: "Vencimientos",
    grupo: "Aptitud y ausentismo",
    descripcion: "Trabajadores activos con el examen vencido, por vencer o sin evaluación, para programar las citas. No depende del período.",
    fuente: "vencimientos",
    periodo: false,
    horizontal: true,
    opciones: [{
      k: "horizonte", t: "Incluir", sql: true,
      valores: [["", "Vencidos y por vencer (aviso de cada empresa)"], ["30", "Vencidos y los que vencen en 30 días"], ["60", "… en 60 días"], ["90", "… en 90 días"], ["todos", "Todos, también los que están al día"]],
    }],
    columnas: [
      { k: "historia", t: "Historia", tipo: "num", ancho: 9 },
      ...PACIENTE,
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "dependencia", t: "Dependencia", ancho: 18 },
      { k: "cargo", t: "Cargo", ancho: 20 },
      { k: "estado", t: "Estado", etiqueta: "estado_trabajador", ancho: 11 },
      fecha("ultimo_examen", "Último examen"),
      { k: "aptitud", t: "Aptitud", etiqueta: "aptitud", ancho: 16 },
      fecha("vence", "Vence"),
      { k: "dias", t: "Días", tipo: "num", ancho: 7 },
      { k: "situacion", t: "Situación", ancho: 14 },
      { k: "base", t: "Cálculo", ancho: 22, opcional: true },
      { ...fecha("fecha_ingreso", "Ingreso"), opcional: true },
    ],
    filtros: ["situacion", "dependencia", "cargo", "estado"],
    resumenes: [{ titulo: "Por situación", por: "situacion" }, { titulo: "Por empresa", por: "empresa" }, { titulo: "Por dependencia", por: "dependencia" }],
    nota: "Vence: la vigencia indicada en la constancia de aptitud o, si no la trae, el último examen más la periodicidad de la empresa (Empresas › editar). Días negativos: días de atraso.",
  },
  {
    clave: "accidentalidad",
    titulo: "Índices de accidentabilidad mensual",
    corto: "Accidentabilidad",
    grupo: "Gestión",
    descripcion: "Mes a mes: horas hombre, accidentes con y sin tiempo perdido, días perdidos y cargados, e índices de frecuencia y severidad (COVENIN 474).",
    fuente: "accidentalidad",
    horizontal: true,
    opciones: [{ k: "nivel", t: "Empresas", sql: true, valores: [["", "Cada empresa por separado"], ["consolidado", "Todas las empresas juntas"]] }],
    columnas: [
      { k: "periodo", t: "Mes", ancho: 15 },
      { k: "empresa", t: "Empresa", ancho: 26 },
      { k: "trabajadores", t: "Trabajadores", tipo: "num", ancho: 11 },
      { k: "hht", t: "Horas hombre", tipo: "num", ancho: 13, total: true },
      { k: "metodo", t: "Horas según", ancho: 18 },
      { k: "accidentes", t: "Accidentes", tipo: "num", ancho: 10, total: true },
      { k: "con_tiempo_perdido", t: "Con tiempo perdido", tipo: "num", ancho: 10, total: true },
      { k: "sin_tiempo_perdido", t: "Sin tiempo perdido", tipo: "num", ancho: 10, total: true },
      { k: "dias_perdidos", t: "Días perdidos", tipo: "num", ancho: 9, total: true },
      { k: "dias_cargados", t: "Días cargados", tipo: "num", ancho: 9, total: true },
      { k: "ifn", t: "IF neta", tipo: "num", ancho: 9 },
      { k: "ifb", t: "IF bruta", tipo: "num", ancho: 9 },
      { k: "isev", t: "Í. severidad", tipo: "num", ancho: 10 },
      { k: "dias_por_lesion", t: "Días por lesión", tipo: "num", ancho: 9 },
      { k: "incidentes", t: "Incidentes", tipo: "num", ancho: 9, total: true, opcional: true },
      { k: "enfermedades", t: "Enfermedades ocupacionales", tipo: "num", ancho: 11, total: true, opcional: true },
    ],
    filtros: ["metodo"],
    resumenes: [{ titulo: "Accidentes por mes", por: "periodo", valor: "accidentes" }, { titulo: "Días perdidos por empresa", por: "empresa", valor: "dias_perdidos" }],
    nota: "COVENIN 474:1997, por millón de horas hombre trabajadas: IF neta = accidentes con tiempo perdido; IF bruta = todos los accidentes; Í. severidad = días perdidos + días cargados. Sin horas cargadas en Empresas › Horas trabajadas, se estiman: trabajadores activos × 8 h × días hábiles del mes (5.2).",
  },
];

export const GRUPOS_REPORTE = ["Atención", "Morbilidad", "Aptitud y ausentismo", "Gestión"] as const;

export const reporte = (clave: string) => REPORTES.find((r) => r.clave === clave) ?? null;

// Etiquetas que no salen de listas configurables (causa y ente del reposo, y la aptitud, sí: ver reportes-listados)
export const ETIQUETAS_FIJAS: Record<string, Record<string, string>> = {
  aptitud: ETIQUETA_APTITUD,
  origen: ETIQUETA_ORIGEN,
  estado_trabajador: ETIQUETA_ESTADO,
  estado_consulta: ETIQUETA_ESTADO_CONSULTA,
  estado_cita: { citado: "Citado", en_espera: "En espera", en_consulta: "En consulta", atendido: "Atendido", no_asistio: "No asistió", cancelada: "Cancelada" },
};


// Texto de una celda para pantalla e impresión (el Excel guarda fechas y números como tales)
export function formatoCelda(c: Columna, v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  if (c.tipo === "fecha") return String(v).slice(0, 10).split("-").reverse().join("/");
  if (c.k === "historia") return String(v).padStart(9, "0");
  if (c.tipo === "num") return Number(v).toLocaleString("es-VE");
  return String(v);
}

// Columnas que se muestran: sin acceso clínico se quitan las clínicas; las opcionales solo si se marcaron (ver);
// la morbilidad agrega posición, % de casos y % de atendidos, y la columna de grupo solo si se agrupó.
export function columnasVista(def: DefReporte, o: { sinClinico?: boolean; ver?: string[]; agrupado?: string } = {}): Columna[] {
  const cols = def.columnas
    .filter((c) => !(o.sinClinico && c.clinico) && (!c.opcional || o.ver?.includes(c.k)) && (c.k !== "grupo" || o.agrupado))
    .map((c) => (c.k === "grupo" && o.agrupado ? { ...c, t: o.agrupado === "empresa" ? "Empresa" : "Dependencia" } : c));
  if (!def.ranking) return cols;
  const i = cols.findIndex((c) => c.k === "pacientes");
  return [
    { k: "puesto", t: "#", tipo: "num", ancho: 5 },
    ...cols.slice(0, i + 1),
    { k: "pct", t: "% casos", tipo: "num", ancho: 8 },
    { k: "pct_atendidos", t: "% atendidos", tipo: "num", ancho: 10 },
    ...cols.slice(i + 1),
  ];
}
