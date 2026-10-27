"use client";

import { useState } from "react";
import { ChevronDown, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { imc, type MedicionSignos, partirTa, type SignosVitales } from "@/lib/consultas-tipos";
import { cn } from "@/lib/utils";

// Evolución de TA, FC, peso e IMC: consultas anteriores + lo que se está escribiendo en esta.
// Minigráficos en SVG propio (sin librería): banda verde = rango normal, punto rojo = fuera de rango.

type Punto = { fecha: string; v: number; v2?: number; actual: boolean };
type Serie = { clave: string; titulo: string; unidad: string; puntos: Punto[]; rango?: [number, number]; rango2?: [number, number]; decimales?: number };

const num = (x?: string) => {
  const n = Number(String(x ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};
const fechaCorta = (f: string) => f.split("-").reverse().join("/");
const mesAnio = (f: string) => { const [a, m] = f.split("-"); return `${m}/${a}`; };
const fuera = (v: number, r?: [number, number]) => Boolean(r && (v < r[0] || v > r[1]));

function series(previas: MedicionSignos[], actual: SignosVitales, hoy: string): Serie[] {
  const todas = [...previas.map((m) => ({ ...m, actual: false })), { fecha: hoy, signos: actual, actual: true }];
  const de = (f: (s: SignosVitales) => number | null) =>
    todas.flatMap((m) => { const v = f(m.signos); return v === null ? [] : [{ fecha: m.fecha, v, actual: m.actual }]; });
  const ta = todas.flatMap((m) => { const t = partirTa(m.signos.ta); return t ? [{ fecha: m.fecha, v: t[0], v2: t[1], actual: m.actual }] : []; });
  // Peso saludable según la última talla conocida (IMC 18,5–24,9)
  const talla = [...todas].reverse().map((m) => num(m.signos.talla)).find((t) => t !== null) ?? null;
  const tm = talla ? (talla > 3 ? talla / 100 : talla) : null;
  return [
    { clave: "ta", titulo: "Tensión arterial", unidad: "mmHg", puntos: ta, rango: [90, 139], rango2: [60, 89] },
    { clave: "fc", titulo: "Frecuencia cardíaca", unidad: "lpm", puntos: de((s) => num(s.fc)), rango: [60, 100] },
    { clave: "peso", titulo: "Peso", unidad: "kg", puntos: de((s) => num(s.peso)), rango: tm ? [Math.round(18.5 * tm * tm), Math.round(24.9 * tm * tm)] : undefined, decimales: 1 },
    { clave: "imc", titulo: "IMC", unidad: "kg/m²", puntos: de((s) => imc(s.peso, s.talla)), rango: [18.5, 24.9], decimales: 1 },
  ];
}

const formato = (s: Serie, p: Punto) => (s.clave === "ta" ? `${p.v}/${p.v2}` : p.v.toLocaleString("es-VE", { maximumFractionDigits: s.decimales ?? 0 }));

// Variación mínima visible por serie (TA y FC en unidades, peso en kg, IMC en puntos)
const MARGEN: Record<string, number> = { ta: 20, fc: 12, peso: 4, imc: 1.5 };

function Grafico({ s }: { s: Serie }) {
  const W = 120, H = 36, M = 3;
  const valores = s.puntos.flatMap((p) => [p.v, p.v2 ?? p.v]);
  // Escala según los datos (con un margen mínimo para que un cambio pequeño no parezca enorme); la banda se recorta
  const min = Math.min(...valores), max = Math.max(...valores);
  const margen = Math.max((max - min) * 0.2, (MARGEN[s.clave] ?? 2) / 2);
  const lo = min - margen, hi = max + margen;
  const y = (v: number) => Math.min(H, Math.max(0, H - M - ((v - lo) / (hi - lo || 1)) * (H - 2 * M)));
  const x = (i: number) => (s.puntos.length === 1 ? W / 2 : M + (i / (s.puntos.length - 1)) * (W - 2 * M));
  const linea = (f: (p: Punto) => number) => s.puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join(" ");
  const ultimo = s.puntos.length - 1;
  const malo = (p: Punto) => fuera(p.v, s.rango) || (p.v2 !== undefined && fuera(p.v2, s.rango2));
  const fin = s.puntos[ultimo];
  return (
    <div className="relative h-9">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full overflow-visible" aria-hidden>
      {s.rango && <rect x={0} width={W} y={y(s.rango[1])} height={Math.max(0, y(s.rango[0]) - y(s.rango[1]))} className="fill-ok/10" />}
      {s.rango2 && <rect x={0} width={W} y={y(s.rango2[1])} height={Math.max(0, y(s.rango2[0]) - y(s.rango2[1]))} className="fill-ok/10" />}
      <path d={linea((p) => p.v)} vectorEffect="non-scaling-stroke" className="fill-none stroke-primary" strokeWidth={1.5} strokeLinejoin="round" />
      {s.clave === "ta" && <path d={linea((p) => p.v2 ?? p.v)} vectorEffect="non-scaling-stroke" className="fill-none stroke-primary/50" strokeWidth={1.5} strokeLinejoin="round" />}
      {s.puntos.map((p, i) => (
        <g key={i}>
          <title>{`${fechaCorta(p.fecha)}${p.actual ? " (esta consulta)" : ""}: ${formato(s, p)} ${s.unidad}`}</title>
          {/* área invisible para el tooltip */}
          <circle cx={x(i)} cy={y(p.v)} r={6} className="fill-transparent" />
        </g>
      ))}
    </svg>
      {/* El último punto va en HTML: con preserveAspectRatio="none" un círculo SVG saldría ovalado */}
      <span
        aria-hidden
        className={cn("pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card", malo(fin) ? "bg-alerta" : "bg-primary")}
        style={{ left: `${(x(ultimo) / W) * 100}%`, top: `${(y(fin.v) / H) * 100}%` }}
      />
    </div>
  );
}

function Tarjeta({ s }: { s: Serie }) {
  const n = s.puntos.length;
  const ult = s.puntos[n - 1];
  const ant = n > 1 ? s.puntos[n - 2] : null;
  const malo = ult && (fuera(ult.v, s.rango) || (ult.v2 !== undefined && fuera(ult.v2, s.rango2)));
  const delta = ult && ant ? ult.v - ant.v : 0;
  const Flecha = !ant || Math.abs(delta) < (s.clave === "imc" ? 0.3 : 1) ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const lectura = ult
    ? `${s.titulo} ${formato(s, ult)} ${s.unidad}${ant ? `, ${delta > 0 ? "sube" : delta < 0 ? "baja" : "igual"} desde ${formato(s, ant)}` : ""}${malo ? ", fuera del rango normal" : ""}`
    : `${s.titulo}: sin mediciones`;
  return (
    <div role="group" aria-label={lectura} className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{s.titulo}</p>
      {ult ? (
        <>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className={cn("text-2xl font-semibold tabular-nums", malo && "text-alerta-texto")}>{formato(s, ult)}</span>
            <span className="text-xs text-muted-foreground">{s.unidad}</span>
            {ant && <Flecha className={cn("ml-auto size-4", malo ? "text-alerta-texto" : "text-muted-foreground")} />}
          </div>
          {n > 1 ? <Grafico s={s} /> : <div className="h-9" />}
          <p className="text-xs text-muted-foreground">
            {n > 1 ? `${n} mediciones · desde ${mesAnio(s.puntos[0].fecha)}` : "Primera medición"}
            {s.rango && <> · normal {s.clave === "ta" ? "<140/90" : `${s.rango[0].toLocaleString("es-VE")}–${s.rango[1].toLocaleString("es-VE")}`}</>}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Sin mediciones</p>
      )}
    </div>
  );
}

export function Evolucion({ previas, actual, hoy }: { previas: MedicionSignos[]; actual: SignosVitales; hoy: string }) {
  const ss = series(previas, actual, hoy);
  const maximo = Math.max(...ss.map((s) => s.puntos.length));
  const [abierto, setAbierto] = useState(maximo >= 2);
  if (!previas.length) return null;
  return (
    <section className="rounded-xl border bg-muted/20">
      <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="font-medium">Evolución</span>
        <span className="text-xs text-muted-foreground">{previas.length} consulta{previas.length === 1 ? "" : "s"} anterior{previas.length === 1 ? "" : "es"} + esta</span>
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          {ss.map((s) => <Tarjeta key={s.clave} s={s} />)}
        </div>
      )}
    </section>
  );
}
