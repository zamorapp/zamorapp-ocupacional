// Fechas de negocio («hoy», vencimientos, rangos) siempre en hora de Caracas.
// Vercel y Supabase corren en UTC: new Date().toISOString().slice(0, 10) o new Date().getFullYear()
// dan la fecha de MAÑANA entre las 20:00 y las 24:00. ESLint prohíbe esas formas fuera de aquí.
// En la base, lo mismo lo hacen public.hoy_caracas() y public.fecha_caracas(momento).

export const ZONA = "America/Caracas";

// Hora real en ms. En el escritorio, Next y la ventana corren con la fecha de Windows, que Cesar cambia para abrir el
// SAME: se le suma el desfase con la hora anclada a la nube que da la puerta (lo fijan hora-escritorio.ts en el
// servidor y HoraEscritorio en la ventana). En la web el desfase es 0. Toda fecha u hora de negocio sale de aquí;
// ESLint prohíbe Date.now() y new Date() sin argumentos fuera de este archivo; las duraciones usan performance.now().
type ConDesfase = typeof globalThis & { __zamorappDesfase?: number };
export const ahora = () => Date.now() + ((globalThis as ConDesfase).__zamorappDesfase ?? 0);
// La fecha de Windows tal cual: solo para medir el desfase (hora-escritorio)
export const fechaDeWindows = () => Date.now();
export const fijarDesfase = (ms: number) => {
  if (Number.isFinite(ms)) (globalThis as ConDesfase).__zamorappDesfase = Math.round(ms);
};

// "AAAA-MM-DD" del día en Caracas del momento dado (ahora, si no se da)
export const hoyCaracas = (momento: Date | string | number = ahora()) =>
  new Date(momento).toLocaleDateString("en-CA", { timeZone: ZONA });

// Año y mes (0-11) de hoy en Caracas
export const anioCaracas = () => Number(hoyCaracas().slice(0, 4));
export const mesCaracas = () => Number(hoyCaracas().slice(5, 7)) - 1;

// Aritmética sobre fechas "AAAA-MM-DD" (sin horas, no depende de la zona)
export const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const sumarMeses = (iso: string, meses: number) => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + meses, d)).toISOString().slice(0, 10);
};

// "AAAA-MM-DDTHH:mm" en Caracas, para los campos datetime-local (ahora, si no se da)
export const horaLocalCaracas = (momento: Date | string | number = ahora()) =>
  new Date(momento).toLocaleString("sv-SE", { timeZone: ZONA, hour12: false }).slice(0, 16).replace(" ", "T");

// Tiempo entre dos fechas "AAAA-MM-DD" en años y meses: antigüedad en el cargo o en la empresa, edad.
// «3 años y 2 meses», «5 meses», «menos de un mes». Null si falta la fecha o es posterior a «hasta».
export const antiguedad = (desde: string | null | undefined, hasta: string = hoyCaracas()): string | null => {
  if (!desde || desde.slice(0, 10) > hasta.slice(0, 10)) return null;
  const [a1, m1, d1] = desde.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = hasta.slice(0, 10).split("-").map(Number);
  const meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  if (meses <= 0) return "menos de un mes";
  const partes = [anios && `${anios} ${anios === 1 ? "año" : "años"}`, resto && `${resto} ${resto === 1 ? "mes" : "meses"}`].filter(Boolean);
  return partes.join(" y ");
};
