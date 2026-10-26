// Historia laboral del trabajador (empleos anteriores). Tipos compartidos entre servidor y pantalla.
export type EmpleoAnterior = {
  id: string;
  empresa: string;
  industria: string | null;
  cargo: string | null;
  descripcion: string | null;
  duracion: string | null;
  horario: string | null;
  condiciones: Record<string, string>;
  riesgos: Record<string, string[]>;
  epp: string | null;
  problemas_salud: string | null;
  accidentes: string | null;
  enfermedades: string | null;
  observaciones: string | null;
};

export const CONDICIONES = [["ambiente", "Ambiente"], ["actividad", "Actividad"], ["traslado", "Traslado"], ["carga", "Carga"]] as const;
