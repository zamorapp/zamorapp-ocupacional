"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Camera, Check, ChevronDown, CloudOff, LayoutList, Lock, Loader2, Plus, Printer, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CLASE_URGENCIA, DEPARTAMENTOS, metodoDe, NOMBRE_DEPTO, SIN_LADO, NOMBRE_METODO, PLAZOS, ordenarHallazgos, prioridad, proponerHallazgos,
  type ClaveMetodo, type Departamento, type Hallazgo, type Metodo, type Pregunta, type Seccion,
} from "@/lib/ergonomia";
import type { Evaluacion, Foto } from "@/lib/ergonomia-datos";
import { ESCALA_P, ESCALA_S } from "@/lib/puestos-tipos";
import { prepararArchivo } from "@/lib/preparar-archivo";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { GraficaDeb } from "@/components/ergonomia/grafica-deb";
import { evaluarFactor, faltantesDeb, FACTORES, NOMBRE_FACTOR, presente, TEXTO_ZONA, type FactorDeb } from "@/lib/ergonomia-deb";
import { borrarEvaluacion, crearEvaluacion, guardarEvaluacion, guardarObservaciones, reabrirEvaluacion, type Cambios } from "../acciones";

// Nivel 4 (inmediato) sin rojo lleno: fondo suave con borde y texto de alerta (Diseño, 07-nov)
const claseNivel = (u: number) => (u === 4 ? "border-alerta bg-alerta/10 text-alerta-texto" : CLASE_URGENCIA[u]);
const SELECT = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const nuevoId = () => crypto.randomUUID().slice(0, 8);
// DEB en amarillo o rojo: método de la app para la evaluación específica de cada peligro (empuje aún no tiene)
const ESPECIFICO: Partial<Record<FactorDeb, ClaveMetodo>> = { lev: "niosh", tra: "niosh", emp: "kim", rep: "ocra", pos: "reba" };

type Props = { ev: Evaluacion; orgId: string; demo?: boolean; puedeEditar: boolean; puedeReabrir: boolean };

export function EditorErgonomia({ ev, orgId, demo, puedeEditar, puedeReabrir }: Props) {
  const router = useRouter();
  const metodo: Metodo | null = metodoDe(ev.metodo);
  const cerrada = ev.estado === "cerrada";
  const editable = puedeEditar && !cerrada;
  const [x, setX] = useState<Cambios>({
    puesto: ev.puesto, tarea: ev.tarea, lado: ev.lado, fecha: ev.fecha, trabajadoresObservados: ev.trabajadoresObservados,
    datos: ev.datos, hallazgos: ev.hallazgos, fotos: ev.fotos, conclusion: ev.conclusion, observaciones: ev.observaciones,
  });
  const set = <K extends keyof Cambios>(k: K, v: Cambios[K]) => setX((a) => ({ ...a, [k]: v }));
  const resultado = useMemo(() => (metodo ? metodo.calcular(x.datos) : null), [metodo, x.datos]);
  const [estado, setEstado] = useState<{ tipo: "ok" | "error" | "guardando" | "pendiente"; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const esDeb = metodo?.clave === "deb";
  // DEB: un acordeón por peligro; abierto solo el que se está llenando (el primero sin terminar)
  const [debAbierto, setDebAbierto] = useState<FactorDeb | "otros" | null>(() => (ev.metodo === "deb" ? FACTORES.find((f) => evaluarFactor(f, ev.datos).zona === null) ?? null : null));
  const faltan = useMemo(() => (esDeb ? faltantesDeb(x.datos) : []), [esDeb, x.datos]);
  const revisados = FACTORES.length - faltan.length;
  const [avisoFaltan, setAvisoFaltan] = useState(false);
  // Paso a paso (Cesar, 06-nov): una pantalla por peligro (DEB) o por sección; no se avanza sin lo obligatorio.
  // «Ver todo junto» vuelve a la lista completa (para revisar o imprimir); cerrada se ve siempre completa.
  const [todoJunto, setTodoJunto] = useState(false);
  const pasos = useMemo((): { id: string; titulo: string; nota?: string; secs: Seccion[]; opcional?: boolean; listo: boolean; faltan: number; primera?: string }[] => {
    if (!metodo) return [];
    if (esDeb) {
      const deb = FACTORES.map((f) => {
        const secs = metodo.secciones.filter((sec) => sec.grupo === f && (!sec.si || sec.si(x.datos)));
        const falta = faltan.find((q) => q.factor === f);
        const primera = secs.filter((sec) => !sec.opcional).flatMap((sec) => sec.preguntas).find((p) => x.datos[p.clave] === undefined)?.clave;
        return { id: f, titulo: NOMBRE_FACTOR[f], secs, listo: evaluarFactor(f, x.datos).zona !== null, faltan: falta ? Math.max(falta.n, 1) : 0, primera };
      });
      const otros = metodo.secciones.filter((sec) => sec.grupo === "otros");
      return otros.length ? [...deb, { id: "otros", titulo: "Otros riesgos del puesto", nota: "Opcional: marca solo los que haya.", secs: otros, opcional: true, listo: true, faltan: 0, primera: undefined }] : deb;
    }
    return metodo.secciones.filter((sec) => !sec.si || sec.si(x.datos)).map((sec, i) => {
      const sin = sec.opcional ? [] : sec.preguntas.filter((p) => {
        if (x.datos[p.clave] !== undefined) return false;
        const binaria = !p.numero && p.opciones.length === 2 && p.opciones[0].valor === 0 && p.opciones[0].texto === "No";
        return !binaria; // un ajuste Sí/No sin marcar cuenta como «No»
      });
      return { id: `s${i}`, titulo: sec.titulo, secs: [sec], opcional: sec.opcional, listo: sin.length === 0, faltan: sin.length, primera: sin[0]?.clave };
    });
  }, [metodo, esDeb, x.datos, faltan]);
  const [paso, setPaso] = useState(() => 0);
  // Falta algo y se pulsó Siguiente: aviso con «Ir a la pregunta» o «Ignorar y seguir» (todo aviso se puede ignorar)
  const [avisoPaso, setAvisoPaso] = useState(false);
  const pasoActual = Math.min(paso, Math.max(pasos.length - 1, 0));
  const porPasos = editable && !todoJunto && pasos.length > 1;
  const irAPaso = (i: number) => { setPaso(i); setAvisoPaso(false); setTimeout(() => document.getElementById("metodo-pasos")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); };
  // Primer paso sin terminar al abrir (para seguir donde se quedó)
  const irA = (f: FactorDeb) => {
    if (porPasos) { const i = pasos.findIndex((q) => q.id === f); if (i >= 0) { irAPaso(i); return; } }
    setDebAbierto(f); setTimeout(() => document.getElementById(`deb-${f}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const ubicado = useRef(false);
  useEffect(() => {
    if (ubicado.current || !pasos.length) return;
    ubicado.current = true;
    const i = pasos.findIndex((q) => !q.listo);
    if (i > 0) setPaso(i);
  }, [pasos]);
  const alternarAbierto = (id: string) => setAbiertos((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Guardado automático 1,5 s después del último cambio (a prueba de cortes de luz); el puntaje lo recalcula el servidor
  const primera = useRef(true);
  const vuelta = useRef(0);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    if (!editable) return;
    if (demo) { setEstado({ tipo: "ok", texto: "Modo demo: los cambios no se guardan." }); return; }
    setEstado({ tipo: "pendiente", texto: "Cambios sin guardar…" });
    const n = ++vuelta.current;
    const t = setTimeout(async () => {
      setEstado({ tipo: "guardando", texto: "Guardando…" });
      try {
        const r = await guardarEvaluacion(ev.id, x);
        if (n === vuelta.current) setEstado(r.ok ? { tipo: "ok", texto: "Guardado" } : { tipo: "error", texto: r.mensaje });
      } catch {
        if (n === vuelta.current) setEstado({ tipo: "error", texto: "No se pudo guardar (¿sin conexión?). Tus cambios siguen aquí: se guardan al volver la conexión con cualquier cambio o con «Guardar»." });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [x, editable, demo, ev.id, ev.metodo]);

  const responder = (clave: string, valor: number | null) => {
    const datos = { ...x.datos };
    if (valor === null) delete datos[clave]; else datos[clave] = valor;
    set("datos", datos);
  };

  // Una pregunta: número, lista larga o botones (Sí/No: sin responder ambos con borde; «No» gris, «Sí» verde)
  const pregunta = (p: Pregunta) => {
    const actual = x.datos[p.clave];
    if (p.numero) {
      const n = p.numero;
      return (
        <label key={p.clave} id={`p-${p.clave}`} className="flex scroll-mt-24 flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1 text-sm">{p.texto}
            {/* Mediciones ambientales del DEB: aviso si el valor queda fuera de la referencia */}
            {typeof actual === "number" && (p as { fuera?: (v: number) => boolean }).fuera?.(actual) && <span className="ml-1.5 text-xs font-medium text-aviso-texto">Fuera de referencia</span>}
            {p.ayuda && <span className="mt-0.5 block text-xs text-muted-foreground">{p.ayuda}</span>}</span>
          <span className="flex items-center gap-1.5">
            <Input
              type="number" inputMode="decimal" min={n.min} max={n.max} step={n.paso ?? 1} disabled={!editable}
              value={actual ?? ""} className="h-9 w-24 text-right font-cifra"
              onChange={(e) => {
                const t = e.target.value.replace(",", ".");
                const num = t === "" ? null : Number(t);
                responder(p.clave, num === null || !Number.isFinite(num) ? null : Math.min(n.max, Math.max(n.min, num)));
              }}
            />
            <span className="w-6 text-sm text-muted-foreground">{n.unidad}</span>
          </span>
        </label>
      );
    }
    // Listas largas (frecuencia de NIOSH): un selector, no 18 botones
    if (p.opciones.length > 8) {
      return (
        <label key={p.clave} id={`p-${p.clave}`} className="flex scroll-mt-24 flex-wrap items-center justify-between gap-2">
          <span className="text-sm">{p.texto}</span>
          <select disabled={!editable} value={actual ?? ""} onChange={(e) => responder(p.clave, e.target.value === "" ? null : Number(e.target.value))} className={cn(SELECT, "w-full sm:w-56")}>
            <option value="">Elige…</option>
            {p.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </label>
      );
    }
    const binaria = p.opciones.length === 2 && p.opciones[0].valor === 0 && p.opciones[0].texto === "No";
    return (
      <div key={p.clave} id={`p-${p.clave}`} className={cn("scroll-mt-24 rounded-md", binaria ? "flex flex-wrap items-center justify-between gap-2" : "space-y-1.5")}>
        <div className={cn("text-sm", binaria && "min-w-0 flex-1")}>{p.texto}{p.ayuda && <span className="mt-0.5 block text-xs text-muted-foreground">{p.ayuda}</span>}</div>
        <div className={cn("flex flex-wrap gap-1.5", !binaria && "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4")} role="radiogroup" aria-label={p.texto}>
          {p.opciones.map((o) => {
            // En RULA/REBA un ajuste sin marcar cuenta como «No»; en el DEB hay que responder cada pregunta
            const elegido = actual === o.valor || (actual === undefined && binaria && o.valor === 0 && !esDeb);
            return (
              <button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={elegido}
                disabled={!editable}
                onClick={() => responder(p.clave, o.valor)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-left text-sm transition disabled:cursor-default",
                  elegido ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60",
                  binaria && "min-w-14 text-center",
                )}
              >
                <span className="block">{o.texto}{!binaria && !p.sinPuntos && metodo?.clave !== "niosh" && <span className={cn("ml-1 font-cifra text-xs", elegido ? "opacity-80" : "text-muted-foreground")}>{(o.valor < 0 ? `−${-o.valor}` : `+${o.valor}`).replace(".", ",")}</span>}</span>
                {o.detalle && <span className={cn("block text-xs", elegido ? "opacity-80" : "text-muted-foreground")}>{o.detalle}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };
  // Una sección; en el DEB va dentro del acordeón del peligro (sin borde propio; franja de color en verde y roja)
  const seccion = (sec: Seccion, enAcordeon: boolean) => (
    <div key={sec.titulo} className={cn(enAcordeon ? "space-y-3" : "rounded-xl border p-4", (sec.verde || sec.roja) && "border-l-4 pl-3", sec.verde && "border-l-emerald-500", sec.roja && "border-l-alerta")}>
      <div className={cn("flex items-center justify-between gap-2", !enAcordeon && "mb-3")}>
        <h3 className="font-medium">
          {sec.verde && <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Zona verde</span>}
          {sec.roja && <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-alerta-texto dark:text-alerta">Zona roja</span>}
          {enAcordeon ? sec.titulo.replace(/^.*?: (¿?)(\p{L})/u, (_m, q: string, c: string) => q + c.toUpperCase()).replace(/ \(zona (verde|roja)\)$/, "") : sec.titulo}
        </h3>
        {sec.opcional && <span className="shrink-0 text-xs text-muted-foreground">marca solo los que haya</span>}
        {metodo && metodo.clave !== "niosh" && resultado?.zonas[sec.zona] !== undefined && <span className="shrink-0 font-cifra text-xs text-muted-foreground">Puntos: {resultado.zonas[sec.zona]}</span>}
      </div>
      <div className="space-y-3">{sec.preguntas.map(pregunta)}</div>
    </div>
  );

  const proponer = () => {
    if (!metodo || !resultado) return;
    const nuevos = proponerHallazgos(metodo, resultado, x.hallazgos, nuevoId);
    if (!nuevos.length) { setEstado({ tipo: "ok", texto: resultado.urgencia === 0 ? "Postura aceptable: no hay hallazgos que proponer." : "Los hallazgos del resultado ya están en la lista." }); return; }
    set("hallazgos", [...x.hallazgos, ...nuevos]);
  };
  const cambiarHallazgo = (id: string, cambio: Partial<Hallazgo>) =>
    set("hallazgos", x.hallazgos.map((h) => {
      if (h.id !== id) return h;
      const n = { ...h, ...cambio };
      // Al cambiar P o S el plazo sugerido sigue a la prioridad (si el médico no lo había cambiado a mano)
      if (("p" in cambio || "s" in cambio) && (!h.plazo || h.plazo === prioridad(h)?.plazo)) n.plazo = prioridad(n)?.plazo ?? h.plazo;
      return n;
    }));

  const accion = (fn: () => Promise<{ ok: boolean; mensaje: string }>, despues?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      setEstado({ tipo: r.ok ? "ok" : "error", texto: r.mensaje });
      if (r.ok) { despues?.(); router.refresh(); }
    });

  const ordenados = ordenarHallazgos(x.hallazgos);
  const porDepto = DEPARTAMENTOS.map((d) => ({ ...d, n: x.hallazgos.filter((h) => h.departamento === d.clave).length }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        {/* Datos del puesto */}
        <section className="grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-4">
          <div className={SIN_LADO.includes(ev.metodo) ? "sm:col-span-3" : "sm:col-span-2"}><Label className="mb-1.5">Puesto</Label><Input disabled={!editable} value={x.puesto} onChange={(e) => set("puesto", e.target.value)} /></div>
          <div><Label className="mb-1.5">Fecha</Label><Input type="date" disabled={!editable} value={x.fecha} onChange={(e) => set("fecha", e.target.value)} /></div>
          {!SIN_LADO.includes(ev.metodo) && <div>
            <Label className="mb-1.5">Lado evaluado</Label>
            <select disabled={!editable} value={x.lado ?? ""} onChange={(e) => set("lado", (e.target.value || null) as Cambios["lado"])} className={SELECT}>
              <option value="">—</option><option value="derecho">Derecho</option><option value="izquierdo">Izquierdo</option><option value="ambos">Ambos</option>
            </select>
          </div>}
          <div className="sm:col-span-3"><Label className="mb-1.5">Tarea observada</Label><Input disabled={!editable} value={x.tarea} onChange={(e) => set("tarea", e.target.value)} /></div>
          <div><Label className="mb-1.5">Trabajadores expuestos</Label><Input type="number" min={0} disabled={!editable} value={x.trabajadoresObservados ?? ""} onChange={(e) => set("trabajadoresObservados", e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))))} /></div>
        </section>

        <Fotos evId={ev.id} orgId={orgId} fotos={x.fotos} editable={editable} onCambio={(f) => set("fotos", f)} />

        {/* Método */}
        {metodo && (
          <section className="space-y-4">
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold">{metodo.nombre}</h2>
                <Link href={`/ayuda#guia-${metodo.clave}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline print:hidden"><BookOpen className="size-4" /> ¿Cómo se hace?</Link>
              </div>
              <p className="text-xs text-muted-foreground">{metodo.clave === "niosh" ? "Mide al inicio del levantamiento más exigente (si al dejar la carga es peor, evalúa también el destino)." : metodo.clave === "deb" ? "Recorre el puesto y responde Sí o No. Solo se abren las fichas de los peligros presentes; la zona roja aparece si falla alguna condición de la verde." : "Marca la postura más exigente o la que más se repite."} Fuente: {metodo.fuente}</p>
            </div>
            {esDeb && (
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">Peligros revisados {revisados} de {FACTORES.length}</span>
                <span className="grid h-2 flex-1 grid-cols-5 gap-0.5" aria-hidden>{FACTORES.map((f, i) => <span key={f} className={cn("rounded-sm", i < revisados ? "bg-primary" : "bg-muted")} />)}</span>
              </div>
            )}
            {avisoFaltan && faltan.length > 0 && (
                <div id="deb-faltan" role="alert" className="scroll-mt-20 space-y-1 rounded-md bg-aviso/15 px-3 py-2 text-sm text-aviso-texto">
                  <div className="font-medium">Antes de cerrar, responde lo que falta:</div>
                  {faltan.map((q) => (
                    <div key={q.factor} className="flex items-center justify-between gap-2">
                      <span>{q.n ? `Faltan ${q.n} ${q.n === 1 ? "pregunta" : "preguntas"} en ${q.nombre}` : `${q.nombre}: sin revisar`}</span>
                      <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => irA(q.factor)}>Ir</Button>
                    </div>
                  ))}
                </div>
              )}

            {editable && pasos.length > 1 && (
              <div className="flex justify-end print:hidden">
                <Button variant="ghost" size="sm" onClick={() => setTodoJunto(!todoJunto)}>{todoJunto ? <><ArrowRight /> Paso a paso</> : <><LayoutList /> Ver todo junto</>}</Button>
              </div>
            )}
            {porPasos ? (() => {
              const q = pasos[pasoActual];
              const ultimo = pasoActual === pasos.length - 1;
              return (
                <div id="metodo-pasos" className="scroll-mt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{q.titulo} · {pasoActual + 1} de {pasos.length}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{pasos.filter((z) => z.listo).length} de {pasos.length} listos</span>
                    </div>
                    <div className="flex gap-1" role="tablist" aria-label="Pasos de la evaluación">
                      {pasos.map((z, i) => {
                        return (
                          <button key={z.id} type="button" role="tab" aria-selected={i === pasoActual} aria-label={`${i + 1}. ${z.titulo}${z.listo ? " (listo)" : ""}`} title={z.titulo}
                            onClick={() => irAPaso(i)}
                            className={cn("h-2 flex-1 rounded-full transition hover:opacity-80", i === pasoActual ? "bg-primary" : z.listo ? "bg-primary/45" : "bg-muted", z.opcional && i !== pasoActual && "bg-muted/60")} />
                        );
                      })}
                    </div>
                  </div>
                  <div className={cn("space-y-4 rounded-xl border p-4 shadow-sm", q.opcional && "border-dashed")}>
                    {esDeb && <div>
                      <h3 className="text-base font-semibold">{q.titulo}</h3>
                      {q.nota && <p className="text-xs text-muted-foreground">{q.nota}</p>}
                      {esDeb && !q.opcional && (() => { const z = evaluarFactor(q.id as FactorDeb, x.datos).zona; return z ? <p className={cn("text-xs font-medium", z === "rojo" ? "text-alerta-texto dark:text-alerta" : z === "amarillo" ? "text-amber-700 dark:text-amber-400" : z === "verde" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>{z === "no" ? "No presente" : TEXTO_ZONA[z]}</p> : null; })()}
                    </div>}
                    {q.secs.map((sec) => seccion(sec, true))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="outline" disabled={pasoActual === 0} onClick={() => irAPaso(pasoActual - 1)}><ArrowLeft /> Anterior</Button>
                    {ultimo
                      ? <Button onClick={() => (q.listo || avisoPaso ? (setAvisoPaso(false), document.getElementById("hallazgos")?.scrollIntoView({ behavior: "smooth", block: "start" })) : setAvisoPaso(true))}><Check /> Terminar y ver riesgos</Button>
                      : <Button onClick={() => (q.listo || avisoPaso ? irAPaso(pasoActual + 1) : setAvisoPaso(true))}>Siguiente <ArrowRight /></Button>}
                  </div>
                  {avisoPaso && !q.listo && (
                    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-aviso/40 bg-aviso/15 px-3 py-2 text-sm text-aviso-texto">
                      <span className="min-w-0 flex-1">Falta{q.faltan === 1 ? "" : "n"} {q.faltan} {q.faltan === 1 ? "respuesta" : "respuestas"} en este paso.</span>
                      {q.primera && <Button size="sm" variant="outline" className="h-8" onClick={() => { const el = document.getElementById(`p-${q.primera}`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.classList.add("ring-2", "ring-aviso"); setTimeout(() => el?.classList.remove("ring-2", "ring-aviso"), 2000); }}>Ir a la pregunta</Button>}
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => (ultimo ? (setAvisoPaso(false), document.getElementById("hallazgos")?.scrollIntoView({ behavior: "smooth", block: "start" })) : irAPaso(pasoActual + 1))}>Ignorar y seguir</Button>
                    </div>
                  )}
                </div>
              );
            })() : esDeb
              ? FACTORES.map((f) => {
                  const z = evaluarFactor(f, x.datos).zona;
                  const hay = presente(f, x.datos);
                  const abierto = debAbierto === f;
                  const secs = metodo.secciones.filter((sec) => sec.grupo === f && (!sec.si || sec.si(x.datos)));
                  const falta = faltan.find((q) => q.factor === f);
                  return (
                    <div key={f} id={`deb-${f}`} className="scroll-mt-4 rounded-xl border">
                      <button type="button" aria-expanded={abierto} onClick={() => setDebAbierto(abierto ? null : f)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
                        <span className="min-w-0">
                          <span className="block font-medium">{NOMBRE_FACTOR[f]}</span>
                          <span className={cn("block text-xs", z === "rojo" ? "text-alerta-texto dark:text-alerta" : z === "amarillo" ? "text-amber-700 dark:text-amber-400" : z === "verde" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                            {z ? (z === "no" ? "No presente" : TEXTO_ZONA[z]) : hay === null ? "Sin revisar" : `Faltan ${falta?.n ?? 0} ${falta?.n === 1 ? "pregunta" : "preguntas"}`}
                          </span>
                        </span>
                        <ChevronDown className={cn("size-4 shrink-0 transition", abierto && "rotate-180")} />
                      </button>
                      {abierto && <div className="space-y-4 border-t px-4 pt-3 pb-4">{secs.map((sec) => seccion(sec, true))}</div>}
                    </div>
                  );
                }).concat((() => {
                  // Otros riesgos del puesto (complemento del DEB): opcional, no bloquea el cierre
                  const abierto = debAbierto === "otros";
                  const n = (resultado?.otros ?? []).reduce((t, c) => t + c.items.length, 0);
                  return (
                    <div key="otros" id="deb-otros" className="scroll-mt-4 rounded-xl border border-dashed">
                      <button type="button" aria-expanded={abierto} onClick={() => setDebAbierto(abierto ? null : "otros")} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
                        <span className="min-w-0">
                          <span className="block font-medium">Otros riesgos del puesto</span>
                          <span className={cn("block text-xs", n ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                            {n ? `${n} ${n === 1 ? "alerta" : "alertas"}` : "Físicos, químicos, biológicos, psicosociales y mediciones · opcional"}
                          </span>
                        </span>
                        <ChevronDown className={cn("size-4 shrink-0 transition", abierto && "rotate-180")} />
                      </button>
                      {abierto && <div className="space-y-4 border-t px-4 pt-3 pb-4">{metodo.secciones.filter((sec) => sec.grupo === "otros").map((sec) => seccion(sec, true))}</div>}
                    </div>
                  );
                })())
              : metodo.secciones.filter((sec) => !sec.si || sec.si(x.datos)).map((sec) => seccion(sec, false))}
          </section>
        )}

        {/* Hallazgos */}
        <section id="hallazgos" className="scroll-mt-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Riesgos y recomendaciones</h2>
              <p className="text-xs text-muted-foreground">Cada hallazgo va a un departamento. La prioridad sale de probabilidad × severidad (matriz 5×5).</p>
            </div>
            {editable && (
              <div className="flex flex-wrap gap-2">
                {metodo && <Button variant="outline" size="sm" onClick={proponer}><Sparkles /> Proponer desde el resultado</Button>}
                <Button variant="outline" size="sm" onClick={() => { const id = nuevoId(); setAbiertos((a) => new Set(a).add(id)); set("hallazgos", [...x.hallazgos, { id, factor: "", detalle: "", p: 0, s: 0, consecuencia: "", medida: "", departamento: "ingenieria", plazo: "", origen: "manual" }]); }}><Plus /> Agregar</Button>
              </div>
            )}
          </div>
          {ordenados.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Sin hallazgos todavía.{metodo ? " Marca las posturas y pulsa «Proponer desde el resultado»." : ""}</p>}
          {ordenados.map((h) => {
            const pr = prioridad(h);
            const abierto = abiertos.has(h.id) || !h.factor;
            return (
              <div key={h.id} className="rounded-xl border">
                {/* Plegado: prioridad · riesgo · responsable · plazo; se abre al tocarlo */}
                <button
                  type="button"
                  aria-expanded={abierto}
                  onClick={() => alternarAbierto(h.id)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-3 py-2.5 text-left text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                >
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", pr ? pr.clase : "bg-muted text-muted-foreground")}>{pr ? `${pr.texto} ${pr.n}` : "Sin valorar"}</span>
                  <span className="truncate font-medium">{h.factor || "Nuevo hallazgo"}</span>
                  <span className="col-start-2 row-start-2 text-xs text-muted-foreground sm:col-start-3 sm:row-start-1">{NOMBRE_DEPTO[h.departamento]} · {h.plazo || pr?.plazo || "sin plazo"}</span>
                  <ChevronDown className={cn("col-start-3 row-start-1 size-4 shrink-0 text-muted-foreground transition sm:col-start-4", abierto && "rotate-180")} />
                </button>
                {abierto && (
                  <div className="space-y-2 border-t px-3 pt-2 pb-3">
                    <div className="flex items-start gap-2">
                      <Input disabled={!editable} value={h.factor} placeholder="Factor de riesgo (ej.: brazos elevados)" onChange={(e) => cambiarHallazgo(h.id, { factor: e.target.value })} className="font-medium" />
                      {editable && <button type="button" aria-label="Quitar hallazgo" className="mt-2 text-muted-foreground hover:text-destructive" onClick={() => set("hallazgos", x.hallazgos.filter((y) => y.id !== h.id))}><Trash2 className="size-4" /></button>}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select aria-label="Probabilidad" disabled={!editable} value={h.p} onChange={(e) => cambiarHallazgo(h.id, { p: Number(e.target.value) })} className={SELECT}>
                        <option value={0}>Probabilidad</option>
                        {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>P{i} · {ESCALA_P[i]}</option>)}
                      </select>
                      <select aria-label="Severidad" disabled={!editable} value={h.s} onChange={(e) => cambiarHallazgo(h.id, { s: Number(e.target.value) })} className={SELECT}>
                        <option value={0}>Severidad</option>
                        {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>S{i} · {ESCALA_S[i]}</option>)}
                      </select>
                      <select aria-label="Responsable" disabled={!editable} value={h.departamento} onChange={(e) => cambiarHallazgo(h.id, { departamento: e.target.value as Departamento })} className={SELECT}>
                        {DEPARTAMENTOS.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
                      </select>
                      <select aria-label="Plazo" disabled={!editable} value={h.plazo} onChange={(e) => cambiarHallazgo(h.id, { plazo: e.target.value })} className={SELECT}>
                        <option value="">Plazo…</option>
                        {PLAZOS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <Input disabled={!editable} value={h.consecuencia} placeholder="Posible daño: enfermedad o accidente que puede causar" onChange={(e) => cambiarHallazgo(h.id, { consecuencia: e.target.value })} className="text-sm" />
                    <Textarea disabled={!editable} rows={2} value={h.medida} placeholder="Medida recomendada" onChange={(e) => cambiarHallazgo(h.id, { medida: e.target.value })} className="text-sm" />
                    {h.detalle && <p className="text-xs text-muted-foreground">{h.detalle}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label className="mb-1.5">Conclusión</Label><Textarea disabled={!editable} rows={3} value={x.conclusion} onChange={(e) => set("conclusion", e.target.value)} placeholder="Resumen para la gerencia: riesgo principal y qué hacer primero" /></div>
          <div>
            <Label className="mb-1.5">Observaciones</Label>
            <Textarea disabled={!puedeEditar} rows={3} value={x.observaciones} onChange={(e) => set("observaciones", e.target.value)} placeholder="Seguimiento: a quién se entregó, qué se aplicó" />
            {cerrada && puedeEditar && <Button variant="outline" size="sm" className="mt-2" disabled={ocupado} onClick={() => accion(() => guardarObservaciones(ev.id, x.observaciones))}>Guardar observaciones</Button>}
          </div>
        </section>
      </div>

      {/* Resultado (fijo a la derecha en PC, al final en el celular) */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {resultado && (
          <div className="rounded-xl border p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{NOMBRE_METODO[ev.metodo]}</div>
            <div className="mt-2 flex items-end gap-2">
              <span className={cn("font-cifra font-semibold leading-none", resultado.factores ? "text-2xl" : "text-5xl")}>{resultado.completo ? (resultado.factores ? resultado.nivel : resultado.texto ?? resultado.puntaje) : "—"}</span>
              {!resultado.texto && <span className="pb-1 text-sm text-muted-foreground">de {resultado.maximo}</span>}
            </div>
            {resultado.completo && resultado.subtexto && <div className="mt-1.5 text-sm text-muted-foreground">{resultado.subtexto}</div>}
            {resultado.factores && <div className="mt-3"><GraficaDeb factores={resultado.factores} otros={resultado.otros} /></div>}
            {resultado.completo ? (
              <>
                <div className={cn("mt-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium", claseNivel(resultado.urgencia))}>{resultado.factores ? resultado.texto : resultado.nivel}</div>
                <p className="mt-2 text-sm">{resultado.accion}</p>
                {resultado.factores?.some((f) => f.zona === "rojo" || f.zona === "amarillo") && (
                  <div className="mt-3 space-y-1.5 border-t pt-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evaluación específica</div>
                    {resultado.factores.filter((f) => f.zona === "rojo" || f.zona === "amarillo").map((f) => {
                      const m = ESPECIFICO[f.clave];
                      return (
                        <div key={f.clave} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0"><b>{f.nombre}</b><span className="block text-muted-foreground">{f.especifica}</span></span>
                          {m && puedeEditar && !demo && (
                            <Button size="sm" variant="outline" className="shrink-0" disabled={ocupado}
                              onClick={() => iniciar(async () => {
                                const r = await crearEvaluacion({ empresaId: ev.empresaId, puestoId: ev.puestoId, puesto: x.puesto, tarea: x.tarea, metodo: m });
                                if (!r.ok || !r.id) { setEstado({ tipo: "error", texto: r.mensaje }); return; }
                                router.push(`/ergonomia/${r.id}`);
                              })}>Hacer {m.toUpperCase()}</Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Completa todos los datos para ver el resultado.</p>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground">Cómo se calculó</summary>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
                {resultado.parciales.map((p) => (<div key={p.etiqueta} className="contents"><dt className="text-muted-foreground">{p.etiqueta}</dt><dd className="text-right font-cifra">{String(p.valor).replace(".", ",")}</dd></div>))}
              </dl>
            </details>
          </div>
        )}

        <div className="rounded-xl border p-4">
          <div className="mb-2 text-sm font-medium">Informes</div>
          <div className="grid grid-cols-1 gap-1.5">
            <Link href={`/imprimir/ergonomia/${ev.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:border-primary"><span className="flex items-center gap-2"><Printer className="size-4" /> Informe completo</span></Link>
            {porDepto.map((d) => (
              <Link key={d.clave} href={`/imprimir/ergonomia/${ev.id}?para=${d.clave}`} aria-disabled={d.n === 0}
                className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:border-primary", d.n === 0 && "pointer-events-none opacity-50")}>
                <span>{d.nombre}</span><span className="font-cifra text-xs text-muted-foreground">{d.n}</span>
              </Link>
            ))}
          </div>
          {!cerrada && <p className="mt-2 text-xs text-muted-foreground">Mientras no la cierres, los informes salen marcados «Borrador».</p>}
        </div>

        <div className="space-y-2">
          {estado && (
            <p role="status" className={cn("flex items-start gap-1.5 rounded-md px-3 py-2 text-sm", estado.tipo === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
              {estado.tipo === "guardando" ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /> : estado.tipo === "error" ? <CloudOff className="mt-0.5 size-4 shrink-0" /> : estado.tipo === "ok" ? <Check className="mt-0.5 size-4 shrink-0" /> : null}
              {estado.texto}
            </p>
          )}
          {editable && (
            <>
              <Button className="w-full" variant={estado?.tipo === "ok" || !estado ? "outline" : "default"} disabled={ocupado || estado?.tipo === "guardando"} onClick={() => accion(() => guardarEvaluacion(ev.id, x))}>{ocupado || estado?.tipo === "guardando" ? <><Loader2 className="animate-spin" /> Guardando</> : estado?.tipo === "ok" || !estado ? <><Check /> Guardado</> : "Guardar ahora"}</Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={ocupado}
                onClick={async () => {
                  if (faltan.length) {
                    setAvisoFaltan(true);
                    setDebAbierto(faltan[0].factor);
                    setTimeout(() => document.getElementById("deb-faltan")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
                    return;
                  }
                  if (!(await confirmar({ titulo: "¿Cerrar la evaluación?", texto: "Queda como informe entregado: ya no se cambia (solo las observaciones). Un administrador o el gerente médico pueden reabrirla.", accion: "Cerrar evaluación" }))) return;
                  accion(() => guardarEvaluacion(ev.id, x, true));
                }}
              >
                <Lock /> Cerrar evaluación
              </Button>
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                disabled={ocupado}
                onClick={async () => {
                  if (!(await confirmar({ titulo: `¿Borrar la evaluación de «${ev.puesto}»?`, texto: `Se borran la evaluación, ${x.hallazgos.length} hallazgos y ${x.fotos.length} fotos. No se puede deshacer.`, accion: "Borrar", peligro: true }))) return;
                  accion(() => borrarEvaluacion(ev.id), () => router.push("/ergonomia"));
                }}
              >
                <Trash2 /> Borrar borrador
              </Button>
            </>
          )}
          {cerrada && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="size-4" /> Cerrada{ev.cerradaEn ? ` el ${ev.cerradaEn.split("-").reverse().join("/")}` : ""}.</p>
          )}
          {cerrada && puedeReabrir && (
            <Button variant="outline" className="w-full" disabled={ocupado} onClick={async () => {
              if (!(await confirmar({ titulo: "¿Reabrir la evaluación?", texto: "Podrás corregir posturas, fotos y hallazgos. El cambio queda en la bitácora; vuelve a cerrarla al terminar.", accion: "Reabrir" }))) return;
              accion(() => reabrirEvaluacion(ev.id));
            }}><RotateCcw /> Reabrir para corregir</Button>
          )}
        </div>
      </aside>

      {/* Celular: resultado y Guardar siempre a la mano, encima de la barra inferior */}
      {(resultado || editable) && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl bg-background shadow-lg lg:hidden">
        {/* Color del nivel sobre fondo opaco: el contenido de atrás no se transparenta */}
        <div className={cn("flex items-center gap-3 rounded-2xl border px-4 py-2.5", resultado?.completo ? claseNivel(resultado.urgencia) : "")}>
          <div className="min-w-0 flex-1 text-sm">
            {resultado ? (
              esDeb && !resultado.completo ? <span className="block truncate"><b>DEB</b> · {revisados} de {FACTORES.length} revisados</span> : <span className="block truncate"><b className="font-cifra">{metodo!.corto} {resultado.completo ? (resultado.texto ?? `${resultado.puntaje} de ${resultado.maximo}`) : "incompleto"}</b>{resultado.completo && ` · ${resultado.nivel}`}</span>
            ) : (
              <span className="block truncate">{x.hallazgos.length} hallazgos</span>
            )}
            {estado?.tipo === "error" && <span className="block truncate text-xs">{estado.texto}</span>}
          </div>
          {editable && (
            <Button size="sm" variant={estado?.tipo === "ok" || !estado ? "outline" : "default"} className="shrink-0 bg-background text-foreground" disabled={ocupado || estado?.tipo === "guardando"} onClick={() => accion(() => guardarEvaluacion(ev.id, x))}>
              {ocupado || estado?.tipo === "guardando" ? <><Loader2 className="animate-spin" /> Guardando</> : estado?.tipo === "ok" || !estado ? <><Check /> Guardado</> : "Guardar ahora"}
            </Button>
          )}
        </div>
        </div>
      )}
    </div>
  );
}

// Fotos de la inspección: se achican y pierden el EXIF (GPS) antes de subir. Requieren internet.
function Fotos({ evId, orgId, fotos, editable, onCambio }: { evId: string; orgId: string; fotos: Foto[]; editable: boolean; onCambio: (f: Foto[]) => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const actuales = useRef(fotos);
  actuales.current = fotos;

  // Cada ruta se firma una sola vez (si falla, no se reintenta en bucle)
  const pedidas = useRef(new Set<string>());
  useEffect(() => {
    const faltan = fotos.map((f) => f.ruta).filter((r) => !pedidas.current.has(r));
    if (!faltan.length) return;
    faltan.forEach((r) => pedidas.current.add(r));
    crearClienteNavegador().storage.from("ergonomia").createSignedUrls(faltan, 3600).then(({ data }) => {
      const firmadas = (data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]);
      if (firmadas.length) setUrls((u) => ({ ...u, ...Object.fromEntries(firmadas) }));
    });
  }, [fotos]);

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    setSubiendo(true);
    setError(null);
    const supabase = crearClienteNavegador();
    let lista = actuales.current;
    for (const original of Array.from(archivos)) {
      if (lista.length >= 12) { setError("Máximo 12 fotos por evaluación."); break; }
      try {
        const archivo = await prepararArchivo(original);
        if (archivo.type === "application/pdf") throw new Error(`${original.name}: aquí solo van fotos.`);
        const ruta = `${orgId}/${evId}/${crypto.randomUUID()}.${archivo.type === "image/png" ? "png" : "jpg"}`;
        const { error: e } = await supabase.storage.from("ergonomia").upload(ruta, archivo, { contentType: archivo.type });
        if (e) throw new Error(/fetch|network|offline|503/i.test(e.message) ? "Las fotos necesitan internet. La evaluación sí se guarda; súbelas cuando vuelva la conexión." : `No se pudo subir ${original.name}: ${e.message}`);
        lista = [...lista, { ruta, nota: "" }];
        onCambio(lista);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (entrada.current) entrada.current.value = "";
    setSubiendo(false);
  };

  const quitar = async (f: Foto) => {
    if (!(await confirmar({ titulo: "¿Quitar esta foto?", texto: "Se borra del informe y del almacenamiento.", accion: "Quitar", peligro: true }))) return;
    const { error: e } = await crearClienteNavegador().storage.from("ergonomia").remove([f.ruta]);
    if (e) { setError(`No se pudo quitar: ${e.message}`); return; }
    onCambio(actuales.current.filter((y) => y.ruta !== f.ruta));
  };

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">Fotos de la tarea</h2>
          <p className="text-xs text-muted-foreground">Toma la postura de lado y de frente. Se les quita la ubicación antes de guardarlas. Necesitan internet.</p>
        </div>
        {editable && (
          <>
            <input ref={entrada} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
            <Button variant="outline" size="sm" disabled={subiendo || fotos.length >= 12} onClick={() => entrada.current?.click()}>
              {subiendo ? <Loader2 className="animate-spin" /> : <Camera />} Tomar o subir foto
            </Button>
          </>
        )}
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fotos.map((f, i) => (
            <li key={f.ruta} className="space-y-1.5">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                {urls[f.ruta] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[f.ruta]} alt={f.nota || `Foto ${i + 1}`} className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-xs text-muted-foreground">Foto {i + 1}</div>
                )}
                {editable && (
                  <button type="button" aria-label="Quitar foto" onClick={() => quitar(f)} className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-destructive"><X className="size-3.5" /></button>
                )}
              </div>
              <Input disabled={!editable} value={f.nota} placeholder="Qué muestra" className="h-8 text-xs"
                onChange={(e) => onCambio(actuales.current.map((y) => (y.ruta === f.ruta ? { ...y, nota: e.target.value } : y)))} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

