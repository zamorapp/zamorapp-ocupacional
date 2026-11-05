// Papelera del administrador: tipos y nombres para mostrar lo que se va (o se queda suelto) al eliminar.
export type TipoPapelera = "consulta" | "trabajador" | "evento" | "investigacion" | "ergonomia" | "informe_vigilancia" | "notificacion_riesgo";

// Cada tipo: tabla principal, etiqueta, pronombre («se elimina con ella/él»), para qué sirve, ejemplo de motivo y aviso final
export const TIPOS_PAPELERA: Record<TipoPapelera, { tabla: string; etiqueta: string; con: "ella" | "él"; para: string; ejemplo: string; hecho: string }> = {
  consulta: { tabla: "clinico.consultas", etiqueta: "Consulta", con: "ella", ejemplo: "Ej.: duplicada al probar la firma", hecho: "Consulta eliminada",
    para: "Para consultas duplicadas o hechas por error. Desaparece de la historia, los reportes y los conteos." },
  trabajador: { tabla: "public.trabajadores", etiqueta: "Trabajador", con: "él", ejemplo: "Ej.: registrado dos veces, la cédula correcta es la otra", hecho: "Trabajador eliminado",
    para: "Para un trabajador repetido o registrado por error. Desaparece de la lista, los reportes y los conteos. Si solo dejó la empresa, usa «Inactivar» en su ficha." },
  evento: { tabla: "public.eventos", etiqueta: "Accidente o enfermedad", con: "él", ejemplo: "Ej.: registrado dos veces", hecho: "Registro eliminado",
    para: "Para un accidente, incidente o enfermedad registrado por error o repetido. Desaparece de la lista, los indicadores y los reportes. Si ya se declaró al INPSASEL, esa declaración no se anula desde aquí." },
  investigacion: { tabla: "clinico.investigaciones", etiqueta: "Investigación", con: "ella", ejemplo: "Ej.: investigación repetida", hecho: "Investigación eliminada",
    para: "Para una investigación repetida o hecha por error. El accidente queda registrado; solo se quita la investigación." },
  ergonomia: { tabla: "public.evaluaciones_ergonomicas", etiqueta: "Ergonomía", con: "ella", ejemplo: "Ej.: evaluación de prueba", hecho: "Evaluación eliminada",
    para: "Para una evaluación ergonómica repetida o hecha por error, aunque esté cerrada. Sus fotos se guardan para poder restaurarla." },
  informe_vigilancia: { tabla: "public.informes_vigilancia", etiqueta: "Informe de vigilancia", con: "él", ejemplo: "Ej.: período equivocado", hecho: "Informe eliminado",
    para: "Quita los textos guardados de este informe (conclusiones, recomendaciones, firmantes). Las consultas y las cifras no se tocan: el informe se puede volver a armar." },
  notificacion_riesgo: { tabla: "public.notificaciones_riesgo", etiqueta: "Notificación de riesgos", con: "ella", ejemplo: "Ej.: puesto equivocado", hecho: "Notificación eliminada",
    para: "Para una notificación de riesgos hecha con el puesto equivocado o repetida. Se puede volver a emitir desde la ficha." },
};

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
  "public.evaluaciones_ergonomicas": ["evaluación ergonómica", "evaluaciones ergonómicas"],
  "public.informes_vigilancia": ["informe de vigilancia", "informes de vigilancia"],
  "public.avisos_legales": ["aviso de plazo legal", "avisos de plazos legales"],
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
