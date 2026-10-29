// Equipo de confianza (verificación en dos pasos): tras escribir el código, este navegador guarda un token al azar
// que la base solo conoce como hash. Cada pedido lo envía en la cabecera x-zamorapp-equipo y, mientras esté
// vigente, la base da por hecho el segundo paso de su dueño. Ver supabase/migrations/20261029004500.
export const COOKIE_EQUIPO = "zamorapp-equipo";
export const CABECERA_EQUIPO = "x-zamorapp-equipo";

/** Cabeceras para los clientes de Supabase (vacías si este equipo no es de confianza). */
export const cabecerasEquipo = (token: string | undefined | null): Record<string, string> =>
  token && /^[0-9a-f]{40,128}$/.test(token) ? { [CABECERA_EQUIPO]: token } : {};

/** Navegador: lee el token de la cookie. */
export function tokenEquipoNavegador(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_EQUIPO}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function guardarEquipoNavegador(token: string, vence: string) {
  const segura = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_EQUIPO}=${encodeURIComponent(token)}; Path=/; Expires=${new Date(vence).toUTCString()}; SameSite=Lax${segura}`;
}

export function olvidarEquipoNavegador() {
  document.cookie = `${COOKIE_EQUIPO}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Nombre corto del equipo para la lista de «Mi perfil». */
export function nombreEquipo(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const so = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Mac/.test(ua) ? "Mac" : "Equipo";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${so} · ${nav}`;
}
