// Notificación de riesgos por escrito (LOPCYMAT arts. 53.1 y 56.3). Compartido servidor/cliente.
import { claveRiesgo, GRUPOS, nivelRiesgo, type GrupoRiesgo, type Valoracion } from "@/lib/puestos-tipos";

export type RiesgoNotificado = { grupo: string; agente: string; nivel: string | null; control: string };
export type ContenidoNotificacion = {
  dependencia: string | null;
  turno: string | null;
  tareas: string | null;
  herramientas: string | null;
  riesgos: RiesgoNotificado[];
  epp: string | null;
  recomendaciones: string | null;
  evaluadoEn: string | null;
};
export type NotificacionRiesgo = {
  id: string;
  puestoId: string | null;
  puesto: string;
  entregadaEn: string;
  firmadaEn: string | null;
  contenido: ContenidoNotificacion;
};

export type PuestoFuente = {
  nombre: string; turno: string | null; tareas: string | null; herramientas: string | null; epp: string | null; recomendaciones: string | null;
  evaluado_en: string | null; riesgos: unknown; evaluacion: unknown; dependencias?: { nombre: string } | null;
};

// Copia de lo que se notifica, tomada de la evaluación del puesto en ese momento
export function contenidoDePuesto(p: PuestoFuente): ContenidoNotificacion {
  const riesgos = (p.riesgos ?? {}) as Partial<Record<GrupoRiesgo, string[]>>;
  const ev = (p.evaluacion ?? {}) as Record<string, Valoracion>;
  return {
    dependencia: p.dependencias?.nombre ?? null,
    turno: p.turno,
    tareas: p.tareas,
    herramientas: p.herramientas,
    riesgos: GRUPOS.flatMap(([g, nombre]) => (riesgos[g] ?? []).map((agente) => {
      const v = ev[claveRiesgo(g, agente)];
      return { grupo: nombre, agente, nivel: nivelRiesgo(v)?.texto ?? null, control: v?.control ?? "" };
    })),
    epp: p.epp,
    recomendaciones: p.recomendaciones,
    evaluadoEn: p.evaluado_en,
  };
}

// El puesto se reevaluó o cambió después de la entrega: hay que notificar de nuevo
export const desactualizada = (n: Pick<NotificacionRiesgo, "entregadaEn" | "puestoId">, puesto: { id: string | null; evaluadoEn: string | null }) =>
  n.puestoId !== puesto.id || Boolean(puesto.evaluadoEn && puesto.evaluadoEn > n.entregadaEn);

// Mismos roles que la política notificaciones_riesgo_editar
export const ROLES_NOTIFICAN = ["administrador", "gerente_medico", "medico", "enfermeria", "coordinador_sst", "supervisor", "delegado_prevencion"];
