// Lectura de la tasa oficial del dólar del BCV (Cesar, 05-nov-2026). El BCV publica a las 4–5 p. m. la tasa del día
// hábil siguiente con su «Fecha Valor»; se guarda por esa fecha. Si el portal del BCV no responde (su certificado
// suele fallar), se usa ve.dolarapi.com, que copia la misma tasa oficial con su fecha. Sin datos de nadie.

export type TasaLeida = { fecha: string; tasa: number; fuente: "bcv" | "respaldo" };

const ESPERA_MS = 15_000;

// «896,12250000» → 896.1225 (formato venezolano: punto de miles, coma decimal)
export const numeroVe = (s: string) => Number(s.trim().replace(/\./g, "").replace(",", "."));

// Del HTML de www.bcv.org.ve: el bloque id="dolar" trae la tasa y, más abajo, «Fecha Valor» con content="AAAA-MM-DD…"
export function leerHtmlBcv(html: string): { fecha: string; tasa: number } | null {
  const i = html.indexOf('id="dolar"');
  if (i < 0) return null;
  const bloque = html.slice(i, i + 3000);
  const t = bloque.match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/);
  const f = html.slice(i).match(/Fecha Valor:[\s\S]{0,200}?content="(\d{4}-\d{2}-\d{2})/);
  if (!t || !f) return null;
  const tasa = numeroVe(t[1]);
  return Number.isFinite(tasa) && tasa > 0 ? { fecha: f[1], tasa } : null;
}

// De ve.dolarapi.com/v1/dolares/oficial: { promedio: 894.8876, fechaActualizacion: "2026-11-05T00:00:00-04:00" }
export function leerJsonRespaldo(j: unknown): { fecha: string; tasa: number } | null {
  const o = j as { promedio?: unknown; fechaActualizacion?: unknown } | null;
  const tasa = Number(o?.promedio);
  const fecha = typeof o?.fechaActualizacion === "string" ? o.fechaActualizacion.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && Number.isFinite(tasa) && tasa > 0 ? { fecha, tasa } : null;
}

async function traer(url: string) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ESPERA_MS), headers: { "User-Agent": "zamorApp-Ocupacional/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

// Primero el BCV; si falla o cambió el formato, el respaldo. Devuelve también por qué falló cada uno (sin datos).
export async function leerTasaBcv(): Promise<{ tasa: TasaLeida | null; fallas: string[] }> {
  const fallas: string[] = [];
  try {
    const l = leerHtmlBcv(await (await traer("https://www.bcv.org.ve/")).text());
    if (l) return { tasa: { ...l, fuente: "bcv" }, fallas };
    fallas.push("bcv: formato no reconocido");
  } catch (e) {
    fallas.push(`bcv: ${(e as Error).message.slice(0, 80)}`);
  }
  try {
    const l = leerJsonRespaldo(await (await traer("https://ve.dolarapi.com/v1/dolares/oficial")).json());
    if (l) return { tasa: { ...l, fuente: "respaldo" }, fallas };
    fallas.push("respaldo: formato no reconocido");
  } catch (e) {
    fallas.push(`respaldo: ${(e as Error).message.slice(0, 80)}`);
  }
  return { tasa: null, fallas };
}

// La tasa que rige en una fecha: la de esa fecha o, si no hay (fin de semana, feriado), la anterior más cercana.
export function tasaParaFecha<T extends { fecha: string }>(tasas: T[], fecha: string): T | null {
  let mejor: T | null = null;
  for (const t of tasas) if (t.fecha <= fecha && (!mejor || t.fecha > mejor.fecha)) mejor = t;
  return mejor;
}
