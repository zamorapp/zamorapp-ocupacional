import "server-only";

// Cola de envíos del escritorio: bucket privado donde la PC deja el PDF que luego envía Vercel.
// Ruta: <usuario>/<envío>/<orden>.<nombre en base64url>.pdf (las claves de Storage no aceptan acentos ni espacios).
export const CUBETA_COLA = "envios-cola";
export const archivoCola = (orden: number, nombre: string) => `${orden}.${Buffer.from(nombre).toString("base64url")}.pdf`;
export function nombreDeArchivoCola(archivo: string) {
  const m = /^\d+\.([A-Za-z0-9_-]+)\.pdf$/.exec(archivo);
  return m ? Buffer.from(m[1], "base64url").toString("utf8") : archivo;
}
