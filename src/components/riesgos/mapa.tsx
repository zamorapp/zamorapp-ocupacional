// Mapa de riesgos: plano (foto o dibujo de la planta) o croquis cuadriculado, con un símbolo por riesgo (letra del
// grupo + número de la tabla) y el anillo del color de su nivel. Sin estado: sirve en el asistente y en el informe.
import { NOMBRE_GRUPO, nivelFila, SIMBOLO, type FilaRiesgo, type Mapa } from "@/lib/riesgos-puesto";
import { cn } from "@/lib/utils";

type Props = {
  mapa: Mapa;
  filas: FilaRiesgo[];
  planoUrl?: string | null;
  impreso?: boolean;
  resaltar?: string | null; // fila elegida para ubicar
  onTocar?: (x: number, y: number) => void; // clic en el plano (en %)
  onTocarMarca?: (id: string) => void;
  onTocarArea?: (id: string) => void;
  className?: string;
};

const ANILLO: Record<string, string> = { Bajo: "#0ca30c", Medio: "#fab219", Alto: "#ec835a", Crítico: "#d03b3b" };

export function MapaRiesgos({ mapa, filas, planoUrl, impreso, resaltar, onTocar, onTocarMarca, onTocarArea, className }: Props) {
  const numero = new Map(filas.map((f, i) => [f.id, i + 1]));
  const porId = new Map(filas.map((f) => [f.id, f]));
  return (
    <div
      className={cn(
        "relative w-full select-none overflow-hidden rounded-xl border bg-white",
        planoUrl ? "" : "aspect-[16/10]",
        onTocar && "cursor-crosshair",
        impreso && "rounded-md border-doc-linea",
        className,
      )}
      style={planoUrl ? undefined : {
        backgroundImage: "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
        backgroundSize: "5% 8%",
      }}
      onClick={onTocar ? (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onTocar(Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10);
      } : undefined}
      role={onTocar ? "application" : "img"}
      aria-label={`Mapa de riesgos con ${mapa.marcas.length} símbolos`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {planoUrl && <img src={planoUrl} alt="Plano del área" className="block w-full" draggable={false} />}
      {mapa.areas.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={!onTocarArea}
          onClick={onTocarArea ? (e) => { e.stopPropagation(); onTocarArea(a.id); } : undefined}
          className={cn("absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-white/85 px-1.5 py-0.5 font-bold uppercase tracking-wide text-neutral-700 shadow-sm ring-1 ring-neutral-300 disabled:cursor-default", impreso ? "text-[8px]" : "text-[11px]")}
          style={{ left: `${a.x}%`, top: `${a.y}%` }}
          title={onTocarArea ? "Quitar este nombre" : undefined}
        >
          {a.texto}
        </button>
      ))}
      {mapa.marcas.map((m) => {
        const f = porId.get(m.filaId);
        if (!f) return null;
        const s = SIMBOLO[f.grupo];
        const nivel = nivelFila(f);
        return (
          <button
            key={m.id}
            type="button"
            disabled={!onTocarMarca}
            onClick={onTocarMarca ? (e) => { e.stopPropagation(); onTocarMarca(m.id); } : undefined}
            className={cn(
              "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-bold disabled:cursor-default",
              impreso ? "size-5 text-[9px]" : "size-8 text-[13px] transition-transform hover:scale-110",
              resaltar === f.id && "ring-4 ring-primary/60",
            )}
            style={{
              left: `${m.x}%`, top: `${m.y}%`, background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.55), transparent 55%), ${s.color}`,
              color: s.texto, boxShadow: `0 0 0 ${impreso ? 2 : 3}px ${nivel ? ANILLO[nivel.texto] : "#9ca3af"}, 0 3px 6px rgba(0,0,0,.35)`,
            }}
            title={`${numero.get(f.id)}. ${NOMBRE_GRUPO[f.grupo]} · ${f.agente} · ${f.puesto}${nivel ? ` · ${nivel.texto}` : ""}${onTocarMarca ? " (toca para quitar)" : ""}`}
            aria-label={`Riesgo ${numero.get(f.id)}: ${f.agente}`}
          >
            {s.letra}
            <span className={cn("absolute -right-1.5 -top-1.5 grid place-items-center rounded-full bg-neutral-900 font-cifra text-white", impreso ? "h-3 min-w-3 px-0.5 text-[7px]" : "h-4 min-w-4 px-1 text-[10px]")}>{numero.get(f.id)}</span>
          </button>
        );
      })}
    </div>
  );
}

// Leyenda del mapa: los seis grupos y los cuatro niveles (anillo)
export function LeyendaMapa({ impreso }: { impreso?: boolean }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", impreso && "text-[8.5px] text-doc-tenue")}>
      {Object.entries(SIMBOLO).map(([g, s]) => (
        <span key={g} className="inline-flex items-center gap-1">
          <span className={cn("inline-grid place-items-center rounded-full font-bold", impreso ? "size-3.5 text-[7px]" : "size-4 text-[9px]")} style={{ background: s.color, color: s.texto }}>{s.letra}</span>
          {NOMBRE_GRUPO[g as keyof typeof NOMBRE_GRUPO]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">Anillo:
        {Object.entries(ANILLO).map(([t, c]) => <span key={t} className="inline-flex items-center gap-0.5"><span className="size-2.5 rounded-full border-2" style={{ borderColor: c }} />{t}</span>)}
      </span>
    </div>
  );
}
