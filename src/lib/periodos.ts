// Períodos de los reportes. El trimestre se cuenta desde el mes de inicio de la gestión de cada empresa
// (enero por defecto): si la empresa empieza en febrero, el I trimestre es febrero-abril.

export type Periodo = {
  clave: string;
  desde: string;
  hasta: string;
  etiqueta: string;
  // Solo en trimestres: año de gestión, número (1-4) y mes de inicio de la gestión (1-12)
  anio?: number;
  t?: number;
  inicio?: number;
};

export type ConsultaPeriodo = { p?: string; desde?: string; hasta?: string; anio?: string; t?: string; inicio?: string; mes?: string };

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const ROMANOS = ["I", "II", "III", "IV"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fecha = (anio: number, mes0: number, dia = 1) => new Date(Date.UTC(anio, mes0, dia));
export const fechaCorta = (v: string) => v.split("-").reverse().join("/");

function hoyCaracas() {
  const d = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" }) + "T00:00:00Z");
  return { a: d.getUTCFullYear(), m: d.getUTCMonth() };
}

// "febrero – abril 2026" o "noviembre 2026 – enero 2027"
export function rangoMeses(desde: string, hasta: string) {
  const [a1, m1] = desde.split("-").map(Number);
  const [a2, m2] = hasta.split("-").map(Number);
  if (a1 === a2 && m1 === m2) return `${MESES[m1 - 1]} ${a1}`;
  return a1 === a2 ? `${MESES[m1 - 1]} – ${MESES[m2 - 1]} ${a1}` : `${MESES[m1 - 1]} ${a1} – ${MESES[m2 - 1]} ${a2}`;
}

// Trimestre t (1-4) del año de gestión que empieza en el mes "inicio" (1-12) del año "anio"
export function trimestre(anio: number, t: number, inicio = 1): Periodo {
  const m0 = inicio - 1 + 3 * (t - 1);
  const desde = iso(fecha(anio, m0));
  const hasta = iso(fecha(anio, m0 + 3, 0));
  const gestion = inicio === 1 ? String(anio) : `de gestión ${anio}`;
  return { clave: "t", desde, hasta, anio, t, inicio, etiqueta: `${ROMANOS[t - 1]} trimestre ${gestion} (${rangoMeses(desde, hasta)})` };
}

// Trimestre de gestión que contiene el mes dado
export function trimestreDe(anio: number, mes0: number, inicio = 1) {
  let k = mes0 - (inicio - 1);
  let a = anio;
  if (k < 0) { k += 12; a -= 1; }
  return { anio: a, t: Math.floor(k / 3) + 1 };
}

// Los cuatro trimestres de un año de gestión, para los botones del selector
export function trimestresDelAnio(anio: number, inicio = 1) {
  return [1, 2, 3, 4].map((t) => trimestre(anio, t, inicio));
}

const entero = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

// Interpreta la URL de Reportes. "inicioEmpresa" es el mes de inicio de gestión de la empresa elegida.
export function periodoDeConsulta(q: ConsultaPeriodo, inicioEmpresa = 1): Periodo {
  const { a, m } = hoyCaracas();
  const inicio = entero(q.inicio, 1, 12) ?? inicioEmpresa;
  switch (q.p) {
    case "mes":
      return { clave: "mes", desde: iso(fecha(a, m)), hasta: iso(fecha(a, m + 1, 0)), etiqueta: `${MESES[m]} ${a}` };
    case "anio": {
      // Año de gestión en curso (12 meses desde el mes de inicio)
      const g = trimestreDe(a, m, inicio).anio;
      const desde = iso(fecha(g, inicio - 1));
      const hasta = iso(fecha(g, inicio - 1 + 12, 0));
      return { clave: "anio", desde, hasta, etiqueta: inicio === 1 ? `Año ${g}` : `Año de gestión ${g} (${rangoMeses(desde, hasta)})` };
    }
    case "rango":
      if (q.desde && q.hasta && /^\d{4}-\d{2}-\d{2}$/.test(q.desde) && /^\d{4}-\d{2}-\d{2}$/.test(q.hasta) && q.desde <= q.hasta) {
        return { clave: "rango", desde: q.desde, hasta: q.hasta, etiqueta: `Del ${fechaCorta(q.desde)} al ${fechaCorta(q.hasta)}` };
      }
      break;
    case "ventana": {
      // Tres meses seguidos desde el mes elegido (AAAA-MM)
      const [va, vm] = (q.mes ?? "").split("-").map(Number);
      if (va >= 2000 && vm >= 1 && vm <= 12) {
        const desde = iso(fecha(va, vm - 1));
        const hasta = iso(fecha(va, vm + 2, 0));
        return { clave: "ventana", desde, hasta, etiqueta: `Trimestre ${rangoMeses(desde, hasta)}` };
      }
      break;
    }
    case "t": {
      const anio = entero(q.anio, 2000, 2100);
      const t = entero(q.t, 1, 4);
      if (anio && t) return trimestre(anio, t, inicio);
      break;
    }
    case "trimestre_anterior": {
      const actual = trimestreDe(a, m, inicio);
      const prev = actual.t === 1 ? trimestre(actual.anio - 1, 4, inicio) : trimestre(actual.anio, actual.t - 1, inicio);
      return prev;
    }
  }
  const actual = trimestreDe(a, m, inicio);
  return trimestre(actual.anio, actual.t, inicio);
}

// Parámetros de URL que reproducen el período (para enlaces e impresión)
export function parametrosPeriodo(p: Periodo): Record<string, string> {
  if (p.clave === "t" && p.anio && p.t) return { p: "t", anio: String(p.anio), t: String(p.t), inicio: String(p.inicio ?? 1) };
  if (p.clave === "ventana") return { p: "ventana", mes: p.desde.slice(0, 7) };
  if (p.clave === "rango") return { p: "rango", desde: p.desde, hasta: p.hasta };
  return { p: p.clave };
}

// Firma anterior, usada por Facturación
export function resolverPeriodo(clave = "trimestre", desde?: string, hasta?: string): Periodo {
  return periodoDeConsulta({ p: clave, desde, hasta });
}
