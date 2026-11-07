"use client";

// Cuestionario por pantallas (Cesar, 06-nov): una sección por pantalla, botones grandes de un clic, barra de avance y
// sin seguir mientras falte una respuesta. Sin red ni estado propio de datos: lo usan el analista dentro de la app
// (identificación de riesgos) y el trabajador desde su teléfono (encuesta psicosocial por enlace).
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Valor = string | number;
export type OpcionPantalla = { valor: Valor; texto: string; tono?: "alerta" | "ok" | "neutro" };
export type PreguntaPantalla = { id: string; texto: string; nota?: string; opciones: OpcionPantalla[] };
export type SeccionPantalla = { id: string; titulo: string; ayuda?: string; marca?: React.ReactNode; preguntas: PreguntaPantalla[] };

type Props = {
  secciones: SeccionPantalla[];
  respuestas: Record<string, Valor | undefined>;
  onResponder: (id: string, valor: Valor) => void;
  // "seccion": toda la sección en una pantalla (analista). "pregunta": una por pantalla que avanza sola al tocar
  // (encuesta del trabajador; la completa el hilo de la encuesta psicosocial sobre este mismo archivo).
  modo?: "pregunta" | "seccion";
  // Ranura bajo cada pregunta (p. ej. fotos de lo que se ve)
  extra?: (preguntaId: string) => React.ReactNode;
  editable?: boolean;
  // Botón para responder de una vez lo que falta de la sección (p. ej. «Lo demás: No»)
  atajo?: { valor: Valor; texto: string };
  onAtajo?: (seccion: SeccionPantalla) => void;
  // Última pantalla: botón que termina (enviar, pasar al siguiente puesto…) y, si hace falta, un bloque de revisión
  alTerminar?: () => void;
  textoTerminar?: string;
  final?: React.ReactNode;
  inicio?: number;
  className?: string;
};

const COLUMNAS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4", 5: "grid-cols-2 sm:grid-cols-5" };
const TONO = {
  alerta: "border-alerta bg-alerta text-white shadow-[0_6px_14px_-8px_var(--alerta)]",
  ok: "border-ok bg-ok text-white shadow-[0_6px_14px_-8px_var(--ok)]",
  neutro: "border-primary bg-primary text-primary-foreground shadow-[0_6px_14px_-8px_var(--primary)]",
};

export function Pantallas({ secciones, respuestas, onResponder, editable = true, atajo, onAtajo, alTerminar, textoTerminar = "Terminar", final, inicio, className, extra }: Props) {
  const falta = (s: SeccionPantalla) => s.preguntas.filter((q) => respuestas[q.id] === undefined).length;
  const primera = Math.max(0, secciones.findIndex((s) => falta(s) > 0));
  const [i, setI] = useState(inicio ?? primera);
  const arriba = useRef<HTMLDivElement>(null);
  const seccion = secciones[Math.min(i, secciones.length - 1)];
  useEffect(() => { if (i >= secciones.length) setI(Math.max(0, secciones.length - 1)); }, [i, secciones.length]);
  if (!seccion) return null;
  const total = secciones.reduce((a, s) => a + s.preguntas.length, 0);
  const hechas = total - secciones.reduce((a, s) => a + falta(s), 0);
  const pendientes = falta(seccion);
  const ultima = i === secciones.length - 1;
  const ir = (n: number) => { setI(n); arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div ref={arriba} className={cn("scroll-mt-28 space-y-4", className)}>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Sección {i + 1} de {secciones.length}</span>
          <span className="font-cifra">{hechas}/{total} respondidas</span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {secciones.map((s, n) => (
            <button key={s.id} type="button" tabIndex={-1} onClick={() => (n <= i || secciones.slice(0, n).every((x) => !falta(x)) ? ir(n) : undefined)}
              className={cn("h-1.5 flex-1 rounded-full transition", n === i ? "bg-primary" : !falta(s) ? "bg-primary/40" : "bg-muted")} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {seccion.marca}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight tracking-tight">{seccion.titulo}</h3>
          {seccion.ayuda && <p className="text-sm text-muted-foreground">{seccion.ayuda}</p>}
        </div>
      </div>

      <ol className="space-y-3">
        {seccion.preguntas.map((q, n) => {
          const v = respuestas[q.id];
          return (
            <li key={q.id} className={cn("rounded-2xl border bg-card p-4 transition", v === undefined ? "border-aviso/50 shadow-[0_8px_20px_-16px_rgba(0,0,0,.4)]" : "opacity-95")}>
              <div className="flex gap-2">
                <span className="font-cifra text-sm text-muted-foreground">{n + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{q.texto}</p>
                  {q.nota && <p className="mt-0.5 text-xs text-muted-foreground">{q.nota}</p>}
                </div>
                {v !== undefined && <Check className="size-5 shrink-0 text-ok-texto" aria-label="Respondida" />}
              </div>
              <div className={cn("mt-3 grid gap-2", COLUMNAS[Math.min(q.opciones.length, 5)])} role="radiogroup" aria-label={q.texto}>
                {q.opciones.map((o) => (
                  <button key={String(o.valor)} type="button" role="radio" aria-checked={v === o.valor} disabled={!editable} onClick={() => onResponder(q.id, o.valor)}
                    className={cn("min-h-12 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition active:scale-[.98] disabled:cursor-default",
                      v === o.valor ? TONO[o.tono ?? "neutro"] : "hover:border-primary/60 hover:bg-muted/50")}>
                    {o.texto}
                  </button>
                ))}
              </div>
              {extra?.(q.id)}
            </li>
          );
        })}
      </ol>

      {editable && atajo && onAtajo && pendientes > 0 && (
        <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => onAtajo(seccion)}>{atajo.texto}</Button></div>
      )}

      {ultima && !pendientes && final}

      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={i === 0} onClick={() => ir(i - 1)}><ArrowLeft /> Anterior</Button>
        <span className="hidden flex-1 text-center text-xs text-muted-foreground sm:block">{pendientes ? `Faltan ${pendientes} en esta sección` : "Sección completa"}</span>
        {!ultima ? (
          <Button className="ml-auto" disabled={pendientes > 0} onClick={() => ir(i + 1)}>Siguiente sección <ArrowRight /></Button>
        ) : alTerminar ? (
          <Button className="ml-auto" disabled={pendientes > 0} onClick={alTerminar}>{textoTerminar} <ArrowRight /></Button>
        ) : null}
      </div>
    </div>
  );
}
