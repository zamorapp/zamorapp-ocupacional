// Puestos de trabajo y matriz de riesgos 5×5 (probabilidad × severidad). Compartido servidor/cliente.

export type GrupoRiesgo = "fisico" | "quimico" | "biologico" | "mecanico" | "disergonomico" | "psicosocial";
export type Valoracion = { p: number; s: number; control?: string };

export type Puesto = {
  id: string;
  codigo: string;
  nombre: string;
  dependenciaId: string | null;
  dependencia: string | null;
  descripcion: string;
  tareas: string;
  herramientas: string;
  turno: string;
  riesgos: Partial<Record<GrupoRiesgo, string[]>>;
  evaluacion: Record<string, Valoracion>; // clave "grupo|agente"
  trabajadores: number;
};

export const GRUPOS: [GrupoRiesgo, string][] = [
  ["fisico", "Físico"],
  ["quimico", "Químico"],
  ["biologico", "Biológico"],
  ["mecanico", "Mecánico"],
  ["disergonomico", "Disergonómico"],
  ["psicosocial", "Psicosocial"],
];

export const ESCALA_P = ["", "Rara vez", "Poco probable", "Posible", "Probable", "Casi seguro"];
export const ESCALA_S = ["", "Insignificante", "Menor", "Moderada", "Mayor", "Catastrófica"];

export function nivelRiesgo(v?: Valoracion) {
  if (!v?.p || !v?.s) return null;
  const n = v.p * v.s;
  if (n <= 4) return { n, texto: "Bajo", estado: "ok" as const, clase: "bg-ok/15 text-ok" };
  if (n <= 9) return { n, texto: "Medio", estado: "aviso" as const, clase: "bg-aviso/25 text-amber-800 dark:text-aviso" };
  if (n <= 16) return { n, texto: "Alto", estado: "alerta" as const, clase: "bg-alerta/15 text-alerta" };
  return { n, texto: "Crítico", estado: "alerta" as const, clase: "bg-alerta text-white" };
}

export const claveRiesgo = (grupo: string, agente: string) => `${grupo}|${agente}`;

// El riesgo más alto del puesto, para el resumen
export function riesgoMaximo(p: Pick<Puesto, "riesgos" | "evaluacion">) {
  let max: ReturnType<typeof nivelRiesgo> = null;
  for (const [g] of GRUPOS) {
    for (const a of p.riesgos[g] ?? []) {
      const n = nivelRiesgo(p.evaluacion[claveRiesgo(g, a)]);
      if (n && (!max || n.n > max.n)) max = n;
    }
  }
  return max;
}
