// Modelo y datos del módulo Pacientes. En modo demo usa ejemplos;
// con Supabase conectado leerá de public.trabajadores.

export type Aptitud =
  | "elegible"
  | "elegible_con_restricciones"
  | "no_elegible"
  | "espera_resultados"
  | "diferido";

export type EstadoTrabajador = "aspirante" | "activo" | "reposo" | "egresado" | "inactivo";

export type Trabajador = {
  id: string;
  historia: number;
  cedula: string;
  nombres: string;
  apellidos: string;
  sexo: "F" | "M" | null;
  fechaNacimiento: string | null; // aaaa-mm-dd
  empresa: string;
  dependencia: string | null;
  cargo: string;
  tipoPaciente: string | null;
  fechaIngreso: string | null;
  turno: string | null;
  grupoSanguineo: string | null;
  lateralidad: string | null;
  telefono: string | null;
  correo: string | null;
  estado: EstadoTrabajador;
  aptitud: Aptitud | null;
  aptitudFecha: string | null;
  proximoExamen: string | null;
  riesgos: Partial<Record<"fisico" | "quimico" | "biologico" | "mecanico" | "disergonomico" | "psicosocial", string[]>>;
};

export const ETIQUETA_APTITUD: Record<Aptitud, string> = {
  elegible: "Elegible",
  elegible_con_restricciones: "Con restricciones",
  no_elegible: "No elegible",
  espera_resultados: "Espera resultados",
  diferido: "Diferido",
};

export const ESTILO_APTITUD: Record<Aptitud, string> = {
  elegible: "bg-ok/15 text-ok-texto",
  elegible_con_restricciones: "bg-aviso/20 text-aviso-texto",
  no_elegible: "bg-alerta/15 text-alerta-texto",
  espera_resultados: "bg-primary/15 text-primary",
  diferido: "bg-muted text-muted-foreground",
};

export const ETIQUETA_ESTADO: Record<EstadoTrabajador, string> = {
  aspirante: "Aspirante",
  activo: "Activo",
  reposo: "En reposo",
  egresado: "Egresado",
  inactivo: "Inactivo",
};

export const GRUPOS_RIESGO = [
  ["fisico", "Físico"],
  ["quimico", "Químico"],
  ["biologico", "Biológico"],
  ["mecanico", "Mecánico"],
  ["disergonomico", "Disergonómico"],
  ["psicosocial", "Psicosocial"],
] as const;

export function edad(fechaNacimiento: string | null, hoy = new Date()) {
  if (!fechaNacimiento) return null;
  const n = new Date(fechaNacimiento + "T00:00:00");
  let e = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--;
  return e;
}

export function fecha(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function iniciales(t: Pick<Trabajador, "nombres" | "apellidos">) {
  return (t.nombres[0] + t.apellidos[0]).toUpperCase();
}

const base = {
  turno: "Diurno",
  lateralidad: "Diestro",
  telefono: "0414-0000000",
  correo: "",
};

export const TRABAJADORES_DEMO: Trabajador[] = [
  { ...base, id: "t1", historia: 1001, cedula: "V-18456123", nombres: "María José", apellidos: "González Pérez", sexo: "F", fechaNacimiento: "1990-03-14", empresa: "Alimentos del Centro, C.A.", dependencia: "Producción", cargo: "Operadora de empaque", tipoPaciente: "Obrero", fechaIngreso: "2026-10-24", grupoSanguineo: "O+", estado: "aspirante", aptitud: "espera_resultados", aptitudFecha: "2026-10-24", proximoExamen: null, riesgos: { disergonomico: ["Movimientos repetitivos", "Bipedestación prolongada"], fisico: ["Ruido"] } },
  { ...base, id: "t2", historia: 1002, cedula: "V-15789456", nombres: "Carlos Eduardo", apellidos: "Rodríguez Silva", sexo: "M", fechaNacimiento: "1983-07-02", empresa: "Metalúrgica Aragua, S.A.", dependencia: "Soldadura", cargo: "Soldador", tipoPaciente: "Obrero", fechaIngreso: "2015-02-09", grupoSanguineo: "A+", turno: "Rotativo", estado: "activo", aptitud: "elegible", aptitudFecha: "2026-10-24", proximoExamen: "2027-04-24", riesgos: { fisico: ["Ruido", "Radiación no ionizante", "Calor"], quimico: ["Humos metálicos"], mecanico: ["Quemaduras", "Proyección de partículas"] } },
  { ...base, id: "t3", historia: 1003, cedula: "V-20123789", nombres: "Ana Isabel", apellidos: "Martínez Rojas", sexo: "F", fechaNacimiento: "1994-11-21", empresa: "Clínica Santa Inés", dependencia: "Enfermería", cargo: "Enfermera", tipoPaciente: "Empleado", fechaIngreso: "2019-06-03", grupoSanguineo: "B+", turno: "Nocturno", estado: "activo", aptitud: "elegible", aptitudFecha: "2026-01-15", proximoExamen: "2027-01-15", riesgos: { biologico: ["Fluidos corporales"], psicosocial: ["Turnos nocturnos"], disergonomico: ["Manejo de pacientes"] } },
  { ...base, id: "t4", historia: 1004, cedula: "V-12987654", nombres: "Luis Alberto", apellidos: "Hernández Mora", sexo: "M", fechaNacimiento: "1976-05-30", empresa: "Metalúrgica Aragua, S.A.", dependencia: "Almacén", cargo: "Montacarguista", tipoPaciente: "Obrero", fechaIngreso: "2009-09-14", grupoSanguineo: "O-", estado: "reposo", aptitud: "elegible_con_restricciones", aptitudFecha: "2026-08-02", proximoExamen: "2026-11-02", riesgos: { fisico: ["Vibración de cuerpo entero"], disergonomico: ["Sedestación prolongada"], mecanico: ["Atropellamiento"] } },
  { ...base, id: "t5", historia: 1005, cedula: "V-17321654", nombres: "Yelitza Carolina", apellidos: "Torres Blanco", sexo: "F", fechaNacimiento: "1987-01-08", empresa: "Distribuidora Los Llanos", dependencia: "Administración", cargo: "Analista contable", tipoPaciente: "Empleado", fechaIngreso: "2012-03-01", grupoSanguineo: "A-", estado: "activo", aptitud: "elegible", aptitudFecha: "2025-10-10", proximoExamen: "2026-10-10", riesgos: { disergonomico: ["Uso de pantallas"], psicosocial: ["Carga mental"] } },
  { ...base, id: "t6", historia: 1006, cedula: "V-24654987", nombres: "José Gregorio", apellidos: "Pérez Lugo", sexo: "M", fechaNacimiento: "1997-12-03", empresa: "Metalúrgica Aragua, S.A.", dependencia: "Corte", cargo: "Operador de prensa", tipoPaciente: "Contratado", fechaIngreso: "2024-01-15", grupoSanguineo: "O+", estado: "reposo", aptitud: "elegible", aptitudFecha: "2026-01-20", proximoExamen: "2027-01-20", riesgos: { mecanico: ["Atrapamiento", "Cortes"], fisico: ["Ruido"] } },
  { ...base, id: "t7", historia: 1007, cedula: "V-14258369", nombres: "Rosa Elena", apellidos: "Díaz Castillo", sexo: "F", fechaNacimiento: "1979-04-17", empresa: "Alimentos del Centro, C.A.", dependencia: "Calidad", cargo: "Analista de laboratorio", tipoPaciente: "Empleado", fechaIngreso: "2011-08-22", grupoSanguineo: "AB+", estado: "activo", aptitud: "elegible", aptitudFecha: "2026-05-11", proximoExamen: "2027-05-11", riesgos: { quimico: ["Reactivos de laboratorio"], biologico: ["Muestras"] } },
  { ...base, id: "t8", historia: 1008, cedula: "V-26741852", nombres: "Pedro Antonio", apellidos: "Ramírez Quintero", sexo: "M", fechaNacimiento: "1999-09-25", empresa: "Distribuidora Los Llanos", dependencia: "Despacho", cargo: "Chofer", tipoPaciente: "Obrero", fechaIngreso: "2022-11-07", grupoSanguineo: "B-", estado: "activo", aptitud: "elegible_con_restricciones", aptitudFecha: "2026-03-30", proximoExamen: "2026-09-30", riesgos: { mecanico: ["Accidente de tránsito"], disergonomico: ["Levantamiento de cargas"], psicosocial: ["Jornadas extendidas"] } },
  { ...base, id: "t9", historia: 1009, cedula: "V-11369258", nombres: "Gladys Margarita", apellidos: "Fernández Ochoa", sexo: "F", fechaNacimiento: "1971-02-11", empresa: "Clínica Santa Inés", dependencia: "Limpieza", cargo: "Camarera", tipoPaciente: "Obrero", fechaIngreso: "2005-05-16",grupoSanguineo: "O+", estado: "egresado", aptitud: "elegible", aptitudFecha: "2026-09-29", proximoExamen: null, riesgos: { quimico: ["Desinfectantes"], biologico: ["Desechos hospitalarios"] } },
  { ...base, id: "t10", historia: 1010, cedula: "V-28963147", nombres: "Andrés Felipe", apellidos: "Sánchez Mendoza", sexo: "M", fechaNacimiento: "2002-06-19", empresa: "Alimentos del Centro, C.A.", dependencia: "Mantenimiento", cargo: "Pasante de mantenimiento", tipoPaciente: "Pasante", fechaIngreso: "2026-09-01", grupoSanguineo: "A+", estado: "activo", aptitud: "diferido", aptitudFecha: "2026-08-28", proximoExamen: "2026-11-15", riesgos: { mecanico: ["Trabajo en alturas"], fisico: ["Electricidad"] } },
];

export const CONSULTAS_DEMO: Record<string, { fecha: string; motivo: string; tipo: string; medico: string; aptitud: Aptitud | null }[]> = {
  t2: [
    { fecha: "2026-10-24", motivo: "Periódico", tipo: "Sucesiva", medico: "Dra. Pérez", aptitud: "elegible" },
    { fecha: "2026-04-20", motivo: "Morbilidad", tipo: "Primera", medico: "Dr. Rivas", aptitud: null },
    { fecha: "2025-10-18", motivo: "Periódico", tipo: "Sucesiva", medico: "Dra. Pérez", aptitud: "elegible" },
  ],
  t4: [
    { fecha: "2026-10-20", motivo: "Accidente laboral", tipo: "Primera", medico: "Dr. Rivas", aptitud: null },
    { fecha: "2026-08-02", motivo: "Periódico", tipo: "Sucesiva", medico: "Dra. Pérez", aptitud: "elegible_con_restricciones" },
  ],
};
