// Gráficas de la identificación de riesgos con efecto de profundidad (Cesar, 06-nov: «gráficas 3D, llamativas, de uso
// corporativo»). No es 3D real (deforma las cantidades): es relieve con luz, sombra y brillo, sobre SVG puro.
// Sin librerías ni internet: pesan nada y se dibujan igual en un equipo sencillo, en la pantalla y en el papel.
// Color: grupos con la paleta categórica validada (orden fijo, siempre con su letra); niveles con colores de estado
// (siempre con su palabra). Cada marca tiene su detalle al pasar el mouse (<title>).
import { claveRiesgo, ESCALA_P, ESCALA_S, GRUPOS, type GrupoRiesgo } from "@/lib/puestos-tipos";
import { COLOR_NIVEL, NIVELES, NOMBRE_GRUPO, nivelFila, porPuesto, SIMBOLO, type FilaRiesgo } from "@/lib/riesgos-puesto";
import { cn } from "@/lib/utils";

// Etiqueta corta para gráficas y leyendas (el nombre completo va en las tablas)
const CORTO = (g: GrupoRiesgo) => (g === "disergonomico" ? "Ergonómico" : g === "mecanico" ? "Mecánico o seguridad" : NOMBRE_GRUPO[g]);

type Base = { filas: FilaRiesgo[]; impreso?: boolean; className?: string };

// Brillo y sombra compartidos: un degradado de luz arriba-izquierda y una sombra suave abajo
function Defs({ id, impreso }: { id: string; impreso?: boolean }) {
  return (
    <defs>
      <linearGradient id={`${id}-luz`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0.38} />
        <stop offset="0.5" stopColor="#ffffff" stopOpacity={0.06} />
        <stop offset="1" stopColor="#000000" stopOpacity={0.14} />
      </linearGradient>
      <filter id={`${id}-sombra`} x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy={impreso ? 1 : 3} stdDeviation={impreso ? 1 : 3} floodColor="#0b1b2b" floodOpacity={impreso ? 0.18 : 0.28} />
      </filter>
    </defs>
  );
}

const Letra = ({ g, chico }: { g: GrupoRiesgo; chico?: boolean }) => (
  <span
    className={cn("inline-grid shrink-0 place-items-center rounded-full font-bold shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_1px_2px_rgba(0,0,0,.25)]", chico ? "size-4 text-[9px]" : "size-6 text-[11px]")}
    style={{ background: SIMBOLO[g].color, color: SIMBOLO[g].texto }}
    aria-hidden
  >
    {SIMBOLO[g].letra}
  </span>
);
export { Letra as LetraGrupo };

// Cifras grandes: lo primero que se lee
export function Tarjetas({ filas, expuestos, puestos, impreso }: Base & { expuestos: number; puestos: number }) {
  const niveles = filas.map(nivelFila);
  const graves = niveles.filter((n) => n && n.n >= 10).length;
  const criticos = niveles.filter((n) => n && n.n >= 17).length;
  const datos = [
    { k: "Riesgos identificados", v: filas.length, nota: `${GRUPOS.filter(([g]) => filas.some((f) => f.grupo === g)).length} de 6 grupos` },
    { k: "Puestos evaluados", v: puestos, nota: "con su lista de chequeo" },
    { k: "Trabajadores expuestos", v: expuestos, nota: "por área (NT-04-2023, 14.1.5)" },
    { k: "Altos y críticos", v: graves, nota: criticos ? `${criticos} críticos: acción inmediata` : "ninguno crítico", alerta: graves > 0 },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", impreso && "grid-cols-4 gap-2")}>
      {datos.map((d) => (
        <div
          key={d.k}
          className={cn(
            "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card to-muted/60 p-4 shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_8px_24px_-12px_rgba(15,40,60,.35)]",
            impreso && "rounded-lg border-doc-linea from-white to-white p-2 shadow-none",
          )}
        >
          <div className={cn("text-xs font-medium text-muted-foreground", impreso && "text-[8.5px] uppercase tracking-[.08em] text-doc-tenue")}>{d.k}</div>
          <div className={cn("mt-1 font-cifra text-3xl font-semibold tabular-nums", impreso && "text-[20px]", d.alerta && "text-alerta-texto")}>{d.v}</div>
          <div className={cn("text-[11px] text-muted-foreground", impreso && "text-[8.5px] text-doc-tenue")}>{d.nota}</div>
        </div>
      ))}
    </div>
  );
}

// Dona por grupo de riesgo, con relieve: cada porción con luz y una sombra bajo el anillo
export function DonaGrupos({ filas, impreso, className }: Base) {
  const datos = GRUPOS.map(([g]) => ({ g, n: filas.filter((f) => f.grupo === g).length })).filter((d) => d.n > 0);
  const total = datos.reduce((a, d) => a + d.n, 0);
  const R = 70, r = 44, C = 90;
  let ang = -Math.PI / 2;
  const arco = (a0: number, a1: number) => {
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${p(R, a0)} A ${R} ${R} 0 ${grande} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${grande} 0 ${p(r, a0)} Z`;
  };
  const superficie = impreso ? "#ffffff" : "var(--card)";
  return (
    <figure className={cn("flex flex-wrap items-center gap-4", className)}>
      <svg viewBox="0 0 180 180" className={cn("shrink-0", impreso ? "size-32" : "size-44")} role="img" aria-label={`Riesgos por grupo: ${datos.map((d) => `${NOMBRE_GRUPO[d.g]} ${d.n}`).join(", ")}`}>
        <Defs id="dona" impreso={impreso} />
        {total === 0 ? (
          <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={R - r} />
        ) : (
          <g filter="url(#dona-sombra)">
            {datos.map((d) => {
              const a0 = ang, a1 = ang + (d.n / total) * Math.PI * 2 - (datos.length > 1 ? 0.0001 : 0.001);
              ang = a0 + (d.n / total) * Math.PI * 2;
              const camino = datos.length === 1 ? null : arco(a0, a1);
              return (
                <g key={d.g} className="transition-opacity hover:opacity-85">
                  <title>{`${NOMBRE_GRUPO[d.g]}: ${d.n} (${Math.round((d.n / total) * 100)} %)`}</title>
                  {camino ? <path d={camino} fill={SIMBOLO[d.g].color} stroke={superficie} strokeWidth={2} /> : <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={SIMBOLO[d.g].color} strokeWidth={R - r} />}
                  {camino ? <path d={camino} fill="url(#dona-luz)" stroke="none" /> : <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="url(#dona-luz)" strokeWidth={R - r} />}
                </g>
              );
            })}
          </g>
        )}
        {/* Bisel interior: un aro de luz que da la sensación de volumen */}
        <circle cx={C} cy={C} r={r - 1} fill="none" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={1.5} />
        <text x={C} y={C - 2} textAnchor="middle" className="fill-current font-cifra" fontSize={30} fontWeight={600}>{total}</text>
        <text x={C} y={C + 16} textAnchor="middle" className="fill-current opacity-60" fontSize={10}>riesgos</text>
      </svg>
      <ul className={cn("min-w-40 flex-1 space-y-1.5 text-sm", impreso && "space-y-0.5 text-[12px]")}>
        {datos.map((d) => (
          <li key={d.g} className="flex items-center gap-2">
            <Letra g={d.g} chico={impreso} />
            <span className="min-w-0 flex-1 truncate">{CORTO(d.g)}</span>
            <span className="font-cifra font-semibold tabular-nums">{d.n}</span>
            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{Math.round((d.n / total) * 100)} %</span>
          </li>
        ))}
        {total === 0 && <li className="text-muted-foreground">Aún no hay riesgos.</li>}
      </ul>
    </figure>
  );
}

// Barras por puesto, apiladas por nivel (Crítico → Bajo), en relieve
export function BarrasPuestos({ filas, impreso, className }: Base) {
  const puestos = porPuesto(filas).map((p) => {
    const cuenta = Object.fromEntries(NIVELES.map((t) => [t, p.filas.filter((f) => nivelFila(f)?.texto === t).length])) as Record<(typeof NIVELES)[number], number>;
    const peso = p.filas.reduce((a, f) => a + (nivelFila(f)?.n ?? 0), 0);
    return { ...p, cuenta, peso };
  }).sort((a, b) => b.peso - a.peso);
  const max = Math.max(1, ...puestos.map((p) => p.filas.length));
  // HTML y no SVG: el texto conserva su tamaño en el celular y en una pantalla ancha; el relieve va con degradado y sombra
  const superficie = impreso ? "#ffffff" : "var(--card)";
  return (
    <figure className={className} aria-label="Riesgos por puesto y nivel">
      <div className={cn("grid items-center gap-x-3", impreso ? "grid-cols-[9rem_1fr_1.5rem] gap-y-1.5 text-[12px]" : "grid-cols-[minmax(6rem,11rem)_1fr_2rem] gap-y-2.5 text-sm")}>
        {puestos.map((p) => (
          <div key={p.clave} className="contents">
            <div className="truncate text-right" title={p.puesto}>{p.puesto}</div>
            <div className={cn("relative overflow-hidden rounded-full bg-muted", impreso ? "h-4" : "h-6")}>
              <div className="flex h-full drop-shadow-[0_2px_2px_rgba(0,0,0,.25)]" style={{ width: `${(p.filas.length / max) * 100}%` }}>
                {NIVELES.map((t) => p.cuenta[t] ? (
                  <div key={t} title={`${p.puesto} · ${t}: ${p.cuenta[t]}`} className={cn("grid h-full place-items-center font-cifra font-bold first:rounded-l-full last:rounded-r-full", impreso ? "text-[9.5px]" : "text-xs")}
                    style={{ flexGrow: p.cuenta[t], color: t === "Crítico" ? "#ffffff" : "#0b0b0b", background: `linear-gradient(180deg, rgba(255,255,255,.45), rgba(255,255,255,0) 55%, rgba(0,0,0,.12)), ${COLOR_NIVEL[t]}`, boxShadow: `2px 0 0 ${superficie}` }}>{p.cuenta[t]}</div>
                ) : null)}
              </div>
            </div>
            <div className="font-cifra font-semibold">{p.filas.length}</div>
          </div>
        ))}
      </div>
      <figcaption className={cn("mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground", impreso && "text-[9px] text-doc-tenue")}>
        {NIVELES.map((t) => <span key={t} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: COLOR_NIVEL[t] }} />{t}</span>)}
      </figcaption>
    </figure>
  );
}

// Matriz 5×5 (probabilidad × severidad): cada celda con su color de nivel y una burbuja en relieve con la cantidad
export function MatrizRiesgos({ filas, impreso, className }: Base) {
  const cuenta = new Map<string, FilaRiesgo[]>();
  for (const f of filas) if (f.p && f.s) cuenta.set(`${f.p}-${f.s}`, [...(cuenta.get(`${f.p}-${f.s}`) ?? []), f]);
  const tinte = (n: number) => (n <= 4 ? "#0ca30c" : n <= 9 ? "#fab219" : n <= 16 ? "#ec835a" : "#d03b3b");
  const letra = (n: number) => (n <= 4 ? "B" : n <= 9 ? "M" : n <= 16 ? "A" : "C");
  // Ejes con su título y la palabra en cada extremo; en cada celda la letra del nivel (se lee en blanco y negro)
  const L = 46, c = 46, A = c * 5, Y = 4;
  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${L + A + 6} ${Y + A + 44}`} className={cn("w-full", impreso ? "max-w-[250px]" : "max-w-[360px]")} role="img" aria-label="Matriz de riesgos: probabilidad (vertical) por severidad (horizontal)">
        <Defs id="matriz" impreso={impreso} />
        {[5, 4, 3, 2, 1].map((p, fila) => [1, 2, 3, 4, 5].map((s, col) => {
          const n = p * s, lista = cuenta.get(`${p}-${s}`) ?? [];
          const x = L + col * c, y = Y + fila * c;
          return (
            <g key={`${p}-${s}`}>
              <title>{`${ESCALA_P[p]} × ${ESCALA_S[s]} = ${n}${lista.length ? `: ${lista.map((f) => f.agente).join(", ")}` : ""}`}</title>
              <rect x={x + 1} y={y + 1} width={c - 2} height={c - 2} rx={6} fill={tinte(n)} fillOpacity={lista.length ? 0.32 : 0.14}
                stroke={tinte(n)} strokeOpacity={n >= 10 ? 0.9 : 0.35} strokeWidth={n >= 20 ? 2 : n >= 10 ? 1.5 : 0.75} />
              <text x={x + c - 6} y={y + 11} textAnchor="end" fontSize={8} fontWeight={700} className="fill-current" opacity={0.45}>{letra(n)}</text>
              {lista.length > 0 && (
                <g filter="url(#matriz-sombra)">
                  <circle cx={x + c / 2} cy={y + c / 2 + 2} r={9 + Math.min(lista.length, 6) * 1.5} fill={tinte(n)} />
                  <circle cx={x + c / 2} cy={y + c / 2 + 2} r={9 + Math.min(lista.length, 6) * 1.5} fill="url(#matriz-luz)" />
                  <text x={x + c / 2} y={y + c / 2 + 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={n > 4 && n <= 16 ? "#0b0b0b" : "#ffffff"}>{lista.length}</text>
                </g>
              )}
            </g>
          );
        }))}
        {[1, 2, 3, 4, 5].map((s, i) => <text key={s} x={L + i * c + c / 2} y={Y + A + 12} textAnchor="middle" fontSize={10} className="fill-current opacity-70">{s}</text>)}
        {[5, 4, 3, 2, 1].map((p, i) => <text key={p} x={L - 7} y={Y + i * c + c / 2 + 4} textAnchor="end" fontSize={10} className="fill-current opacity-70">{p}</text>)}
        <text x={L} y={Y + A + 25} fontSize={8.5} className="fill-current opacity-60">Insignificante</text>
        <text x={L + A} y={Y + A + 25} textAnchor="end" fontSize={8.5} className="fill-current opacity-60">Catastrófica</text>
        <text x={L + A / 2} y={Y + A + 39} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-current">Severidad →</text>
        <g transform={`translate(12 ${Y + A / 2}) rotate(-90)`}>
          <text textAnchor="middle" fontSize={11} fontWeight={700} className="fill-current">Probabilidad →</text>
        </g>
        <g transform={`translate(25 ${Y + A}) rotate(-90)`}><text fontSize={8.5} className="fill-current opacity-60">Rara vez</text></g>
        <g transform={`translate(25 ${Y}) rotate(-90)`}><text textAnchor="end" fontSize={8.5} className="fill-current opacity-60">Casi seguro</text></g>
      </svg>
      <figcaption className={cn("mt-0.5 text-xs text-muted-foreground", impreso && "text-[12px] text-doc-tenue")}>Letra de cada celda: B bajo · M medio · A alto · C crítico.</figcaption>
    </figure>
  );
}

// Una ficha por grupo: cuántos riesgos y cómo se reparten por nivel (Cesar: «cada riesgo debe tener sus gráficas»)
export function FichasGrupo({ filas, impreso, className }: Base) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", impreso && "grid-cols-3 gap-2", className)}>
      {GRUPOS.map(([g]) => {
        const del = filas.filter((f) => f.grupo === g);
        const max = del.map(nivelFila).reduce<ReturnType<typeof nivelFila>>((a, n) => (n && (!a || n.n > a.n) ? n : a), null);
        return (
          <div key={g} className={cn("rounded-xl border p-3 shadow-[0_6px_18px_-12px_rgba(15,40,60,.45)]", impreso && "rounded-lg border-doc-linea p-2 shadow-none", !del.length && "opacity-60")}>
            <div className="flex items-center gap-2">
              <Letra g={g} chico={impreso} />
              <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", impreso && "text-[12px]")}>{CORTO(g)}</span>
              <span className={cn("font-cifra text-lg font-semibold tabular-nums", impreso && "text-[12px]")}>{del.length}</span>
            </div>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted shadow-[inset_0_1px_2px_rgba(0,0,0,.18)]" aria-hidden>
              {NIVELES.map((t) => {
                const n = del.filter((f) => nivelFila(f)?.texto === t).length;
                return n ? <span key={t} title={`${t}: ${n}`} style={{ width: `${(n / del.length) * 100}%`, background: `linear-gradient(180deg, rgba(255,255,255,.35), rgba(0,0,0,.08)), ${COLOR_NIVEL[t]}` }} className="border-r-2 border-card last:border-r-0" /> : null;
              })}
            </div>
            <div className={cn("mt-1 text-[11px] text-muted-foreground", impreso && "text-[10px] text-doc-tenue")}>
              {del.length ? `Máximo: ${max?.texto ?? "sin valorar"} · ${del.slice(0, 2).map((f) => f.agente).join(", ")}${del.length > 2 ? "…" : ""}` : "No presente"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { claveRiesgo };
