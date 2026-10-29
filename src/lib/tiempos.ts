import { cache } from "react";

// Mide cuánto tarda cada petición a Supabase dentro de una misma carga de pantalla.
// El registro vive por petición (React cache): el layout lo resume al terminar de responder
// con una línea «[tiempo]» en los registros del servidor (Vercel o app.log del escritorio).
// Una pantalla que pasa de LENTA_MS lleva además la marca «[lenta]», igual que la puerta local.
export const LENTA_MS = 700;

export type Llamada = { ruta: string; ms: number; estado: number };
type Registro = { inicio: number; llamadas: Llamada[] };

const registroDePeticion = cache((): Registro => ({ inicio: Date.now(), llamadas: [] }));

// Nombre corto de la llamada: tabla o función, sin filtros ni claves. En Storage se corta en
// storage/v1/object/<acción>/<bucket> (como la puerta en #67): el nombre del archivo nunca va a los registros.
export function nombreLlamada(url: string) {
  try {
    const u = new URL(url);
    const m = /^(\/storage\/v1\/object\/(?:(?:public|sign|authenticated|info|upload\/sign)\/)?[^/]+)\//.exec(u.pathname);
    if (m) return `${m[1].slice(1)}/…`;
    const partes = u.pathname.split("/").filter(Boolean);
    const i = partes.findIndex((p) => p === "v1");
    return partes.slice(i + 1).join("/") || u.pathname;
  } catch {
    return url;
  }
}

// fetch que anota cada llamada en el registro de la petición en curso
export const fetchMedido: typeof fetch = async (entrada, init) => {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  const t0 = Date.now();
  let estado = 0;
  try {
    const r = await fetch(entrada, init);
    estado = r.status;
    return r;
  } finally {
    try {
      registroDePeticion().llamadas.push({ ruta: nombreLlamada(url), ms: Date.now() - t0, estado });
    } catch {
      // fuera de una petición (p. ej. en una acción de fondo): no se anota
    }
  }
};

export function resumenTiempos(ruta: string) {
  const r = registroDePeticion();
  const total = Date.now() - r.inicio;
  const base = r.llamadas.reduce((s, l) => s + l.ms, 0);
  const lenta = [...r.llamadas].sort((a, b) => b.ms - a.ms)[0];
  const marca = total >= LENTA_MS ? "[lenta] " : "";
  const detalle = lenta ? `; la más lenta ${lenta.ruta} ${lenta.ms} ms` : "";
  return `${marca}[tiempo] ${ruta}: ${total} ms, ${r.llamadas.length} llamadas a la base (${base} ms sumados${detalle})`;
}
