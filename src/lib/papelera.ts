// Papelera del administrador: tipos y nombres para mostrar lo que se va (o se queda suelto) al eliminar.
export type TipoPapelera = "consulta" | "trabajador";

export type VistaPrevia = {
  resumen: Record<string, number>; // lo que se elimina junto (por tabla)
  firmadas: number;
  sueltas: Record<string, number>; // lo que se queda, solo sin el enlace (reposos, citas, cobros…)
};

const NOMBRES: Record<string, [string, string]> = {
  "public.trabajadores": ["trabajador", "trabajadores"],
  "clinico.consultas": ["consulta", "consultas"],
  "clinico.diagnosticos": ["diagnóstico", "diagnósticos"],
  "clinico.aptitudes": ["aptitud", "aptitudes"],
  "clinico.consultas_versiones": ["versión firmada anterior", "versiones firmadas anteriores"],
  "clinico.reposos": ["reposo", "reposos"],
  "clinico.adjuntos": ["archivo adjunto", "archivos adjuntos"],
  "clinico.alertas_clinicas": ["alerta para la próxima evaluación", "alertas para la próxima evaluación"],
  "clinico.historia_laboral": ["dato de historia laboral", "datos de historia laboral"],
  "clinico.investigaciones": ["investigación de accidente", "investigaciones de accidente"],
  "public.citas": ["cita", "citas"],
  "public.eventos": ["accidente o incidente", "accidentes o incidentes"],
  "public.cobro_items": ["línea de cobro", "líneas de cobro"],
  "public.solicitudes": ["solicitud de la empresa", "solicitudes de la empresa"],
  "public.vacaciones": ["vacación", "vacaciones"],
  "public.cargos_historial": ["cambio de cargo", "cambios de cargo"],
  "public.trabajador_periodos": ["período anterior", "períodos anteriores"],
  "public.notificaciones_riesgo": ["notificación de riesgos", "notificaciones de riesgos"],
  "public.constancias_listas": ["constancia preparada", "constancias preparadas"],
  "public.recordatorios_resultados": ["recordatorio de resultados", "recordatorios de resultados"],
  "public.accesos": ["registro de acceso a la historia", "registros de acceso a la historia"],
};

export function nombrarTabla(tabla: string, n: number): string {
  const par = NOMBRES[tabla];
  return `${n} ${par ? par[n === 1 ? 0 : 1] : tabla.replace(/^[a-z]+\./, "").replaceAll("_", " ")}`;
}

// «2 consultas, 1 aptitud y 3 diagnósticos», en orden de importancia, sin la fila principal
export function listarResumen(resumen: Record<string, number>, sin?: string): string {
  const orden = Object.keys(NOMBRES);
  const partes = Object.entries(resumen)
    .filter(([t, n]) => t !== sin && n > 0)
    .sort(([a], [b]) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99))
    .map(([t, n]) => nombrarTabla(t, n));
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}
