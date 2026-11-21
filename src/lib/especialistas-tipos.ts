// Tipos y helpers del registro de especialistas (seguros para cliente y servidor; la lectura de la base
// vive en especialistas.ts, que es solo de servidor)
export type Especialista = {
  id: string;
  nombres: string;
  apellidos: string;
  especialidad: string;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
  activo: boolean;
};

export const nombreCompleto = (e: Pick<Especialista, "nombres" | "apellidos">) => `${e.nombres} ${e.apellidos}`.trim();
