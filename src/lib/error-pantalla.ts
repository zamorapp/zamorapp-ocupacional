// Lo común de las pantallas de error (error.tsx y global-error.tsx) y del vigía de partes viejas del layout raíz.
// 31-oct: en el celular salía la pantalla blanca «Application error» de Next. Causas: (1) el reintento automático
// hacía router.refresh() + reset() dentro de startTransition y React reventaba (#310) fuera de la pantalla de error;
// (2) tras publicar una versión, la página abierta pedía partes que ya no existen y Turbopack lo dice como
// «Failed to load chunk …», que no se reconocía. Aquí se reconocen todas las variantes y se recarga una sola vez.
import { ahora } from "@/lib/fecha";

export type ErrorPantalla = { nombre: string; mensaje: string; digest?: string };

/** Cualquier cosa lanzada (Error, texto, objeto de Supabase, null) como datos que la pantalla puede mostrar sin fallar. */
export function normalizarError(e: unknown): ErrorPantalla {
  if (e && typeof e === "object") {
    const o = e as { name?: unknown; message?: unknown; digest?: unknown };
    return {
      nombre: typeof o.name === "string" && o.name ? o.name : "Error",
      mensaje: typeof o.message === "string" ? o.message : safeTexto(e),
      digest: typeof o.digest === "string" ? o.digest : undefined,
    };
  }
  return { nombre: "Error", mensaje: e === undefined || e === null ? "sin detalle" : String(e) };
}

function safeTexto(e: unknown) {
  try { return JSON.stringify(e).slice(0, 200); } catch { return "sin detalle"; }
}

// Webpack («ChunkLoadError», «Loading chunk»), Turbopack («Failed to load chunk … from module»), Chrome
// («Failed to fetch dynamically imported module»), Safari («Importing a module script failed», «Load failed»)
// y sin red («Failed to fetch», «NetworkError»)
export const PARTES_VIEJAS = /ChunkLoadError|Loading (CSS )?chunk|Failed to load chunk|dynamically imported module|Importing a module script failed|Failed to fetch|NetworkError|Load failed/i;
// Solo partes de la página (sin los fallos de red sueltos): lo usa la franja «Hay una versión nueva» cuando una parte
// falla fuera de una pantalla de error (un prefetch o un botón). Ahí nunca se recarga sola: borraría lo escrito
export const SOLO_PARTES = /ChunkLoadError|Loading (CSS )?chunk|Failed to load chunk|dynamically imported module|Importing a module script failed/i;
export const esVersionVieja = (e: ErrorPantalla) => PARTES_VIEJAS.test(`${e.nombre} ${e.mensaje}`);

export const CLAVE_RECARGA = "zamorapp.error.recarga";

/** Recarga completa una vez por minuto como máximo: nunca un bucle si la nube de verdad está caída. */
export function recargarUnaVez(): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE_RECARGA) ?? 0);
    if (Math.abs(ahora() - ultima) < 60_000) return false;
    sessionStorage.setItem(CLAVE_RECARGA, String(ahora()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Texto corto de la causa, para que una captura de pantalla baste para saber qué pasó. */
export const detalle = (e: ErrorPantalla) => `${e.digest ? `Código: ${e.digest} · ` : ""}Detalle: ${`${e.nombre}: ${e.mensaje}`.slice(0, 160)}`;
