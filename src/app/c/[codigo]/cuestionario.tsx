"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, EyeOff, Loader2, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APARTADOS, METODO_PSICOSOCIAL, NIVELES, TOTAL_PREGUNTAS, nivel, puntajes, rango } from "@/lib/psicosocial";
import { enviarCuestionario } from "./acciones";

type Props = { codigo: string; grupos: { id: string; nombre: string }[] };

// Borrador solo en ESTE navegador y solo mientras la pestaña está abierta (por si se recarga o se corta la señal).
// Se borra al enviar. Nunca sale del teléfono hasta que la persona pulsa «Enviar».
const clave = (codigo: string) => `psicosocial:${codigo}`;
function leerBorrador(codigo: string): { grupo: string | null; r: (number | null)[] } | null {
  try {
    const x = JSON.parse(sessionStorage.getItem(clave(codigo)) ?? "null");
    if (x && Array.isArray(x.r) && x.r.length === TOTAL_PREGUNTAS) return x;
  } catch {}
  return null;
}

export function Cuestionario({ codigo, grupos }: Props) {
  const [paso, setPaso] = useState(0); // 0 = empezar, 1..6 = apartados, 7 = revisar y enviar
  const [grupo, setGrupo] = useState<string | null>(null);
  const [r, setR] = useState<(number | null)[]>(() => Array(TOTAL_PREGUNTAS).fill(null));
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<number[] | null>(null);
  const [enviando, iniciar] = useTransition();
  const arriba = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const b = leerBorrador(codigo);
    if (b) { setGrupo(b.grupo); setR(b.r); }
  }, [codigo]);
  useEffect(() => {
    if (resultado) return;
    try { sessionStorage.setItem(clave(codigo), JSON.stringify({ grupo, r })); } catch {}
  }, [codigo, grupo, r, resultado]);

  const hechas = r.filter((x) => x !== null).length;
  const apartado = paso >= 1 && paso <= 6 ? APARTADOS[paso - 1] : null;
  const faltanAqui = apartado ? apartado.preguntas.filter((q) => r[q.n - 1] === null).map((q) => q.n) : [];
  const irA = (n: number) => { setError(null); setPaso(n); requestAnimationFrame(() => arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };

  const marcar = (n: number, opcion: number) => {
    setR((prev) => { const x = [...prev]; x[n - 1] = opcion; return x; });
    // Pasa sola a la siguiente pregunta sin responder del apartado (más rápido en el celular)
    const sig = apartado?.preguntas.find((q) => q.n > n && r[q.n - 1] === null);
    if (sig) setTimeout(() => document.getElementById(`p${sig.n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  };

  const enviar = () => {
    const faltan = r.map((x, i) => (x === null ? i + 1 : 0)).filter(Boolean);
    if (faltan.length) { setError(`Faltan ${faltan.length} preguntas: ${faltan.slice(0, 8).join(", ")}${faltan.length > 8 ? "…" : ""}.`); return; }
    if (grupos.length && !grupo) { setError("Elige tu puesto o área."); irA(0); return; }
    iniciar(async () => {
      const res = await enviarCuestionario(codigo, grupo, r as number[]);
      if (!res.ok) { setError(res.mensaje); return; }
      try { sessionStorage.removeItem(clave(codigo)); } catch {}
      setResultado(puntajes(r));
      requestAnimationFrame(() => arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  };

  if (resultado) return <TuResultado puntos={resultado} />;

  return (
    <>
    <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">¿Cómo es tu trabajo?</h1>
      <p className="mt-1 text-sm opacity-90">
        38 preguntas sobre la organización del trabajo: ritmo, apoyo, reconocimiento, estabilidad. Sirven para mejorar las condiciones, no para evaluarte a ti.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <li className="flex items-center gap-2"><EyeOff className="size-4 shrink-0" /> Anónimo: sin nombre ni cédula</li>
        <li className="flex items-center gap-2"><Clock className="size-4 shrink-0" /> Unos 10 minutos</li>
        <li className="flex items-center gap-2"><ShieldCheck className="size-4 shrink-0" /> Voluntario</li>
      </ul>
    </section>
    <div ref={arriba} className="scroll-mt-4 space-y-4">
      {/* Avance */}
      <div className="sticky top-0 z-10 -mx-4 bg-muted/80 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{paso === 0 ? "Antes de empezar" : paso === 7 ? "Revisar y enviar" : `Parte ${paso} de 6 · ${apartado?.nombre}`}</span>
          <span className="tabular-nums">{hechas} de {TOTAL_PREGUNTAS}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL_PREGUNTAS} aria-valuenow={hechas}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(hechas * 100) / TOTAL_PREGUNTAS}%` }} />
        </div>
      </div>

      {paso === 0 && (
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          {grupos.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold">¿En qué puesto o área trabajas?</h2>
              <p className="text-sm text-muted-foreground">Solo se usa para ver los resultados por grupo. Los grupos pequeños se juntan para que nadie pueda ser reconocido.</p>
              <div role="radiogroup" aria-label="Puesto o área" className="grid gap-2">
                {grupos.map((g) => (
                  <button key={g.id} type="button" role="radio" aria-checked={grupo === g.id} onClick={() => setGrupo(g.id)}
                    className={cn("min-h-11 rounded-xl border px-4 py-2 text-left text-sm transition",
                      grupo === g.id ? "border-primary bg-primary/10 font-medium text-foreground ring-1 ring-primary" : "bg-background hover:border-primary")}>
                    <span className="flex items-center justify-between gap-2">{g.nombre}{grupo === g.id && <Check className="size-4 shrink-0 text-primary" />}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>• Contesta con sinceridad cómo es tu trabajo <strong className="text-foreground">ahora</strong>. No hay respuestas buenas ni malas.</li>
            <li>• Nadie verá tus respuestas una por una: ni la empresa ni el servicio médico. Solo salen totales por grupo.</li>
            <li>• Al final verás tu propio resultado en tu teléfono.</li>
          </ul>
          <Button className="h-11 w-full" onClick={() => (grupos.length && !grupo ? setError("Elige tu puesto o área.") : irA(1))}>
            Empezar <ArrowRight className="size-4" />
          </Button>
        </section>
      )}

      {apartado && (
        <section className="space-y-3" aria-labelledby={`ap${apartado.n}`}>
          <h2 id={`ap${apartado.n}`} className="px-1 text-lg font-semibold">{apartado.nombre}</h2>
          {apartado.intro && <p className="px-1 text-sm text-muted-foreground">{apartado.intro}</p>}
          {apartado.preguntas.map((q) => (
            <fieldset key={q.n} id={`p${q.n}`} className={cn("scroll-mt-24 space-y-3 rounded-2xl border bg-card p-4 shadow-sm", r[q.n - 1] !== null && "border-primary/40")}>
              <legend className="sr-only">Pregunta {q.n}</legend>
              <p className="font-medium leading-snug"><span className="mr-1.5 text-muted-foreground tabular-nums">{q.n}.</span>{q.texto}</p>
              {q.nota && <p className="text-xs text-muted-foreground">{q.nota}</p>}
              <div role="radiogroup" aria-label={`Respuesta a la pregunta ${q.n}`} className={cn("grid gap-1.5", q.opciones[0].length < 24 && "sm:grid-cols-5")}>
                {q.opciones.map((o, i) => (
                  <button key={i} type="button" role="radio" aria-checked={r[q.n - 1] === i} onClick={() => marcar(q.n, i)}
                    className={cn("min-h-11 rounded-xl border px-3 py-2 text-sm transition",
                      q.opciones[0].length < 24 ? "text-center" : "text-left",
                      r[q.n - 1] === i ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary")}>
                    {o}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={() => irA(paso - 1)}><ArrowLeft className="size-4" /> Atrás</Button>
            <Button className="h-11 flex-1" onClick={() => {
              if (faltanAqui.length) { setError(`Te falta la pregunta ${faltanAqui[0]}.`); document.getElementById(`p${faltanAqui[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
              irA(paso + 1);
            }}>
              {paso < 6 ? "Siguiente" : "Revisar"} <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {paso === 7 && (
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Listo para enviar</h2>
          <ul className="grid gap-1.5 text-sm">
            {APARTADOS.map((a) => {
              const n = a.preguntas.filter((q) => r[q.n - 1] !== null).length;
              return (
                <li key={a.n}>
                  <button type="button" onClick={() => irA(a.n)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                    <span>{a.nombre}</span>
                    <span className={cn("tabular-nums", n < a.preguntas.length ? "font-medium text-alerta-texto" : "text-muted-foreground")}>{n}/{a.preguntas.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">Al enviar, tu código queda usado. Tus respuestas se guardan sin tu nombre, sin tu código y sin la hora.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={() => irA(6)}><ArrowLeft className="size-4" /> Atrás</Button>
            <Button className="h-11 flex-1" onClick={enviar} disabled={enviando}>
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar
            </Button>
          </div>
        </section>
      )}

      {error && <p role="alert" className="rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta-texto">{error}</p>}
      <p className="px-1 text-[11px] leading-snug text-muted-foreground">{METODO_PSICOSOCIAL.cita}</p>
    </div>
    </>
  );
}

// El resultado propio, como en «Analiza tú mismo tus resultados» de la versión corta: solo en este teléfono.
// En palabras, sin nota: los puntos y los intervalos van plegados para quien quiera ver cómo se calcula.
const PALABRA = ["Más favorable", "Intermedia", "Más desfavorable"] as const;
function TuResultado({ puntos }: { puntos: number[] }) {
  return (
    <div className="space-y-4">
      <section role="status" className="space-y-2 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-12 text-ok" />
        <h2 className="text-xl font-semibold">¡Gracias! Tus respuestas se enviaron</h2>
        <p className="text-sm text-muted-foreground">Abajo está lo que dicen tus respuestas. Solo lo ves tú, en este teléfono: no se guarda con tu nombre en ningún lado.</p>
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
        <h3 className="font-semibold">Lo que tus respuestas dicen de tu trabajo</h3>
        <p className="text-sm">Lo que se evalúa es la <strong>organización del trabajo</strong>, no a ti.</p>
        <ul className="space-y-2">
          {APARTADOS.map((a, i) => {
            const nv = nivel(a.n, puntos[i]);
            return (
              <li key={a.n} className="flex items-start gap-3 rounded-xl border p-3">
                <span className={cn("mt-1 size-3.5 shrink-0 rounded-full", NIVELES[nv].barra)} aria-hidden />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium leading-snug">{a.nombre}</p>
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", NIVELES[nv].clase)}>{PALABRA[nv]}</span>
                  <p className="text-xs text-muted-foreground">{a.que}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <details className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1 font-medium text-foreground">Ver cómo se calcula</summary>
          <p className="mt-1">Cada apartado suma tus respuestas y se compara con la población trabajadora de referencia: verde es la situación más favorable para la salud; rojo, la más desfavorable.</p>
          <ul className="mt-1.5 space-y-0.5">
            {APARTADOS.map((a, i) => (
              <li key={a.n}>{a.nombre}: {puntos[i]} puntos (verde {rango(a.verde)} · amarillo {rango(a.amarillo)} · rojo {rango(a.rojo)}).</li>
            ))}
          </ul>
        </details>
        <p className="text-sm text-muted-foreground">Las mejoras se acuerdan con el Comité de Seguridad y Salud Laboral. Las preguntas de cada apartado dan pistas de qué se puede cambiar.</p>
        <p className="rounded-xl bg-primary/5 px-3 py-2 text-sm">Si algo de esto te está afectando, puedes conversarlo con el servicio médico; es confidencial.</p>
      </section>
      <p className="text-center text-xs text-muted-foreground">Ya puedes cerrar esta página.</p>
    </div>
  );
}
