// Semáforo de cumplimiento INPSASEL (0 a 100): misma cifra que «Cumplimiento INPSASEL», con palabra y forma
// para que se lea también en gris. Sin datos nuevos: sale de los criterios que ya mide inspeccion.ts.
import type { Estado } from "@/lib/demo";

export type NivelCumplimiento = { estado: Estado; palabra: "Al día" | "Atención" | "En riesgo" };

// Umbrales aprobados por Cesar en la vista previa (14-nov): 85 y 60
export function nivelCumplimiento(puntaje: number): NivelCumplimiento {
  return puntaje >= 85 ? { estado: "ok", palabra: "Al día" } : puntaje >= 60 ? { estado: "aviso", palabra: "Atención" } : { estado: "alerta", palabra: "En riesgo" };
}

type CriterioMin = { clave: string; titulo: string; cumplidos: number; total: number; estado: string; detalle: string; href?: string };

// Lo que falta, primero lo que más sube el puntaje: cada criterio vale lo mismo (promedio de los que aplican)
export function queFalta<C extends CriterioMin>(criterios: C[]) {
  const aplican = criterios.filter((c) => c.estado !== "no_aplica");
  return aplican
    .filter((c) => c.cumplidos < c.total)
    .map((c) => ({ ...c, sube: Math.max(1, Math.round(((c.total - c.cumplidos) / c.total / aplican.length) * 100)) }))
    .sort((a, b) => b.sube - a.sube);
}

// Modo demostración: cifras fijas por empresa para ver el semáforo sin base
const DEMO = [85, 71, 48, 92, 63];
export const puntajeDemo = (i: number) => DEMO[i % DEMO.length];

// Criterios de muestra para la pantalla de Cumplimiento en modo demostración
export const CRITERIOS_DEMO = [
  { clave: "servicio", titulo: "Servicio de Seguridad y Salud en el Trabajo registrado", base: "LOPCYMAT art. 39", cumplidos: 1, total: 1, estado: "ok", detalle: "Propio desde el 2024-03-11", href: "/empresas" },
  { clave: "psst", titulo: "Programa de Seguridad y Salud en el Trabajo registrado", base: "LOPCYMAT art. 61; NT-04-2023", cumplidos: 1, total: 1, estado: "ok", detalle: "Registrado el 2024-05-20", href: "/empresas" },
  { clave: "declaracion", titulo: "Accidentes y enfermedades declarados en 24 horas", base: "LOPCYMAT art. 73", cumplidos: 3, total: 4, estado: "alerta", detalle: "1 fuera de plazo o sin declarar", href: "/accidentes" },
  { clave: "investigacion", titulo: "Accidentes con causas investigadas", base: "LOPCYMAT art. 40; COVENIN 474", cumplidos: 4, total: 4, estado: "ok", detalle: "Causas inmediatas o básicas registradas", href: "/accidentes" },
  { clave: "nt02", titulo: "Informes de investigación de enfermedad entregados a tiempo", base: "NT-02-2008, Tít. IV, cap. II, 5.2.3", cumplidos: 0, total: 0, estado: "no_aplica", detalle: "Sin enfermedades en el período", href: "/accidentes" },
  { clave: "acciones", titulo: "Acciones correctivas al día", base: "LOPCYMAT art. 56", cumplidos: 5, total: 6, estado: "aviso", detalle: "1 vencidas sin cumplir", href: "/accidentes" },
  { clave: "puestos", titulo: "Puestos con personal evaluados", base: "NT-02-2008, cap. II, 3.1", cumplidos: 6, total: 9, estado: "alerta", detalle: "Evaluación del puesto con matriz de riesgos", href: "/empresas" },
  { clave: "notificacion", titulo: "Trabajadores con notificación de riesgos firmada y vigente", base: "LOPCYMAT arts. 53.1 y 56.3", cumplidos: 38, total: 52, estado: "alerta", detalle: "Acuse firmado y puesto sin cambios desde la entrega" },
  { clave: "evaluacion", titulo: "Trabajadores con evaluación médica vigente", base: "RLOPCYMAT art. 27", cumplidos: 47, total: 52, estado: "alerta", detalle: "Aptitud con vigencia hasta hoy o después", href: "/pacientes" },
  { clave: "vigilancia", titulo: "Informes trimestrales de vigilancia epidemiológica", base: "LOPCYMAT art. 40", cumplidos: 3, total: 4, estado: "alerta", detalle: "3 guardados para el período", href: "/reportes" },
] as const;
