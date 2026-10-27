// Informe de investigación de enfermedad ocupacional (NT-02-2008, Título IV, cap. II, punto 2). Compartido servidor/cliente.

export type ClaveSeccion = "trabajador" | "gestion" | "higienico" | "epidemiologico" | "clinico" | "paraclinico" | "metodologia" | "conclusiones" | "propuestas";
export type Instancia = "servicio" | "comite" | "delegado" | "trabajador";
export type Participante = { nombre: string; cedula: string; cargo: string; instancia: Instancia };

export type Investigacion = {
  id: string | null;
  eventoId: string;
  trabajadorId: string;
  secciones: Partial<Record<ClaveSeccion, string>>;
  participantes: Participante[];
  estado: "borrador" | "terminado";
  terminadoEn: string | null;
};

export const SECCIONES: { clave: ClaveSeccion; titulo: string; guia: string }[] = [
  { clave: "trabajador", titulo: "2.1 Datos del trabajador", guia: "Identificación, estado civil, mano dominante, condición actual, grupo étnico; horas extras, vacaciones y exámenes del último año; información escrita y formación en prevención recibidas; antecedentes laborales y cargos ocupados en orden cronológico." },
  { clave: "gestion", titulo: "2.2 Gestión de seguridad y salud en el trabajo", guia: "Servicio de SST (propio o mancomunado, conformación, integrantes), Programa de SST, Comité de Seguridad y Salud Laboral (constitución, demandas de los delegados, acciones), inscripción en el IVSS." },
  { clave: "higienico", titulo: "2.3 Criterio higiénico ocupacional", guia: "Tiempo de exposición (jornadas, horas extras, permisos y reposos); procesos peligrosos del objeto, los medios, la actividad y la organización del trabajo; monitoreos con valores de referencia; agentes etiológicos; controles en la fuente, en el medio, administrativos y EPP; diseño del puesto. Un estudio por cada puesto ocupado." },
  { clave: "epidemiologico", titulo: "2.4 Datos epidemiológicos", guia: "Morbilidad general y específica del cargo y del puesto (al menos 3 años), evaluaciones previas de esos puestos, encuestas anónimas (musculoesqueléticas), resumen de reposos y ausentismo por área." },
  { clave: "clinico", titulo: "2.5 Criterio clínico", guia: "Signos, síntomas, antecedentes personales, informes médicos, examen pre-empleo (condición al ingreso), periódicos y de egreso, diagnóstico médico." },
  { clave: "paraclinico", titulo: "2.6 Criterio paraclínico", guia: "Laboratorio, imágenes, espirometría, audiometría y demás evaluaciones que apoyan el criterio clínico." },
  { clave: "metodologia", titulo: "Metodologías aplicadas", guia: "Cómo se hizo la investigación: análisis de la actividad, entrevistas, reconstrucción retrospectiva si el puesto cambió (1.3)." },
  { clave: "conclusiones", titulo: "Conclusiones", guia: "Relación entre los procesos peligrosos y la patología." },
  { clave: "propuestas", titulo: "Propuestas y plan de acción", guia: "Medidas correctivas y preventivas para el puesto y para los demás trabajadores expuestos. Las acciones correctivas del evento se imprimen debajo." },
];

export const ETIQUETA_INSTANCIA: Record<Instancia, string> = {
  servicio: "Servicio de Seguridad y Salud en el Trabajo",
  comite: "Comité de Seguridad y Salud Laboral",
  delegado: "Delegado(a) de prevención",
  trabajador: "Trabajador(a) afectado(a)",
};

// LOPCYMAT arts. 78 a 83
export type Discapacidad = "temporal" | "parcial_permanente" | "total_permanente" | "absoluta_permanente" | "gran_discapacidad";
export const ETIQUETA_DISCAPACIDAD: Record<Discapacidad, string> = {
  temporal: "Temporal (art. 79)",
  parcial_permanente: "Parcial permanente, menos de 67 % (art. 80)",
  total_permanente: "Total permanente para el trabajo habitual, 67 % o más (art. 81)",
  absoluta_permanente: "Absoluta permanente para cualquier actividad (art. 82)",
  gran_discapacidad: "Gran discapacidad (art. 83)",
};

// Secciones vacías que faltan para dar el informe por terminado
export const faltantes = (s: Investigacion["secciones"]) => SECCIONES.filter((x) => !s[x.clave]?.trim()).map((x) => x.titulo);
