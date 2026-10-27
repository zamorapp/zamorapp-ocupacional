export type Adjunto = {
  id: string;
  nombre: string;
  ruta: string;
  tipo_mime: string;
  tamano: number;
  descripcion: string | null;
  consulta_id: string | null;
  examenes: string[]; // exámenes de la consulta a los que pertenece el archivo (ids de paraclínicos)
  creado_en: string;
};

// Lo que se puede elegir; las fotos se convierten a JPG/PNG antes de subir (lib/preparar-archivo.ts)
export const TIPOS_ADJUNTO = "application/pdf,image/*";
export const MAX_ADJUNTO = 10 * 1024 * 1024;

export const COLUMNAS_ADJUNTO = "id, nombre, ruta, tipo_mime, tamano, descripcion, consulta_id, examenes, creado_en";
