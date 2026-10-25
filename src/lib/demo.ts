// Datos de ejemplo para el modo demo (sin Supabase conectado).

export const EMPRESAS_DEMO = [
  { nombre: "Alimentos del Centro, C.A.", rif: "J-30123456-7", trabajadores: 214 },
  { nombre: "Metalúrgica Aragua, S.A.", rif: "J-40234567-8", trabajadores: 138 },
  { nombre: "Distribuidora Los Llanos", rif: "J-50345678-9", trabajadores: 61 },
  { nombre: "Clínica Santa Inés", rif: "J-29456789-0", trabajadores: 47 },
];

export type Estado = "ok" | "aviso" | "alerta";

export const INDICADORES_DEMO = [
  { titulo: "Consultas del mes", valor: "186", detalle: "+12 % vs. septiembre", estado: "ok" as Estado },
  { titulo: "Exámenes periódicos al día", valor: "87 %", detalle: "Meta 95 %", estado: "aviso" as Estado },
  { titulo: "Ausentismo", valor: "2,1 %", detalle: "Meta < 2,5 %", estado: "ok" as Estado },
  { titulo: "Declaraciones pendientes", valor: "1", detalle: "Vence en 9 h", estado: "alerta" as Estado },
];

export const ALERTAS_DEMO = [
  { texto: "Declaración de accidente ante INPSASEL", sujeto: "José Pérez · Metalúrgica Aragua", plazo: "Vence en 9 h", estado: "alerta" as Estado },
  { texto: "Exámenes periódicos vencidos", sujeto: "14 trabajadores · Alimentos del Centro", plazo: "Desde hace 5 días", estado: "alerta" as Estado },
  { texto: "Fin de mandato de delegados de prevención", sujeto: "Distribuidora Los Llanos", plazo: "En 60 días", estado: "aviso" as Estado },
  { texto: "Reunión del Comité de SSL sin acta firmada", sujeto: "Clínica Santa Inés", plazo: "En 6 días", estado: "aviso" as Estado },
];

export const AGENDA_DEMO = [
  { hora: "08:00", paciente: "María González", motivo: "Pre-empleo", empresa: "Alimentos del Centro", estado: "Atendido" },
  { hora: "08:30", paciente: "Carlos Rodríguez", motivo: "Periódico", empresa: "Metalúrgica Aragua", estado: "En consulta" },
  { hora: "09:00", paciente: "Ana Martínez", motivo: "Post vacacional", empresa: "Clínica Santa Inés", estado: "En espera" },
  { hora: "09:30", paciente: "Luis Hernández", motivo: "Reintegro post reposo", empresa: "Metalúrgica Aragua", estado: "En espera" },
  { hora: "10:00", paciente: "Yelitza Torres", motivo: "Egreso", empresa: "Distribuidora Los Llanos", estado: "Citado" },
];

export const APTITUD_DEMO = [
  { clase: "Elegible", cantidad: 142, color: "bg-ok" },
  { clase: "Con restricciones", cantidad: 23, color: "bg-aviso" },
  { clase: "No elegible", cantidad: 4, color: "bg-alerta" },
  { clase: "Espera resultados", cantidad: 11, color: "bg-primary/60" },
  { clase: "Diferido", cantidad: 6, color: "bg-muted-foreground/40" },
];
