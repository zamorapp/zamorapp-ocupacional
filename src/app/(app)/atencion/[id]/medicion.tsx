"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ARTICULACIONES, estadoFila, FUENTE_ESPIROMETRIA, FUENTE_GONIOMETRIA, interpretarEspiro, relacionCalculada,
  type FilaGonio, type Lado, type Medicion, type TipoMedicion, type ValoresEspiro,
} from "@/lib/mediciones";

// Valores de goniometría o espirometría de un paraclínico. Todo es opcional: lo que se deja en blanco no se guarda
// ni cuenta como faltante. El resumen (texto y color) lo arma lib/mediciones al cambiar cualquier valor.
type Props = { tipo: TipoMedicion; medicion: Medicion | undefined; editable: boolean; onChange: (m: Medicion) => void };

const BORDE: Record<"normal" | "fuera" | "alterado", string> = {
  normal: "border-ok/60 bg-ok/5",
  fuera: "border-aviso bg-aviso/10",
  alterado: "border-alerta bg-alerta/10",
};
const TEXTO: Record<"normal" | "fuera" | "alterado", string> = { normal: "text-ok-texto", fuera: "text-aviso-texto", alterado: "text-alerta-texto" };

const leer = (v: string) => {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined; // undefined = no es número: no se acepta la tecla
};
const ver = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export function PanelMedicion(props: Props) {
  return props.tipo === "goniometria" ? <Goniometria {...props} /> : <Espirometria {...props} />;
}

function Nota({ valor, editable, onChange, ejemplo }: { valor: string; editable: boolean; onChange: (v: string) => void; ejemplo: string }) {
  return (
    <input
      value={valor}
      disabled={!editable}
      maxLength={300}
      placeholder={`Nota: ${ejemplo}`}
      aria-label="Nota"
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
    />
  );
}

// ── Goniometría ──
function Goniometria({ medicion, editable, onChange }: Props) {
  const med = medicion?.tipo === "goniometria" ? medicion : { tipo: "goniometria" as const, filas: [] as FilaGonio[], nota: "" };
  const conDatos = new Set(med.filas.map((f) => f.clave.split(".")[0]));
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(conDatos.size ? conDatos : ["hombro"]));
  const valor = (clave: string, lado: Lado) => med.filas.find((f) => f.clave === clave && f.lado === lado);

  const poner = (clave: string, lado: Lado, normal: number, texto: string) => {
    const n = leer(texto);
    if (n === undefined || (n !== null && n > 360)) return;
    const resto = med.filas.filter((f) => !(f.clave === clave && f.lado === lado));
    onChange({ ...med, filas: n === null ? resto : [...resto, { clave, lado, grados: n, normal }] });
  };
  const alternar = (clave: string) => setAbiertas((s) => { const x = new Set(s); if (x.has(clave)) x.delete(clave); else x.add(clave); return x; });

  return (
    <div className="@container grid grid-cols-1 gap-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Articulaciones">
        {ARTICULACIONES.map((a) => {
          const abierta = abiertas.has(a.clave);
          const n = med.filas.filter((f) => f.clave.startsWith(`${a.clave}.`)).length;
          return (
            <button
              key={a.clave}
              type="button"
              aria-pressed={abierta}
              onClick={() => alternar(a.clave)}
              className={cn("rounded-full border px-3 py-1 text-xs transition", abierta ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50")}
            >
              {a.nombre}{n > 0 && <span className={cn("ml-1 font-semibold", !abierta && "text-primary")}>· {n}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        {ARTICULACIONES.filter((a) => abiertas.has(a.clave)).map((a) => (
          <div key={a.clave} className="overflow-hidden rounded-lg border bg-card">
            <div className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.5rem_4.5rem] sm:grid-cols-[minmax(0,1fr)_3.5rem_5.5rem_5.5rem] items-center gap-x-2 bg-muted px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <span>{a.nombre}</span><span className="text-right">Normal</span><span className="text-center">Der.</span><span className="text-center">Izq.</span>
            </div>
            {a.movimientos.map((mv) => (
              <div key={mv.clave} className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.5rem_4.5rem] sm:grid-cols-[minmax(0,1fr)_3.5rem_5.5rem_5.5rem] items-center gap-x-2 border-t px-3 py-1.5">
                <span className="text-sm leading-tight">{mv.nombre}</span>
                <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">{mv.deficit ? "0°" : `${mv.normal}°`}</span>
                {(mv.lados ? (["D", "I"] as const) : (["U"] as const)).map((lado) => {
                  const f = valor(mv.clave, lado);
                  const e = f ? estadoFila(f) : null;
                  return (
                    <div key={lado} className={cn("grid gap-0.5", lado === "U" && "col-span-2")}>
                    <label
                      className={cn(
                        "flex h-8 items-center overflow-hidden rounded-md border bg-card focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20",
                        e ? BORDE[e.estado] : "border-input",
                      )}
                      title={e?.pct != null ? `${e.pct} % de lo normal` : undefined}
                    >
                      <input
                        value={ver(f?.grados)}
                        disabled={!editable}
                        inputMode="numeric"
                        placeholder="—"
                        aria-label={`${a.nombre}, ${mv.nombre}${lado === "U" ? "" : lado === "D" ? ", derecho" : ", izquierdo"}, grados`}
                        onChange={(ev) => poner(mv.clave, lado, mv.normal, ev.target.value)}
                        className="w-full min-w-0 bg-transparent px-2 text-right font-mono text-sm tabular-nums outline-none disabled:opacity-60"
                      />
                      <span className={cn("pr-1.5 text-xs", e ? TEXTO[e.estado] : "text-muted-foreground")}>°</span>
                    </label>
                    {/* El estado también en texto, no solo por el color del borde */}
                    {e && (
                      <span className={cn("text-center text-[10px] leading-none font-semibold", TEXTO[e.estado])}>
                        {e.estado === "normal" ? "✓" : `${e.estado === "fuera" ? "Leve" : "Marcada"}${e.pct !== null ? ` ${e.pct} %` : ""}`}
                      </span>
                    )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      {abiertas.size === 0 && <p className="text-sm text-muted-foreground">Toca la articulación que mediste. Solo se guarda lo que escribas.</p>}
      <Nota valor={med.nota ?? ""} editable={editable} ejemplo="dolor, colaboración, lado dominante…" onChange={(nota) => onChange({ ...med, nota })} />
      <p className="text-xs text-muted-foreground">{FUENTE_GONIOMETRIA}</p>
    </div>
  );
}

// ── Espirometría ──
const CAMPOS: { clave: keyof ValoresEspiro; nombre: string; unidad: string; max: number }[] = [
  { clave: "fvc", nombre: "FVC", unidad: "L", max: 12 },
  { clave: "fvcPct", nombre: "FVC del previsto", unidad: "%", max: 250 },
  { clave: "fev1", nombre: "FEV1", unidad: "L", max: 12 },
  { clave: "fev1Pct", nombre: "FEV1 del previsto", unidad: "%", max: 250 },
  { clave: "relacion", nombre: "FEV1/FVC", unidad: "%", max: 100 },
  { clave: "pef", nombre: "PEF (opcional)", unidad: "L/s", max: 25 },
];
const VACIO: ValoresEspiro = { fvc: null, fvcPct: null, fev1: null, fev1Pct: null, relacion: null, pef: null };

function Espirometria({ medicion, editable, onChange }: Props) {
  const med = medicion?.tipo === "espirometria" ? medicion : { tipo: "espirometria" as const, valores: VACIO, nota: "" };
  const v = med.valores;
  // Los decimales a medio escribir («3,») se guardan como texto mientras se tipean
  const [borrador, setBorrador] = useState<Partial<Record<keyof ValoresEspiro, string>>>({});
  const calculada = relacionCalculada(v);
  const i = interpretarEspiro(v);

  const poner = (clave: keyof ValoresEspiro, max: number, texto: string) => {
    const n = leer(texto);
    if (n === undefined || (n !== null && n > max)) return;
    setBorrador((b) => ({ ...b, [clave]: texto }));
    onChange({ ...med, valores: { ...v, [clave]: n } });
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CAMPOS.map((c) => (
          <label key={c.clave} className="grid gap-1 text-xs text-muted-foreground">
            <span>{c.clave === "relacion" && v.relacion === null ? "FEV1/FVC (calculado)" : c.nombre}</span>
            <span className="flex h-9 items-center overflow-hidden rounded-md border border-input bg-card focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20">
              <input
                value={borrador[c.clave] ?? ver(v[c.clave])}
                disabled={!editable}
                inputMode="decimal"
                placeholder={c.clave === "relacion" && calculada !== null ? ver(calculada) : "—"}
                aria-label={`${c.nombre} en ${c.unidad}`}
                onChange={(e) => poner(c.clave, c.max, e.target.value)}
                onBlur={() => setBorrador((b) => ({ ...b, [c.clave]: undefined }))}
                className="w-full min-w-0 bg-transparent px-2 text-right font-mono text-sm text-foreground tabular-nums outline-none disabled:opacity-60"
              />
              <span className="pr-2 whitespace-nowrap">{c.unidad}</span>
            </span>
          </label>
        ))}
      </div>
      {i.estado ? (
        <div className={cn("rounded-lg border px-3 py-2 text-sm font-medium", BORDE[i.estado], TEXTO[i.estado])} role="status">
          {i.patron}{i.gravedad ? ` ${i.gravedad}` : ""}
          {v.relacion === null && calculada !== null && <span className="ml-1 font-normal text-muted-foreground">· FEV1/FVC calculado: {ver(calculada)} %</span>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Escribe al menos FVC y FEV1 (o sus % del previsto) para ver la interpretación.</p>
      )}
      <Nota valor={med.nota ?? ""} editable={editable} ejemplo="técnica, colaboración, broncodilatador…" onChange={(nota) => onChange({ ...med, nota })} />
      <p className="text-xs text-muted-foreground">{FUENTE_ESPIROMETRIA}</p>
    </div>
  );
}
