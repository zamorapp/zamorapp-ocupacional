// Cambios que el médico le hace en pantalla a una hoja de indicaciones (dieta, bienestar): textos cambiados, renglones
// quitados o agregados. Viajan en la URL (?c=, JSON en base64url) para que la misma hoja salga igual al imprimir, al
// guardar el PDF y al enviarla al trabajador (el PDF del servidor se arma con la misma URL). Sin base de datos: sirve
// igual en la web, en el escritorio y sin internet.

export type Cambios = Record<string, string | string[]>;

// Topes: la URL no debe crecer sin control (y lo que llega de una URL es dato externo)
export const MAX_C = 8000;
// Una dieta con su guía ilustrada tiene más de 80 textos editables: con 80 se perdían claves en silencio (Analizar #358)
const MAX_CLAVES = 160;
const MAX_RENGLONES = 40;
const MAX_TEXTO = 600;
const CLAVE = /^[a-z0-9-]{1,40}$/;

const aBase64url = (texto: string) => {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const deBase64url = (texto: string) => {
  const bin = atob(texto.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function leerCambios(c: string | null | undefined): Cambios {
  if (!c || c.length > MAX_C || !/^[A-Za-z0-9_-]+$/.test(c)) return {};
  try {
    const datos: unknown = JSON.parse(deBase64url(c));
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return {};
    const limpio: Cambios = {};
    for (const [k, v] of Object.entries(datos).slice(0, MAX_CLAVES)) {
      if (!CLAVE.test(k)) continue;
      if (typeof v === "string") limpio[k] = v.slice(0, MAX_TEXTO);
      else if (Array.isArray(v)) limpio[k] = v.filter((x): x is string => typeof x === "string").slice(0, MAX_RENGLONES).map((x) => x.slice(0, MAX_TEXTO));
    }
    return limpio;
  } catch {
    return {};
  }
}

export const escribirCambios = (cambios: Cambios) => (Object.keys(cambios).length ? aBase64url(JSON.stringify(cambios)) : null);

// Valor de un texto o de una lista: el cambiado si lo hay, si no el de la plantilla
export const texto = (cambios: Cambios | undefined, id: string, base: string) => {
  const v = cambios?.[id];
  return typeof v === "string" ? v : base;
};
export const lista = (cambios: Cambios | undefined, id: string, base: string[]) => {
  const v = cambios?.[id];
  return Array.isArray(v) ? v : base;
};
