"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, GanttChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CarrilTiempo, MarcaTiempo } from "@/lib/linea-tiempo";

// Línea de tiempo del trabajador (vista previa aprobada por Cesar, 14-nov): toda su historia ocupacional en una franja.
// Cada marca tiene FORMA y PALABRA además del color (se lee en gris). Solo fecha, tipo y resultado: nada clínico.

const CARRILES: { id: CarrilTiempo; nombre: string }[] = [
  { id: "examen", nombre: "Exámenes" },
  { id: "reposo", nombre: "Reposos" },
  { id: "accidente", nombre: "Accidentes" },
  { id: "consulta", nombre: "Consultas" },
];
const COLOR = { ok: "bg-ok", aviso: "bg-aviso", alerta: "bg-alerta" } as const;
// Forma por carril: examen círculo, consulta punto pequeño, accidente triángulo (con clip-path)
const FORMA: Record<Exclude<CarrilTiempo, "reposo">, string> = {
  examen: "size-4 rounded-full ring-2 ring-card",
  consulta: "size-2.5 rounded-full bg-muted-foreground",
  accidente: "size-4 [clip-path:polygon(50%_0,100%_100%,0_100%)]",
};
const DIA = 864e5;
const t = (iso: string) => Date.parse(iso + "T12:00:00Z");
const fecha = (iso: string) => iso.split("-").reverse().join("/");

// Rango: 1 año, 3 años o todo (desde la primera marca; no desde el ingreso, que puede dejar años vacíos)
const RANGOS = [["1", "1 año"], ["3", "3 años"], ["todo", "Todo"]] as const;
type Rango = (typeof RANGOS)[number][0];

export function LineaTiempo({ marcas, hoy }: { marcas: MarcaTiempo[]; hoy: string }) {
  const primera = marcas[0]?.fecha ?? hoy;
  const haceAnios = (n: number) => `${Number(hoy.slice(0, 4)) - n}${hoy.slice(4)}`;
  const [rango, setRango] = useState<Rango>(primera < haceAnios(1) ? "3" : "1");
  const [sel, setSel] = useState<number | null>(() => {
    const i = marcas.findLastIndex((m) => m.carril === "examen");
    return i >= 0 ? i : marcas.length ? marcas.length - 1 : null;
  });

  const desde = rango === "1" ? haceAnios(1) : rango === "3" ? haceAnios(3) : `${primera.slice(0, 4)}-01-01`;
  const fin = t(hoy) + 45 * DIA; // un margen tras «Hoy» para que la última marca no quede pegada al borde
  const pos = (iso: string) => Math.max(0, Math.min(100, ((t(iso) - t(desde)) / (fin - t(desde))) * 100));
  const anios = useMemo(() => {
    const lista: number[] = [];
    for (let y = Number(desde.slice(0, 4)) + (desde.endsWith("-01-01") ? 0 : 1); y <= Number(hoy.slice(0, 4)); y++) lista.push(y);
    return lista;
  }, [desde, hoy]);
  const visibles = marcas.map((m, i) => ({ m, i })).filter(({ m }) => (m.hasta ?? m.fecha) >= desde);
  const carriles = CARRILES.filter((c) => marcas.some((m) => m.carril === c.id));
  const elegida = sel !== null ? marcas[sel] : null;
  // En el celular la franja se desliza: que abra mostrando lo más reciente (a la derecha)
  const franja = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = franja.current; if (f) f.scrollLeft = f.scrollWidth; }, [rango]);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle className="flex items-center gap-2 text-base"><GanttChart className="size-4 text-primary" aria-hidden /> Línea de tiempo</CardTitle>
        {marcas.length > 0 && (
          <div className="ml-auto flex gap-1" role="group" aria-label="Período">
            {RANGOS.map(([k, txt]) => (
              <button key={k} type="button" aria-pressed={rango === k} onClick={() => { setRango(k); setSel(null); }}
                className={cn("rounded-md border px-3 text-sm transition max-sm:min-h-11 sm:py-1", rango === k ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted")}>{txt}</button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {marcas.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Aún no hay exámenes, reposos ni accidentes registrados. Aparecerán aquí a medida que se carguen.</p>
        ) : (
          <>
            <div ref={franja} className="overflow-x-auto pb-1">
              <div className="grid min-w-[640px] grid-cols-[96px_1fr] gap-y-1.5">
                <div />
                <div className="relative h-5">
                  {anios.map((y) => <span key={y} className="absolute -translate-x-1/2 font-mono text-[11px] text-muted-foreground" style={{ left: `${pos(`${y}-01-01`)}%` }}>{y}</span>)}
                  <span className="absolute -translate-x-full pr-1 text-[11px] font-semibold text-primary" style={{ left: `${pos(hoy)}%` }}>Hoy</span>
                </div>
                {carriles.map((c) => (
                  <Carril key={c.id} nombre={c.nombre} hoy={c.id === carriles[0].id ? pos(hoy) : null} anios={anios.map((y) => pos(`${y}-01-01`))}>
                    {visibles.filter(({ m }) => m.carril === c.id).map(({ m, i }) => {
                      const etiqueta = `${m.titulo}, ${fecha(m.fecha)}: ${m.resultado}`;
                      if (m.carril === "reposo") {
                        const a = pos(m.fecha), b = pos(m.hasta ?? m.fecha);
                        return (
                          <button key={i} type="button" aria-pressed={sel === i} aria-label={etiqueta} title={etiqueta} onClick={() => setSel(i)}
                            className={cn("absolute top-1.5 h-6 overflow-hidden whitespace-nowrap rounded bg-aviso/70 px-1.5 text-left text-[11px] font-semibold text-foreground", sel === i && "outline-2 outline-offset-2 outline-foreground")}
                            style={{ left: `${a}%`, width: `max(${b - a}%, 1.75rem)` }}>
                            {m.titulo.replace(/^Reposo de (\d+) días?$/, "$1 d")}
                          </button>
                        );
                      }
                      return (
                        <button key={i} type="button" aria-pressed={sel === i} aria-label={etiqueta} title={etiqueta} onClick={() => setSel(i)}
                          className="absolute top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
                          style={{ left: `${pos(m.fecha)}%` }}>
                          <span className={cn("block", FORMA[m.carril], m.carril !== "consulta" && COLOR[m.nivel], m.carril === "examen" && m.nivel !== "ok" && "rotate-45 rounded-[3px]", sel === i && "outline-2 outline-offset-2 outline-foreground")} />
                        </button>
                      );
                    })}
                  </Carril>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ok" /> Examen sin restricción</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rotate-45 rounded-[2px] bg-aviso" /> Con restricciones o pendiente</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-aviso/70" /> Reposo</span>
              <span className="flex items-center gap-1.5"><span className="size-3 bg-aviso [clip-path:polygon(50%_0,100%_100%,0_100%)]" /> Accidente (rojo si fue grave)</span>
            </div>
            <div aria-live="polite" className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
              {elegida ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium">{elegida.titulo}</span>
                  <span className="font-mono text-xs">{fecha(elegida.fecha)}{elegida.hasta && elegida.hasta !== elegida.fecha ? ` al ${fecha(elegida.hasta)}` : ""}</span>
                  <span className="text-muted-foreground">{elegida.resultado}</span>
                  {elegida.href && <Link href={elegida.href} className="ml-auto flex min-h-11 items-center gap-1 text-primary hover:underline sm:min-h-0">Abrir <ArrowRight className="size-3.5" /></Link>}
                </div>
              ) : <span className="text-muted-foreground">Toca una marca para ver qué pasó ese día.</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Carril({ nombre, hoy, anios, children }: { nombre: string; hoy: number | null; anios: number[]; children: React.ReactNode }) {
  return (
    <>
      <div className="flex h-9 items-center text-xs text-muted-foreground">{nombre}</div>
      <div className="relative h-9 rounded-md bg-muted/70">
        {anios.map((p) => <span key={p} className="absolute inset-y-0 border-l border-dashed border-border" style={{ left: `${p}%` }} aria-hidden />)}
        {hoy !== null && (
          <span className="absolute -inset-y-1 border-l-2 border-primary" style={{ left: `${hoy}%` }} aria-hidden />
        )}
        {children}
      </div>
    </>
  );
}
