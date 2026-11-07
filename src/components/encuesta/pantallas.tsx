"use client";

// Cuestionario por pantallas (Cesar, 06-nov): una sección por pantalla, botones grandes de un clic, barra de avance y
// sin seguir mientras falte una respuesta. Sin red ni estado propio de datos: lo usan el analista dentro de la app
// (identificación de riesgos) y el trabajador desde su teléfono (encuesta psicosocial por enlace).
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ListChecks } from "lucide-react";
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
  // (encuesta del trabajador en el teléfono, con portada por sección y revisión al final).
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

export function Pantallas(props: Props) {
  return props.modo === "pregunta" ? <PorPregunta {...props} /> : <PorSeccion {...props} />;
}

function PorSeccion({ secciones, respuestas, onResponder, editable = true, atajo, onAtajo, alTerminar, textoTerminar = "Terminar", final, inicio, className, extra }: Props) {
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

// ── Modo «pregunta» (encuesta del trabajador en el teléfono) ─────────────────────────────────────────────────────────
// Una pregunta por pantalla con botones grandes: al tocar una opción se marca y pasa sola a la siguiente. Cada
// sección abre con una portada corta (título y ayuda). Al final, una pantalla de revisión con lo respondido por
// sección (toca una para volver) y el botón de terminar. En computadora, las teclas 1 a 9 eligen la opción.
type Pos = { s: number; q: number; portada: boolean } | { fin: true };

function PorPregunta({ secciones, respuestas, onResponder, editable = true, extra, alTerminar, textoTerminar = "Enviar", final, inicio, className }: Props) {
  const total = secciones.reduce((a, s) => a + s.preguntas.length, 0);
  const hechas = secciones.reduce((a, s) => a + s.preguntas.filter((q) => respuestas[q.id] !== undefined).length, 0);
  const [pos, setPos] = useState<Pos>(() => {
    if (inicio !== undefined && secciones[inicio]) return { s: inicio, q: 0, portada: true };
    for (let s = 0; s < secciones.length; s++) {
      const q = secciones[s].preguntas.findIndex((x) => respuestas[x.id] === undefined);
      if (q >= 0) return { s, q, portada: q === 0 };
    }
    return { fin: true };
  });
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arriba = useRef<HTMLDivElement>(null);
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current); }, []);

  const mover = (p: Pos) => {
    if (espera.current) clearTimeout(espera.current);
    setPos(p);
    arriba.current?.scrollIntoView({ block: "start" });
  };
  const siguiente = (s: number, q: number): Pos => {
    if (q + 1 < secciones[s].preguntas.length) return { s, q: q + 1, portada: false };
    if (s + 1 < secciones.length) return { s: s + 1, q: 0, portada: true };
    return { fin: true };
  };
  const anterior = (p: Pos): Pos | null => {
    if ("fin" in p) { const s = secciones.length - 1; return { s, q: secciones[s].preguntas.length - 1, portada: false }; }
    if (p.portada) { if (p.s === 0) return null; const s = p.s - 1; return { s, q: secciones[s].preguntas.length - 1, portada: false }; }
    if (p.q > 0) return { s: p.s, q: p.q - 1, portada: false };
    return { s: p.s, q: 0, portada: true };
  };
  // Primera pregunta sin responder (para la revisión y para no terminar con huecos)
  const primeraFalta = (): Pos | null => {
    for (let s = 0; s < secciones.length; s++) {
      const q = secciones[s].preguntas.findIndex((x) => respuestas[x.id] === undefined);
      if (q >= 0) return { s, q, portada: false };
    }
    return null;
  };

  const elegir = (s: number, q: number, valor: Valor) => {
    onResponder(secciones[s].preguntas[q].id, valor);
    if (espera.current) clearTimeout(espera.current);
    // Breve pausa para que se vea la marca antes de pasar
    espera.current = setTimeout(() => mover(siguiente(s, q)), 260);
  };

  const actual = !("fin" in pos) && !pos.portada ? secciones[pos.s]?.preguntas[pos.q] : undefined;
  useEffect(() => {
    if (!actual || !editable) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= actual.opciones.length && !("fin" in pos)) elegir(pos.s, pos.q, actual.opciones[n - 1].valor);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const atras = anterior(pos);
  const parte = "fin" in pos ? null : secciones[pos.s];
  const falta = primeraFalta();

  return (
    <div ref={arriba} className={cn("scroll-mt-4 space-y-4", className)}>
      {/* Avance: una barrita por sección y el total */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{parte ? `Parte ${("fin" in pos) ? "" : pos.s + 1} de ${secciones.length} · ${parte.titulo}` : "Revisar y enviar"}</span>
          <span className="shrink-0 font-cifra">{hechas}/{total}</span>
        </div>
        <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechas} aria-label="Avance">
          {secciones.map((s) => {
            const r = s.preguntas.filter((q) => respuestas[q.id] !== undefined).length;
            return (
              <div key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(r * 100) / Math.max(1, s.preguntas.length)}%` }} />
              </div>
            );
          })}
        </div>
      </div>

      {"fin" in pos ? (
        <section key="fin" className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm animate-in fade-in slide-in-from-right-4 duration-200">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ListChecks className="size-5 text-primary" /> {falta ? "Te faltan algunas" : "¡Listo! Revisa y envía"}</h2>
          <ul className="grid gap-1.5 text-sm">
            {secciones.map((s, n) => {
              const r = s.preguntas.filter((q) => respuestas[q.id] !== undefined).length;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => mover({ s: n, q: Math.max(0, s.preguntas.findIndex((q) => respuestas[q.id] === undefined)), portada: false })}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left hover:border-primary">
                    <span className="min-w-0">{s.titulo}</span>
                    <span className={cn("shrink-0 font-cifra", r < s.preguntas.length ? "font-semibold text-alerta-texto" : "text-ok-texto")}>
                      {r < s.preguntas.length ? `${r}/${s.preguntas.length}` : <Check className="size-4" aria-label="Completa" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {final}
          <div className="flex gap-2">
            <Button variant="outline" className="h-12" onClick={() => atras && mover(atras)}><ArrowLeft /> Atrás</Button>
            {falta ? (
              <Button className="h-12 flex-1" onClick={() => mover(falta)}>Responder lo que falta <ArrowRight /></Button>
            ) : alTerminar ? (
              <Button className="h-12 flex-1" onClick={alTerminar} disabled={!editable}>{textoTerminar} <ArrowRight /></Button>
            ) : null}
          </div>
        </section>
      ) : pos.portada ? (
        <section key={`p${pos.s}`} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-right-4 duration-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Parte {pos.s + 1} de {secciones.length}</p>
          <div className="flex items-center gap-3">
            {parte!.marca}
            <h2 className="text-2xl font-semibold leading-tight tracking-tight">{parte!.titulo}</h2>
          </div>
          {parte!.ayuda && <p className="text-muted-foreground">{parte!.ayuda}</p>}
          <p className="text-sm text-muted-foreground">{parte!.preguntas.length} {parte!.preguntas.length === 1 ? "pregunta" : "preguntas"} · toca tu respuesta y pasa sola a la siguiente.</p>
          <div className="flex gap-2">
            {atras && <Button variant="outline" className="h-12" onClick={() => mover(atras)}><ArrowLeft /> Atrás</Button>}
            <Button className="h-12 flex-1" onClick={() => mover({ s: pos.s, q: 0, portada: false })}>Comenzar <ArrowRight /></Button>
          </div>
        </section>
      ) : actual ? (
        <section key={actual.id} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200" aria-live="polite">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <p className="mb-2 font-cifra text-xs text-muted-foreground">Pregunta {pos.q + 1} de {parte!.preguntas.length}</p>
            <h2 className="text-xl font-semibold leading-snug">{actual.texto}</h2>
            {actual.nota && <p className="mt-1.5 text-sm text-muted-foreground">{actual.nota}</p>}
          </div>
          <div role="radiogroup" aria-label={actual.texto} className="grid gap-2">
            {actual.opciones.map((o, n) => {
              const marcada = respuestas[actual.id] === o.valor;
              return (
                <button key={String(o.valor)} type="button" role="radio" aria-checked={marcada} disabled={!editable}
                  onClick={() => elegir(pos.s, pos.q, o.valor)}
                  className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 bg-card px-4 py-3 text-left text-base font-medium transition active:scale-[.98] disabled:cursor-default",
                    marcada ? TONO[o.tono ?? "neutro"] : "hover:border-primary/60 hover:bg-muted/50")}>
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border text-xs font-cifra", marcada ? "border-current" : "text-muted-foreground")} aria-hidden>
                    {marcada ? <Check className="size-4" /> : n + 1}
                  </span>
                  <span className="min-w-0 flex-1">{o.texto}</span>
                </button>
              );
            })}
          </div>
          {extra?.(actual.id)}
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="h-11" onClick={() => atras && mover(atras)} disabled={!atras}><ArrowLeft /> Atrás</Button>
            <span className="flex-1" />
            {respuestas[actual.id] !== undefined && (
              <Button variant="ghost" className="h-11" onClick={() => mover(siguiente(pos.s, pos.q))}>Siguiente <ArrowRight /></Button>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
