// zamorApp Escritorio, fase C: la pantalla Configuración › Respaldos le habla a la puerta local de la PC.
// Fechas siempre con la hora anclada que manda la puerta (estado.hora), nunca con la de Windows.
import { crearClienteNavegador } from "@/lib/supabase/client";

const PUERTA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ZONA = "America/Caracas";

export type Ultimo = { fecha: string; ok: boolean; archivo: string | null; bytes: number; externo: string | null; automatico: boolean; sincronizado: boolean };
export type Copia = { archivo: string; bytes: number; externo: boolean };
// Prueba de descifrado tras cada copia externa (restauracion_probada): también se anota en la nube
export type Probada = { fecha: string; ok: boolean; archivo: string; detalle: string | null; anotadaEnNube: boolean };
export type EstadoPuerta = {
  enCurso: boolean;
  paso: string | null;
  carpeta: string | null;
  cifrado: boolean;
  ultimo: Ultimo | null;
  error: string | null;
  carpetaExternaExiste?: boolean;
  copias: Copia[];
  sugeridas: string[];
  pasos?: string[];
  hora?: string; // hora anclada de la puerta: «hoy» y «ayer» se calculan contra ella, nunca contra la de Windows
  horaSinAncla?: boolean;
  claveMinima?: number;
  avisoClave?: string;
  restauracionProbada?: Probada | null;
  restauracionFallida?: { origen: string; mensaje: string; fecha: string | null } | null;
  restauracionPendiente?: { origen: string; pedido: string } | null;
};
export type Respuesta<T> = { ok: true; datos: T } | { ok: false; mensaje: string; dosPasos?: boolean };

// Los pasos de «Respaldar ahora», con las claves fijas que manda la puerta en `pasos` (respaldo.mjs)
export const TEXTO_PASO: Record<string, string> = {
  nube: "Subiendo a la nube lo pendiente",
  pc: "Guardando la copia en esta PC",
  drive: "Copiando a Google Drive",
  prueba: "Probando que la copia de Drive se abre",
};
// Sin carpeta externa la copia no sale de la PC: solo los dos primeros pasos
export const pasosDe = (e: Pick<EstadoPuerta, "pasos" | "carpeta">) => (e.pasos ?? Object.keys(TEXTO_PASO)).filter((p) => e.carpeta || (p !== "drive" && p !== "prueba"));

async function token() {
  const { data } = await crearClienteNavegador().auth.getSession();
  return data.session?.access_token ?? "";
}

async function pedir<T>(ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
  const r = await fetch(`${PUERTA}${ruta}`, {
    method: cuerpo === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${await token()}`, ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    cache: "no-store",
  }).catch(() => null);
  if (!r) return { ok: false, mensaje: "zamorApp Escritorio no responde. Ciérralo y vuelve a abrirlo." };
  const datos = await r.json().catch(() => null);
  if (r.ok) return { ok: true, datos: datos as T };
  if (datos?.code === "dos_pasos") return { ok: false, dosPasos: true, mensaje: "Para esto hace falta la verificación en dos pasos." };
  return { ok: false, mensaje: claro(datos?.error ?? datos?.message ?? "No se pudo completar.") };
}

// El error de la puerta en lenguaje del consultorio (sin términos internos)
export function claro(error: string) {
  if (/pg_dump|ENOENT|spawn/i.test(error)) return "No se pudo copiar la base de esta PC. Cierra y abre zamorApp e intenta de nuevo.";
  if (/carpeta externa no está disponible/i.test(error)) return "La carpeta de Google Drive no está disponible. Abre Google Drive en esta PC e intenta de nuevo.";
  if (/falta la clave/i.test(error)) return "Falta la clave de respaldo: sin ella la copia no sale de esta PC.";
  if (/unable to authenticate|auth|decipher|clave.*(incorrecta|no coincide)/i.test(error)) return "La clave no abre esa copia. Prueba con la clave que tenías cuando se hizo.";
  return error;
}

export async function leerEstado(): Promise<Respuesta<EstadoPuerta>> {
  const r = await pedir<EstadoPuerta | null>("/zamorapp/respaldo");
  if (r.ok && !r.datos) return { ok: false, mensaje: "Esta versión de zamorApp Escritorio aún no hace respaldos. Busca la actualización." };
  return r as Respuesta<EstadoPuerta>;
}

export const respaldar = () => pedir<Ultimo & { error: string | null }>("/zamorapp/respaldar", {});
export const configurar = (cambios: { carpeta?: string | null; clave?: string; confirmacion?: string }) =>
  pedir<EstadoPuerta & { aviso?: string }>("/zamorapp/respaldo/configurar", cambios);
export const restaurar = (archivo: string, clave?: string) => pedir<{ listo: boolean; mensaje: string }>("/zamorapp/restaurar", { archivo, clave });
export const cancelarRestauracion = () => pedir<{ cancelada: boolean }>("/zamorapp/restaurar/cancelar", {});

// «28/10/2026 a las 10:42» desde el nombre de la copia (zamorapp-20261028-1042) o desde una fecha ISO
const fmtDia = new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA });
const fmtHora = new Intl.DateTimeFormat("es-VE", { hour: "numeric", minute: "2-digit", timeZone: ZONA });

export function fechaDeCopia(archivo: string): { dia: string; hora: string } | null {
  const m = /zamorapp-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(archivo);
  if (!m) return null;
  // El nombre lleva la hora UTC de la hora anclada (reloj.iso)
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return { dia: fmtDia.format(d), hora: fmtHora.format(d) };
}

// «hoy a las 10:42», «ayer a las 18:05» o «27/10/2026 a las 09:00», comparando con la hora de la puerta
export function cuando(fecha: string, ahora?: string) {
  const d = new Date(fecha);
  const dia = fmtDia.format(d);
  const hora = fmtHora.format(d);
  if (ahora) {
    const hoy = new Date(ahora);
    if (fmtDia.format(hoy) === dia) return `hoy a las ${hora}`;
    if (fmtDia.format(new Date(hoy.getTime() - 864e5)) === dia) return `ayer a las ${hora}`;
  }
  return `el ${dia} a las ${hora}`;
}

export const tamano = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
export const nombreCarpeta = (ruta: string) => (/onedrive/i.test(ruta) ? "OneDrive" : /mi unidad|my drive|google drive/i.test(ruta) ? "Google Drive" : "Carpeta");
