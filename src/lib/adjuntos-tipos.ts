export type Adjunto = {
  id: string;
  nombre: string;
  ruta: string;
  tipo_mime: string;
  tamano: number;
  descripcion: string | null;
  consulta_id: string | null;
  creado_en: string;
};

export const TIPOS_ADJUNTO = "application/pdf,image/jpeg,image/png,image/webp,image/heic";
export const MAX_ADJUNTO = 10 * 1024 * 1024;
