// Gráficos de los reportes sin librerías: SVG y HTML que se dibujan en el servidor, en pantalla y en papel.
// Colores por variables (--g-1 verde azulado, --g-2 ámbar, --g-pista, --g-linea, --g-tinta): ver globals.css.
// Una sola escala por gráfico; los valores van en tinta de texto, nunca en el color de la serie.

const fmt = (n: number, dec = 0) => n.toLocaleString("es-VE", { maximumFractionDigits: dec });
const pct = (n: number, total: number) => (total ? Math.round((n * 1000) / total) / 10 : 0);

export type Fila = { nombre: string; n: number; detalle?: string };

export function SinDatos({ texto = "Sin registros en el período." }: { texto?: string }) {
  return <p className="py-3 text-center text-[0.85em] text-g-tinta">{texto}</p>;
}

// Barras horizontales ordenadas, con etiqueta, valor y porcentaje. "max" recorta a las primeras N y suma el resto en «Otros».
export function BarrasH({ filas, max = 8, sufijo, serie = 1, porcentaje = true }: { filas: Fila[]; max?: number; sufijo?: string; serie?: 1 | 2; porcentaje?: boolean }) {
  const datos = filas.filter((f) => f.n > 0).sort((a, b) => b.n - a.n);
  if (!datos.length) return <SinDatos />;
  const total = datos.reduce((s, f) => s + f.n, 0);
  const visibles = datos.length > max ? [...datos.slice(0, max - 1), { nombre: "Otros", n: datos.slice(max - 1).reduce((s, f) => s + f.n, 0) }] : datos;
  const tope = Math.max(...visibles.map((f) => f.n));
  return (
    <ul className="space-y-[0.45em]">
      {visibles.map((f) => (
        <li key={f.nombre} className="grid grid-cols-[minmax(0,38%)_minmax(0,1fr)_auto] items-center gap-[0.75em]" title={`${f.nombre}: ${fmt(f.n)}`}>
          <span className="truncate">{f.nombre}</span>
          <span className="h-[0.7em] rounded-r-[4px] bg-g-pista">
            <span className={`block h-full rounded-r-[4px] ${serie === 1 ? "bg-g-1" : "bg-g-2"}`} style={{ width: `${Math.max(2, (f.n / tope) * 100)}%` }} />
          </span>
          <span className="min-w-[4.5em] text-right font-cifra tabular-nums">
            <b>{fmt(f.n)}</b>{sufijo && ` ${sufijo}`}
            {porcentaje && <span className="ml-[0.4em] text-[0.85em] text-g-tinta">{"detalle" in f && f.detalle ? f.detalle : `${fmt(pct(f.n, total), 1)} %`}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Dona de 2 a 4 partes con la cifra central y la leyenda con valores (la identidad nunca queda solo en el color)
const TONOS = ["var(--g-1)", "var(--g-2)", "color-mix(in oklab, var(--g-1) 45%, var(--g-pista))", "color-mix(in oklab, var(--g-tinta) 40%, var(--g-pista))"];
export function Dona({ partes, centro, sub, tam = 112 }: { partes: Fila[]; centro?: string; sub?: string; tam?: number }) {
  const datos = partes.filter((p) => p.n > 0);
  const total = datos.reduce((s, p) => s + p.n, 0);
  if (!total) return <SinDatos />;
  const r = 42, c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <div className="flex items-center gap-[1.2em]">
      <svg viewBox="0 0 100 100" width={tam} height={tam} className="shrink-0 -rotate-90" role="img" aria-label={datos.map((p) => `${p.nombre} ${fmt(p.n)}`).join(", ")}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--g-pista)" strokeWidth="13" />
        {datos.map((p, i) => {
          const largo = (p.n / total) * c;
          // 2 px de separación entre partes (si hay más de una)
          const hueco = datos.length > 1 ? Math.min(1.6, largo / 3) : 0;
          const el = (
            <circle key={p.nombre} cx="50" cy="50" r={r} fill="none" stroke={TONOS[i % TONOS.length]} strokeWidth="13"
              strokeDasharray={`${Math.max(0, largo - hueco)} ${c}`} strokeDashoffset={-acumulado}>
              <title>{`${p.nombre}: ${fmt(p.n)} (${fmt(pct(p.n, total), 1)} %)`}</title>
            </circle>
          );
          acumulado += largo;
          return el;
        })}
        {centro && (
          <g className="rotate-90 origin-center">
            <text x="50" y={sub ? 50 : 55} textAnchor="middle" className="fill-current font-cifra text-[17px] font-bold">{centro}</text>
            {sub && <text x="50" y="64" textAnchor="middle" className="fill-[var(--g-tinta)] text-[8.5px]">{sub}</text>}
          </g>
        )}
      </svg>
      <ul className="min-w-0 space-y-[0.35em]">
        {datos.map((p, i) => (
          <li key={p.nombre} className="flex items-baseline gap-[0.5em]">
            <span className="inline-block size-[0.7em] shrink-0 rounded-[3px]" style={{ background: TONOS[i % TONOS.length] }} />
            <span className="min-w-0">{p.nombre}</span>
            <span className="ml-auto pl-[0.6em] font-cifra font-semibold tabular-nums">{fmt(p.n)}</span>
            <span className="w-[3.6em] text-right font-cifra text-[0.85em] text-g-tinta tabular-nums">{fmt(pct(p.n, total), 1)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Pirámide de la población: mujeres a la izquierda (ámbar), hombres a la derecha (verde azulado), misma escala a ambos lados
export function Piramide({ grupos }: { grupos: { grupo: string; F: number; M: number }[] }) {
  const datos = grupos.filter((g) => g.F + g.M > 0);
  if (!datos.length) return <SinDatos texto="Sin población registrada." />;
  const tope = Math.max(...datos.flatMap((g) => [g.F, g.M]));
  const barra = (n: number, lado: "F" | "M") => (
    <div className={`flex items-center gap-[0.4em] ${lado === "F" ? "flex-row-reverse" : ""}`}>
      <span className={`h-[0.85em] ${lado === "F" ? "rounded-l-[4px] bg-g-2" : "rounded-r-[4px] bg-g-1"}`} style={{ width: `${n ? Math.max(2, (n / tope) * 82) : 0}%` }} />
      <span className="font-cifra text-[0.85em] tabular-nums">{n ? fmt(n) : ""}</span>
    </div>
  );
  return (
    <div>
      <div className="mb-[0.4em] grid grid-cols-[1fr_auto_1fr] text-[0.85em] text-g-tinta">
        <span className="flex items-center justify-end gap-[0.4em]"><i className="inline-block size-[0.7em] rounded-[3px] bg-g-2" /> Mujeres</span>
        <span className="w-[5em]" />
        <span className="flex items-center gap-[0.4em]"><i className="inline-block size-[0.7em] rounded-[3px] bg-g-1" /> Hombres</span>
      </div>
      <div className="space-y-[0.3em]">
        {[...datos].reverse().map((g) => (
          <div key={g.grupo} className="grid grid-cols-[1fr_auto_1fr] items-center" title={`${g.grupo}: ${g.F} mujeres, ${g.M} hombres`}>
            {barra(g.F, "F")}
            <span className="w-[5em] text-center text-[0.85em] font-semibold">{g.grupo}</span>
            {barra(g.M, "M")}
          </div>
        ))}
      </div>
    </div>
  );
}

// Pareto: barras con el % de cada categoría y la línea del % acumulado, ambas en la misma escala 0-100 %
export function Pareto({ filas, max = 8 }: { filas: Fila[]; max?: number }) {
  const datos = filas.filter((f) => f.n > 0).sort((a, b) => b.n - a.n);
  if (!datos.length) return <SinDatos />;
  const total = datos.reduce((s, f) => s + f.n, 0);
  const vis = datos.length > max ? [...datos.slice(0, max - 1), { nombre: "Otros", n: datos.slice(max - 1).reduce((s, f) => s + f.n, 0) }] : datos;
  const W = 520, H = 210, izq = 34, der = 10, arriba = 12, abajo = 58;
  const ancho = (W - izq - der) / vis.length;
  const y = (p: number) => arriba + (H - arriba - abajo) * (1 - p / 100);
  let acum = 0;
  const puntos = vis.map((f, i) => { acum += f.n; return { x: izq + ancho * (i + 0.5), y: y((acum / total) * 100), p: (acum / total) * 100 }; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Diagrama de Pareto">
      {[0, 25, 50, 75, 100].map((p) => (
        <g key={p}>
          <line x1={izq} x2={W - der} y1={y(p)} y2={y(p)} stroke="var(--g-linea)" strokeWidth="0.8" />
          <text x={izq - 5} y={y(p) + 3} textAnchor="end" className="fill-[var(--g-tinta)] font-cifra text-[9px]">{p}%</text>
        </g>
      ))}
      <line x1={izq} x2={W - der} y1={y(80)} y2={y(80)} stroke="var(--g-2)" strokeWidth="1" strokeDasharray="4 3" />
      <text x={W - der} y={y(80) - 3} textAnchor="end" className="fill-[var(--g-tinta)] text-[8.5px]">80 %</text>
      {vis.map((f, i) => {
        const p = (f.n / total) * 100;
        const x = izq + ancho * i + ancho * 0.18;
        return (
          <g key={f.nombre}>
            <rect x={x} y={y(p)} width={ancho * 0.64} height={Math.max(0.5, y(0) - y(p))} rx="3" fill="var(--g-1)">
              <title>{`${f.nombre}: ${fmt(f.n)} (${fmt(p, 1)} %)`}</title>
            </rect>
            {/* Cifra dentro de la barra si cabe (arriba queda la línea del acumulado) */}
            <text x={x + ancho * 0.32} y={y(0) - y(p) > 16 ? y(p) + 12 : y(p) - 4} textAnchor="middle" className={`font-cifra text-[9px] font-semibold ${y(0) - y(p) > 16 ? "fill-white" : "fill-current"}`}>{fmt(f.n)}</text>
            <text x={izq + ancho * (i + 0.5)} y={H - abajo + 12} textAnchor="end" transform={`rotate(-32 ${izq + ancho * (i + 0.5)} ${H - abajo + 12})`} className="fill-current text-[9px]">
              {f.nombre.length > 22 ? `${f.nombre.slice(0, 21)}…` : f.nombre}
            </text>
          </g>
        );
      })}
      <polyline points={puntos.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--g-2)" strokeWidth="2" strokeLinejoin="round" />
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="var(--g-2)" stroke="white" strokeWidth="1.5"><title>{`Acumulado: ${fmt(p.p, 1)} %`}</title></circle>
      ))}
    </svg>
  );
}

const MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const nombreMes = (aaaamm: string) => MES[Number(aaaamm.slice(5, 7)) - 1] ?? aaaamm;

// Columnas por mes (tendencia del período): una serie, con el valor sobre cada columna
export function Columnas({ puntos, sufijo, serie = 1, alto = 120 }: { puntos: { etiqueta: string; n: number }[]; sufijo?: string; serie?: 1 | 2; alto?: number }) {
  if (!puntos.length || puntos.every((p) => !p.n)) return <SinDatos />;
  const tope = Math.max(...puntos.map((p) => p.n));
  return (
    <div className="flex items-end gap-[0.6em] border-b border-g-linea" style={{ height: alto }}>
      {puntos.map((p) => (
        <div key={p.etiqueta} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${p.etiqueta}: ${fmt(p.n)}${sufijo ? ` ${sufijo}` : ""}`}>
          <span className="mb-[0.2em] font-cifra text-[0.85em] font-semibold tabular-nums">{fmt(p.n)}</span>
          <span className={`w-full max-w-[3.2em] rounded-t-[4px] ${serie === 1 ? "bg-g-1" : "bg-g-2"}`} style={{ height: `${p.n ? Math.max(3, (p.n / tope) * 78) : 0}%` }} />
        </div>
      ))}
      <span className="sr-only">{puntos.map((p) => `${p.etiqueta} ${p.n}`).join(", ")}</span>
    </div>
  );
}
export function EjeMeses({ etiquetas }: { etiquetas: string[] }) {
  return (
    <div className="mt-[0.3em] flex gap-[0.6em] text-[0.85em] text-g-tinta">
      {etiquetas.map((e) => <span key={e} className="flex-1 text-center">{e}</span>)}
    </div>
  );
}

// Medidor de meta: barra con la marca de la meta (p. ej. ausentismo < 2,5 %)
export function Meta({ valor, meta, tope, sufijo = " %" }: { valor: number; meta: number; tope?: number; sufijo?: string }) {
  const max = tope ?? Math.max(meta * 2, valor * 1.15, 0.1);
  const enMeta = valor <= meta;
  return (
    <div>
      <div className="relative h-[0.8em] rounded-full bg-g-pista">
        <span className={`absolute inset-y-0 left-0 rounded-full ${enMeta ? "bg-g-1" : "bg-g-2"}`} style={{ width: `${Math.min(100, (valor / max) * 100)}%` }} />
        <span className="absolute -inset-y-[0.25em] w-[2px] bg-current" style={{ left: `${(meta / max) * 100}%` }} />
      </div>
      <div className="relative mt-[0.3em] h-[1.2em] text-[0.85em] text-g-tinta">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(meta / max) * 100}%` }}>Meta {fmt(meta, 1)}{sufijo}</span>
      </div>
    </div>
  );
}
