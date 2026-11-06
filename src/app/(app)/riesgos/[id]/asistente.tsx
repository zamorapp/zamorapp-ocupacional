"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, Check, CloudOff, ImagePlus, Loader2, Lock, MapPin, Plus, Printer, RotateCcw, Sparkles, Trash2, Type, Upload, X } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BarrasPuestos, DonaGrupos, FichasGrupo, LetraGrupo, MatrizRiesgos, Tarjetas } from "@/components/riesgos/graficas";
import { LeyendaMapa, MapaRiesgos } from "@/components/riesgos/mapa";
import { Pantallas } from "@/components/encuesta/pantallas";
import { DEPARTAMENTOS, PLAZOS } from "@/lib/ergonomia";
import { prepararArchivo } from "@/lib/preparar-archivo";
import { ESCALA_P, ESCALA_S, GRUPOS, type GrupoRiesgo, type Valoracion } from "@/lib/puestos-tipos";
import {
  clavePuesto, faltaEnPuesto, filasDePuesto, MAX_FOTOS_PUESTO, sugerirFotos, fueraDeRango, MEDICIONES, NOMBRE_GRUPO, nivelFila, resumen, TIPOS_EVALUACION, TIPOS_MEDIDA,
  type EvaluacionRiesgos, type FilaRiesgo, type FotoZona, type Pregunta, type PuestoEvaluado,
} from "@/lib/riesgos-puesto";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { aplicarRiesgosAPuestos, borrarEvaluacionRiesgos, guardarEvaluacionRiesgos, guardarObservacionesRiesgos, reabrirEvaluacionRiesgos, type CambiosRiesgos } from "../acciones";

export type PuestoEmpresa = { id: string; nombre: string; dependencia: string | null; trabajadores: number; riesgos: Partial<Record<GrupoRiesgo, string[]>>; evaluacion: Record<string, Valoracion> };

type Props = {
  ev: EvaluacionRiesgos;
  preguntas: Pregunta[];
  motivos: string[];
  agentes: { grupo: string; nombre: string }[];
  puestosEmpresa: PuestoEmpresa[];
  planoUrl: string | null;
  orgId: string;
  demo?: boolean;
  puedeEditar: boolean;
  puedeReabrir: boolean;
  puedeAplicar: boolean;
};

const PASOS = [
  { titulo: "Datos", ayuda: "Qué se evalúa, por qué y con quién" },
  { titulo: "Puestos", ayuda: "Puestos que entran y sus expuestos" },
  { titulo: "Riesgos", ayuda: "Lista de chequeo y valoración" },
  { titulo: "Mapa", ayuda: "Ubicar cada riesgo en el plano" },
  { titulo: "Resultados", ayuda: "Gráficas, conclusión y cierre" },
];
const SELECT = "h-10 w-full rounded-md border bg-transparent px-2 text-sm";
const nuevoId = () => crypto.randomUUID().slice(0, 8);

export function Asistente({ ev, preguntas, motivos, agentes, puestosEmpresa, planoUrl: urlInicial, orgId, demo, puedeEditar, puedeReabrir, puedeAplicar }: Props) {
  const router = useRouter();
  const cerrada = ev.estado === "cerrada";
  const editable = puedeEditar && !cerrada;
  const [x, setX] = useState<CambiosRiesgos>({
    titulo: ev.titulo, fecha: ev.fecha, motivo: ev.motivo, participantes: ev.participantes, acta: ev.acta,
    puestos: ev.puestos, filas: ev.filas, mapa: ev.mapa, conclusion: ev.conclusion, observaciones: ev.observaciones,
  });
  const set = <K extends keyof CambiosRiesgos>(k: K, v: CambiosRiesgos[K]) => setX((a) => ({ ...a, [k]: v }));
  const [estado, setEstado] = useState<{ tipo: "ok" | "error" | "guardando" | "pendiente"; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const tipo = TIPOS_EVALUACION.find((t) => t.clave === ev.tipo) ?? TIPOS_EVALUACION[0];

  // ¿Qué falta en cada paso? Lo mismo revisa el servidor al cerrar.
  const faltas = useMemo(() => {
    const f: string[][] = [[], [], [], [], []];
    if (!x.titulo.trim()) f[0].push("qué se evalúa");
    if (!x.motivo.trim()) f[0].push("el motivo");
    if (!x.participantes.trim()) f[0].push("quiénes participaron (Comité, delegados, trabajadores)");
    if (!x.puestos.length) f[1].push("al menos un puesto");
    for (const p of x.puestos) if (p.expuestos === null) f[1].push(`los expuestos de «${p.puesto}»`);
    for (const p of x.puestos) {
      const r = faltaEnPuesto(p, preguntas, x.filas);
      if (r.sinResponder) f[2].push(`${r.sinResponder} preguntas en «${p.puesto}»`);
      if (r.sinValorar) f[2].push(`valorar ${r.sinValorar} riesgos de «${p.puesto}»`);
    }
    if (x.puestos.length && !x.filas.length) f[2].push("al menos un riesgo");
    const enMapa = new Set(x.mapa.marcas.map((m) => m.filaId));
    const graves = x.filas.filter((r) => (nivelFila(r)?.n ?? 0) >= 10 && !enMapa.has(r.id));
    if (graves.length) f[3].push(`ubicar ${graves.length} riesgos altos o críticos`);
    if (x.filas.length && !x.mapa.marcas.length) f[3].push("al menos un símbolo en el mapa");
    if (!x.conclusion.trim()) f[4].push("la conclusión");
    return f;
  }, [x, preguntas]);
  const primeroIncompleto = faltas.findIndex((l) => l.length > 0);
  const [paso, setPaso] = useState(() => (cerrada ? 4 : Math.max(0, primeroIncompleto === -1 ? 4 : primeroIncompleto)));
  const [intento, setIntento] = useState(false);
  const alcanzable = (i: number) => cerrada || faltas.slice(0, i).every((l) => l.length === 0);
  const ir = (i: number) => { if (alcanzable(i)) { setPaso(i); setIntento(false); window.scrollTo({ top: 0, behavior: "smooth" }); } else setIntento(true); };

  // Guardado automático 1,5 s después del último cambio (a prueba de cortes de luz)
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
        const r = await guardarEvaluacionRiesgos(ev.id, x);
        if (n === vuelta.current) setEstado(r.ok ? { tipo: "ok", texto: "Guardado" } : { tipo: "error", texto: r.mensaje });
      } catch {
        if (n === vuelta.current) setEstado({ tipo: "error", texto: "No se pudo guardar (¿sin conexión?). Tus cambios siguen aquí y se guardan al volver la conexión." });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [x, editable, demo, ev.id]);

  const accion = (fn: () => Promise<{ ok: boolean; mensaje: string }>, despues?: () => void) => iniciar(async () => {
    const r = await fn();
    setEstado({ tipo: r.ok ? "ok" : "error", texto: r.mensaje });
    if (r.ok) { despues?.(); router.refresh(); }
  });

  return (
    <div className="space-y-5">
      {/* Pasos: se puede volver atrás siempre; adelante, solo con lo anterior completo */}
      <nav aria-label="Pasos de la evaluación" className="sticky top-0 z-10 -mx-1 rounded-2xl border bg-card/95 p-2 shadow-sm backdrop-blur">
        <ol className="grid grid-cols-5 gap-1">
          {PASOS.map((p, i) => {
            const hecho = faltas[i].length === 0;
            const activo = paso === i;
            return (
              <li key={p.titulo}>
                <button
                  type="button"
                  onClick={() => ir(i)}
                  aria-current={activo ? "step" : undefined}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition sm:flex-row sm:gap-2 sm:px-3 sm:text-left",
                    activo ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_var(--primary)]" : alcanzable(i) ? "hover:bg-muted" : "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold", activo ? "bg-primary-foreground/20" : hecho ? "bg-ok/15 text-ok-texto" : "bg-muted text-muted-foreground")}>
                    {hecho && !activo ? <Check className="size-4" /> : !alcanzable(i) ? <Lock className="size-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold sm:text-sm">{p.titulo}</span>
                    <span className={cn("hidden text-[11px] lg:block", activo ? "text-primary-foreground/80" : "text-muted-foreground")}>{p.ayuda}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all" style={{ width: `${(faltas.filter((l) => !l.length).length / 5) * 100}%` }} />
        </div>
      </nav>

      {cerrada && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm">
          <Lock className="size-4 text-ok-texto" />
          <span className="flex-1">Cerrada el {ev.cerradaEn?.split("-").reverse().join("/")}. Solo cambian las observaciones.{ev.aplicadaEn && ` Pasada a los puestos el ${ev.aplicadaEn.split("-").reverse().join("/")}.`}</span>
          {puedeReabrir && !demo && <Button variant="outline" size="sm" disabled={ocupado} onClick={async () => { if (await confirmar("¿Reabrir la evaluación para corregirla?")) accion(() => reabrirEvaluacionRiesgos(ev.id)); }}><RotateCcw /> Reabrir</Button>}
        </div>
      )}

      {paso === 0 && <PasoDatos x={x} set={set} editable={editable} motivos={motivos} tipo={tipo} />}
      {paso === 1 && <PasoPuestos x={x} setX={setX} editable={editable} puestosEmpresa={puestosEmpresa} />}
      {paso === 2 && <PasoRiesgos x={x} setX={setX} editable={editable} preguntas={preguntas} agentes={agentes} oficina={ev.tipo === "oficina"} evId={ev.id} orgId={orgId} demo={demo} />}
      {paso === 3 && <PasoMapa x={x} set={set} editable={editable} evId={ev.id} orgId={orgId} planoInicial={urlInicial} demo={demo} />}
      {paso === 4 && (
        <PasoResultados x={x} set={set} editable={editable} cerrada={cerrada} puedeEditar={puedeEditar} ev={ev} />
      )}

      {/* Lo que falta para seguir: siempre a la vista, nunca bloquea volver atrás */}
      {faltas[paso].length > 0 && (intento || paso === 4) && !cerrada && (
        <div role="alert" className="rounded-xl border border-aviso/50 bg-aviso/10 px-4 py-3 text-sm">
          <b>Para {paso === 4 ? "cerrar" : "seguir"} falta:</b> {faltas[paso].join("; ")}.
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/95 p-3 shadow-[0_-6px_20px_-12px_rgba(0,0,0,.35)] backdrop-blur">
        <Button variant="ghost" disabled={paso === 0} onClick={() => ir(paso - 1)}><ArrowLeft /> Atrás</Button>
        <span className={cn("flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate text-xs", estado?.tipo === "error" ? "text-destructive" : "text-muted-foreground")} role="status">
          {estado?.tipo === "guardando" && <Loader2 className="size-3.5 animate-spin" />}
          {estado?.tipo === "error" && <CloudOff className="size-3.5" />}
          {estado?.texto ?? `Paso ${paso + 1} de 5`}
        </span>
        {paso < 4 ? (
          <Button onClick={() => (faltas[paso].length && !cerrada ? setIntento(true) : ir(paso + 1))} className={cn(faltas[paso].length && !cerrada && "opacity-60")}>
            Siguiente <ArrowRight />
          </Button>
        ) : cerrada ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link href={`/imprimir/riesgos/${ev.id}`}><Printer /> Informe y mapa</Link></Button>
            {puedeAplicar && !demo && (
              <Button disabled={ocupado} onClick={async () => {
                if (await confirmar({ titulo: "¿Pasar estos riesgos a la matriz de cada puesto?", texto: "Se agregan los riesgos que falten y se actualiza la valoración de los evaluados en Empresas › Puestos. No se borra nada. Las notificaciones de riesgo de esos puestos quedarán por renovar.", accion: "Pasar a los puestos" }))
                  accion(() => aplicarRiesgosAPuestos(ev.id));
              }}>
                {ocupado ? <Loader2 className="animate-spin" /> : <ArrowRight />} Pasar a los puestos
              </Button>
            )}
          </div>
        ) : editable ? (
          <Button disabled={ocupado} onClick={() => {
            if (faltas.some((l) => l.length)) { setIntento(true); const i = faltas.findIndex((l) => l.length); if (i < 4) setPaso(i); return; }
            accion(() => guardarEvaluacionRiesgos(ev.id, x, true));
          }}>
            {ocupado ? <Loader2 className="animate-spin" /> : <Lock />} Cerrar evaluación
          </Button>
        ) : null}
      </div>

      {editable && !demo && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="text-destructive" disabled={ocupado} onClick={async () => {
            if (await confirmar({ titulo: "¿Borrar esta evaluación en borrador?", texto: "Se borran sus riesgos y su mapa. No se puede deshacer.", accion: "Borrar", peligro: true }))
              accion(() => borrarEvaluacionRiesgos(ev.id), () => router.push("/riesgos"));
          }}><Trash2 /> Borrar borrador</Button>
        </div>
      )}
    </div>
  );
}

type PasoProps = { x: CambiosRiesgos; editable: boolean };
type ConSet = PasoProps & { set: <K extends keyof CambiosRiesgos>(k: K, v: CambiosRiesgos[K]) => void };
type ConSetX = PasoProps & { setX: React.Dispatch<React.SetStateAction<CambiosRiesgos>> };

function Tarjeta({ titulo, ayuda, children, className }: { titulo: string; ayuda?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 shadow-[0_10px_30px_-20px_rgba(15,40,60,.45)] sm:p-5", className)}>
      <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
      {ayuda && <p className="mt-0.5 text-sm text-muted-foreground">{ayuda}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ── Paso 1 ──
function PasoDatos({ x, set, editable, motivos, tipo }: ConSet & { motivos: string[]; tipo: (typeof TIPOS_EVALUACION)[number] }) {
  const otro = Boolean(x.motivo) && !motivos.includes(x.motivo);
  return (
    <Tarjeta titulo="1. Datos de la evaluación" ayuda={`Tipo: ${tipo.nombre}. La NT-04-2023 (art. 14) pide hacer la identificación con los trabajadores y el Comité, y dejarla en acta.`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="titulo" className="mb-1.5">Qué se evalúa <span className="text-destructive">*</span></Label>
          <Input id="titulo" disabled={!editable} value={x.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej.: Planta Maturín, almacén y oficinas" />
        </div>
        <div>
          <Label htmlFor="motivo" className="mb-1.5">Motivo <span className="text-destructive">*</span></Label>
          <select id="motivo" disabled={!editable} className={SELECT} value={otro ? "__otro" : x.motivo} onChange={(e) => set("motivo", e.target.value === "__otro" ? " " : e.target.value)}>
            <option value="">Elige…</option>
            {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="__otro">Otro (escribirlo)</option>
          </select>
          {otro && <Input className="mt-2" disabled={!editable} value={x.motivo.trimStart()} onChange={(e) => set("motivo", e.target.value || " ")} placeholder="Escribe el motivo" autoFocus />}
          <p className="mt-1 text-xs text-muted-foreground">Lista editable en Configuración › Listas › «Motivos de identificación de riesgos».</p>
        </div>
        <div>
          <Label htmlFor="fecha" className="mb-1.5">Fecha</Label>
          <Input id="fecha" type="date" disabled={!editable} value={x.fecha} onChange={(e) => set("fecha", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="participantes" className="mb-1.5">Quiénes participaron <span className="text-destructive">*</span></Label>
          <Textarea id="participantes" disabled={!editable} rows={2} value={x.participantes} onChange={(e) => set("participantes", e.target.value)} placeholder="Comité de Seguridad y Salud Laboral, delegados de prevención (nombres), trabajadores consultados…" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="acta" className="mb-1.5">Acta <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Input id="acta" disabled={!editable} value={x.acta} onChange={(e) => set("acta", e.target.value)} placeholder="Ej.: Acta del Comité n.º 7 del 06/11/2026" />
        </div>
      </div>
    </Tarjeta>
  );
}

// ── Paso 2 ──
function PasoPuestos({ x, setX, editable, puestosEmpresa }: ConSetX & { puestosEmpresa: PuestoEmpresa[] }) {
  const [nuevo, setNuevo] = useState({ puesto: "", area: "" });
  const elegido = (id: string) => x.puestos.some((p) => p.puestoId === id);
  const alternar = (p: PuestoEmpresa) => setX((a) => {
    if (a.puestos.some((q) => q.puestoId === p.id)) {
      const clave = clavePuesto({ puestoId: p.id, puesto: p.nombre });
      return { ...a, puestos: a.puestos.filter((q) => q.clave !== clave), filas: a.filas.filter((f) => clavePuesto(f) !== clave) };
    }
    // Trae los riesgos que el puesto ya tiene en su matriz: no se escribe dos veces lo mismo
    const filas = filasDePuesto(p, nuevoId);
    return { ...a, puestos: [...a.puestos, { clave: clavePuesto({ puestoId: p.id, puesto: p.nombre }), puestoId: p.id, puesto: p.nombre, area: p.dependencia ?? "", expuestos: p.trabajadores || null, respuestas: {} }], filas: [...a.filas, ...filas] };
  });
  const cambiar = (clave: string, c: Partial<PuestoEvaluado>) => setX((a) => ({
    ...a,
    puestos: a.puestos.map((p) => (p.clave === clave ? { ...p, ...c } : p)),
    // El área y los expuestos del puesto bajan a sus riesgos (el mapa y la tabla los usan)
    filas: a.filas.map((f) => (clavePuesto(f) === clave ? { ...f, ...(c.area !== undefined ? { area: c.area } : {}), ...(c.expuestos !== undefined ? { expuestos: c.expuestos } : {}) } : f)),
  }));
  const quitar = (clave: string) => setX((a) => ({ ...a, puestos: a.puestos.filter((p) => p.clave !== clave), filas: a.filas.filter((f) => clavePuesto(f) !== clave) }));
  const libres = x.puestos.filter((p) => !p.puestoId);

  return (
    <Tarjeta titulo="2. Puestos que entran" ayuda="Toca los puestos de la empresa. Si un puesto ya tiene riesgos en su matriz, se traen solos para no escribirlos dos veces. Anota cuántos trabajadores están expuestos en cada uno.">
      {puestosEmpresa.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {puestosEmpresa.map((p) => {
            const si = elegido(p.id);
            const n = Object.values(p.riesgos ?? {}).reduce((a, l) => a + (l?.length ?? 0), 0);
            return (
              <button key={p.id} type="button" disabled={!editable} onClick={() => alternar(p)} aria-pressed={si}
                className={cn("flex items-start gap-3 rounded-xl border-2 p-3 text-left transition disabled:cursor-default", si ? "border-primary bg-primary/5 shadow-[0_6px_18px_-12px_var(--primary)]" : "hover:border-primary/50")}>
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border", si && "border-primary bg-primary text-primary-foreground")}>{si && <Check className="size-3.5" />}</span>
                <span className="min-w-0">
                  <span className="block font-medium">{p.nombre}</span>
                  <span className="block text-xs text-muted-foreground">{[p.dependencia, `${p.trabajadores} trabajadores`, n ? `${n} riesgos en su matriz` : "sin riesgos todavía"].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Esta empresa aún no tiene puestos registrados. Agrégalos abajo por su nombre (o regístralos en Empresas › Puestos).</p>
      )}

      {editable && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-3">
          <div className="min-w-44 flex-1"><Label className="mb-1.5">Otro puesto o área</Label><Input value={nuevo.puesto} onChange={(e) => setNuevo({ ...nuevo, puesto: e.target.value })} placeholder="Ej.: Vigilante" /></div>
          <div className="min-w-36 flex-1"><Label className="mb-1.5">Área</Label><Input value={nuevo.area} onChange={(e) => setNuevo({ ...nuevo, area: e.target.value })} placeholder="Ej.: Entrada principal" /></div>
          <Button variant="outline" disabled={!nuevo.puesto.trim() || x.puestos.some((p) => p.clave === clavePuesto({ puestoId: null, puesto: nuevo.puesto }))} onClick={() => {
            const base = { puestoId: null, puesto: nuevo.puesto.trim() };
            setX((a) => ({ ...a, puestos: [...a.puestos, { ...base, clave: clavePuesto(base), area: nuevo.area.trim(), expuestos: null, respuestas: {} }] }));
            setNuevo({ puesto: "", area: "" });
          }}><Plus /> Agregar</Button>
        </div>
      )}

      {x.puestos.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="text-sm font-semibold">En esta evaluación ({x.puestos.length})</div>
          {x.puestos.map((p) => (
            <div key={p.clave} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-[minmax(0,1fr)_12rem_8rem_auto]">
              <div className="col-span-2 min-w-0 font-medium sm:col-span-1">{p.puesto}{!p.puestoId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(no registrado)</span>}</div>
              <div><Label className="mb-1 text-xs">Área o zona</Label><Input disabled={!editable} value={p.area} onChange={(e) => cambiar(p.clave, { area: e.target.value })} /></div>
              <div><Label className="mb-1 text-xs">Expuestos <span className="text-destructive">*</span></Label><Input type="number" min={0} inputMode="numeric" disabled={!editable} value={p.expuestos ?? ""} className="text-right font-cifra" onChange={(e) => cambiar(p.clave, { expuestos: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })} /></div>
              {editable && <Button variant="ghost" size="icon" aria-label={`Quitar ${p.puesto}`} onClick={async () => { if (await confirmar(`¿Quitar «${p.puesto}» y sus riesgos de esta evaluación?`)) quitar(p.clave); }}><X /></Button>}
            </div>
          ))}
          {libres.length > 0 && <p className="text-xs text-muted-foreground">Los puestos no registrados salen en el informe y el mapa, pero «Pasar a los puestos» solo actualiza los registrados.</p>}
        </div>
      )}
    </Tarjeta>
  );
}

// ── Paso 3 ──
function PasoRiesgos({ x, setX, editable, preguntas, agentes, oficina, evId, orgId, demo }: ConSetX & { preguntas: Pregunta[]; agentes: { grupo: string; nombre: string }[]; oficina: boolean; evId: string; orgId: string; demo?: boolean }) {
  const [actual, setActual] = useState(() => x.puestos.find((p) => !faltaEnPuesto(p, preguntas, x.filas).listo)?.clave ?? x.puestos[0]?.clave);
  const p = x.puestos.find((q) => q.clave === actual) ?? x.puestos[0];
  const [extra, setExtra] = useState<{ grupo: GrupoRiesgo; agente: string }>({ grupo: "fisico", agente: "" });
  if (!p) return <Tarjeta titulo="3. Riesgos por puesto"><p className="text-sm text-muted-foreground">Primero agrega los puestos (paso 2).</p></Tarjeta>;
  const filasP = x.filas.filter((f) => clavePuesto(f) === p.clave);
  const r = faltaEnPuesto(p, preguntas, x.filas);

  // Responder: «Sí» agrega el riesgo con su daño y medida sugeridos (o liga uno igual que ya estaba); «No» quita el que
  // agregó esa pregunta si nadie lo valoró todavía
  const responder = (q: Pregunta, v: 0 | 1) => setX((a) => {
    const puestos = a.puestos.map((pp) => (pp.clave === p.clave ? { ...pp, respuestas: { ...(pp.respuestas ?? {}), [q.id]: v } } : pp));
    let filas = a.filas;
    const mias = filas.filter((f) => clavePuesto(f) === p.clave);
    if (v === 1 && !mias.some((f) => f.pregunta === q.id)) {
      const igual = mias.find((f) => f.grupo === q.grupo && f.agente.toLowerCase() === q.agente.toLowerCase() && !f.pregunta);
      filas = igual
        ? filas.map((f) => (f.id === igual.id ? { ...f, pregunta: q.id, efecto: f.efecto || q.efecto, medida: f.medida || q.medida } : f))
        : [...filas, { id: nuevoId(), pregunta: q.id, puestoId: p.puestoId, puesto: p.puesto, area: p.area, tarea: "", grupo: q.grupo, agente: q.agente, fuente: q.texto.replace(/^¿|\?$/g, ""), efecto: q.efecto, expuestos: p.expuestos, p: 0, s: 0, controles: "", medida: q.medida, tipoMedida: "", responsable: "sst", plazo: "" }];
    }
    if (v === 0) filas = filas.filter((f) => !(clavePuesto(f) === p.clave && f.pregunta === q.id && !f.p && !f.s));
    return { ...a, puestos, filas };
  });
  const restoNo = (g: GrupoRiesgo) => setX((a) => ({
    ...a,
    puestos: a.puestos.map((pp) => (pp.clave === p.clave ? { ...pp, respuestas: { ...Object.fromEntries(preguntas.filter((q) => q.grupo === g).map((q) => [q.id, 0])), ...(pp.respuestas ?? {}) } } : pp)),
  }));
  const cambiarFila = (id: string, c: Partial<FilaRiesgo>) => setX((a) => ({ ...a, filas: a.filas.map((f) => (f.id === id ? { ...f, ...c } : f)) }));
  const quitarFila = (id: string) => setX((a) => ({ ...a, filas: a.filas.filter((f) => f.id !== id), mapa: { ...a.mapa, marcas: a.mapa.marcas.filter((m) => m.filaId !== id) } }));
  const medir = (k: keyof NonNullable<PuestoEvaluado["mediciones"]>, v: number | null) =>
    setX((a) => ({ ...a, puestos: a.puestos.map((pp) => (pp.clave === p.clave ? { ...pp, mediciones: { ...(pp.mediciones ?? {}), [k]: v } } : pp)) }));
  const siguientePuesto = x.puestos.find((q) => q.clave !== p.clave && faltaEnPuesto(q, preguntas, x.filas).sinResponder > 0);

  return (
    <div className="space-y-4">
      {/* Un puesto a la vez, con su avance */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {x.puestos.map((q) => {
          const f = faltaEnPuesto(q, preguntas, x.filas);
          return (
            <button key={q.clave} type="button" onClick={() => setActual(q.clave)} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition", q.clave === p.clave ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {f.listo ? <Check className="size-4" /> : <span className="font-cifra text-xs opacity-80">{preguntas.length - f.sinResponder}/{preguntas.length}</span>}
              {q.puesto}
            </button>
          );
        })}
      </div>

      <Tarjeta titulo={`3. Riesgos de «${p.puesto}»`} ayuda={`Responde cada pregunta: «Sí» si el peligro está en el puesto. Cada «Sí» agrega el riesgo con su posible daño y una medida sugerida. ${r.sinResponder ? `Faltan ${r.sinResponder} de ${preguntas.length}.` : "Lista de chequeo completa."}`}>
        {oficina && (
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 lg:grid-cols-4">
            {MEDICIONES.map((m) => {
              const v = p.mediciones?.[m.clave];
              const fuera = fueraDeRango(m, v);
              return (
                <label key={m.clave} className="block">
                  <span className="text-xs font-medium">{m.nombre}</span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <Input type="number" inputMode="decimal" disabled={!editable} value={v ?? ""} className={cn("h-9 text-right font-cifra", fuera && "border-aviso")} onChange={(e) => medir(m.clave, e.target.value === "" ? null : Number(e.target.value.replace(",", ".")))} />
                    <span className="w-8 text-xs text-muted-foreground">{m.unidad}</span>
                  </span>
                  <span className={cn("mt-0.5 block text-[11px]", fuera ? "font-medium text-aviso-texto" : "text-muted-foreground")}>{fuera ? "Fuera de " : "Ref. "}{m.ref} · {m.fuente}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* Por pantallas de un clic (Cesar, 06-nov): un grupo de riesgo por pantalla; no se pasa sin responder todo */}
        <Pantallas
          key={p.clave}
          modo="seccion"
          editable={editable}
          secciones={GRUPOS.map(([g]) => ({
            id: g,
            titulo: NOMBRE_GRUPO[g],
            ayuda: `Riesgos ${NOMBRE_GRUPO[g].toLowerCase()}: «Sí» si el peligro está en el puesto.`,
            marca: <LetraGrupo g={g} />,
            preguntas: preguntas.filter((q) => q.grupo === g).map((q) => ({
              id: q.id, texto: q.texto, nota: q.fuente ? `Fuente: ${q.fuente}` : undefined,
              opciones: [{ valor: 1, texto: "Sí", tono: "alerta" as const }, { valor: 0, texto: "No", tono: "neutro" as const }],
            })),
          })).filter((sec) => sec.preguntas.length)}
          respuestas={p.respuestas ?? {}}
          onResponder={(id, v) => { const q = preguntas.find((qq) => qq.id === id); if (q) responder(q, v === 1 ? 1 : 0); }}
          atajo={{ valor: 0, texto: "Lo que falta de esta sección: No" }}
          onAtajo={(sec) => restoNo(sec.id as GrupoRiesgo)}
          alTerminar={siguientePuesto ? () => setActual(siguientePuesto.clave) : undefined}
          textoTerminar={siguientePuesto ? `Seguir con «${siguientePuesto.puesto}»` : undefined}
        />
      </Tarjeta>

      <FotosZona key={`f-${p.clave}`} p={p} editable={editable} evId={evId} orgId={orgId} demo={demo} sugerencias={sugerirFotos(p, preguntas, oficina)}
        cambiar={(fotos) => setX((a) => ({ ...a, puestos: a.puestos.map((pp) => (pp.clave === p.clave ? { ...pp, fotos } : pp)) }))} />

      <Tarjeta titulo={`Valorar los riesgos de «${p.puesto}» (${filasP.length})`} ayuda="Probabilidad × severidad (1 a 5) da el nivel y el plazo sugerido. Ajusta la medida, el responsable y el plazo.">
        {filasP.length === 0 && <p className="text-sm text-muted-foreground">Sin riesgos todavía: responde «Sí» donde el peligro esté presente, o agrega uno abajo.</p>}
        <div className="space-y-3">
          {filasP.map((f) => <FilaEditor key={f.id} f={f} editable={editable} cambiar={(c) => cambiarFila(f.id, c)} quitar={() => quitarFila(f.id)} />)}
        </div>
        {editable && (
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-3">
            <div className="w-full sm:w-52"><Label className="mb-1.5">Otro riesgo: grupo</Label>
              <select className={SELECT} value={extra.grupo} onChange={(e) => setExtra({ grupo: e.target.value as GrupoRiesgo, agente: "" })}>
                {GRUPOS.map(([g]) => <option key={g} value={g}>{NOMBRE_GRUPO[g]}</option>)}
              </select>
            </div>
            <div className="min-w-48 flex-1"><Label className="mb-1.5">Agente</Label>
              <Input list="agentes-riesgo" value={extra.agente} onChange={(e) => setExtra({ ...extra, agente: e.target.value })} placeholder="Elige o escribe" />
              <datalist id="agentes-riesgo">{agentes.filter((a) => a.grupo === extra.grupo).map((a) => <option key={a.nombre} value={a.nombre} />)}</datalist>
            </div>
            <Button variant="outline" disabled={!extra.agente.trim()} onClick={() => {
              setX((a) => ({ ...a, filas: [...a.filas, { id: nuevoId(), pregunta: null, puestoId: p.puestoId, puesto: p.puesto, area: p.area, tarea: "", grupo: extra.grupo, agente: extra.agente.trim(), fuente: "", efecto: "", expuestos: p.expuestos, p: 0, s: 0, controles: "", medida: "", tipoMedida: "", responsable: "sst", plazo: "" }] }));
              setExtra({ ...extra, agente: "" });
            }}><Plus /> Agregar</Button>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

// Fotos de la zona del puesto, con la lista de qué fotografiar: tocar una sugerencia abre la cámara del teléfono y la
// foto queda con ese nombre. Se achica y se le quita la ubicación (EXIF) antes de subirla.
function FotosZona({ p, editable, evId, orgId, demo, sugerencias, cambiar }: { p: PuestoEvaluado; editable: boolean; evId: string; orgId: string; demo?: boolean; sugerencias: string[]; cambiar: (f: FotoZona[]) => void }) {
  const fotos = p.fotos ?? [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [nota, setNota] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const rutas = fotos.map((f) => f.ruta).join("|");
  useEffect(() => {
    const faltan = fotos.map((f) => f.ruta).filter((r) => !urls[r]);
    if (!faltan.length || demo) return;
    crearClienteNavegador().storage.from("mapas-riesgo").createSignedUrls(faltan, 3600).then(({ data }) => {
      if (data) setUrls((u) => ({ ...u, ...Object.fromEntries(data.filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl as string])) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutas, demo]);
  const lleno = fotos.length >= MAX_FOTOS_PUESTO;
  const pedir = (texto: string) => { setNota(texto); setAviso(""); entrada.current?.click(); };
  const subir = async (lista: FileList | null) => {
    const original = lista?.[0];
    if (entrada.current) entrada.current.value = "";
    if (!original) return;
    if (demo) { setAviso("Modo demo: las fotos no se suben."); return; }
    setSubiendo(true); setAviso("");
    try {
      const archivo = await prepararArchivo(original);
      const ruta = `${orgId}/${evId}/foto-${nuevoId()}.${archivo.type === "image/png" ? "png" : "jpg"}`;
      const supabase = crearClienteNavegador();
      const { error } = await supabase.storage.from("mapas-riesgo").upload(ruta, archivo, { contentType: archivo.type });
      if (error) throw new Error(/fetch|network|offline|503/i.test(error.message) ? "La foto necesita internet. Tómala y súbela cuando vuelva la conexión." : error.message);
      cambiar([...fotos, { ruta, nota: (nota || "Foto de la zona").slice(0, 120) }]);
      setNota("");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally { setSubiendo(false); }
  };
  return (
    <Tarjeta titulo={`Fotos de la zona (${fotos.length} de ${MAX_FOTOS_PUESTO})`} ayuda="Opcional. Toca lo que vas a fotografiar y se abre la cámara. Fotografía el puesto, no a la persona: sin rostros si el trabajador no lo autoriza. La empresa no ve estas fotos.">
      {editable && !lleno && (
        <div className="flex flex-wrap gap-2">
          {sugerencias.map((t) => (
            <button key={t} type="button" disabled={subiendo} onClick={() => pedir(t)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm transition hover:border-primary hover:bg-primary/5">
              <Camera className="size-4 text-primary" /> {t}
            </button>
          ))}
          <button type="button" disabled={subiendo} onClick={() => pedir("")} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-muted"><Plus className="size-4" /> Otra foto</button>
          <input ref={entrada} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => subir(e.target.files)} />
        </div>
      )}
      {subiendo && <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Subiendo «{nota || "foto"}»…</p>}
      {aviso && <p className="mt-2 text-sm text-aviso-texto">{aviso}</p>}
      {fotos.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fotos.map((f, i) => (
            <figure key={f.ruta} className="relative overflow-hidden rounded-xl border bg-muted">
              {urls[f.ruta]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={urls[f.ruta]} alt={f.nota} className="aspect-[4/3] w-full object-cover" />
                : <div className="grid aspect-[4/3] place-items-center text-xs text-muted-foreground">Foto {i + 1}</div>}
              <figcaption className="flex items-center gap-1 px-2 py-1.5 text-xs">
                <Input disabled={!editable} value={f.nota} className="h-7 text-xs" aria-label={`Nombre de la foto ${i + 1}`} onChange={(e) => cambiar(fotos.map((g) => (g.ruta === f.ruta ? { ...g, nota: e.target.value.slice(0, 120) } : g)))} />
                {editable && !demo && (
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Quitar la foto ${i + 1}`} onClick={async () => {
                    if (!(await confirmar("¿Quitar esta foto?"))) return;
                    cambiar(fotos.filter((g) => g.ruta !== f.ruta));
                    await crearClienteNavegador().storage.from("mapas-riesgo").remove([f.ruta]);
                  }}><X /></Button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Tarjeta>
  );
}

function Escala({ etiqueta, valor, nombres, editable, onChange }: { etiqueta: string; valor: number; nombres: string[]; editable: boolean; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium">{etiqueta}{valor > 0 && <span className="ml-1 font-normal text-muted-foreground">· {nombres[valor]}</span>}</div>
      <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label={etiqueta}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={valor === n} title={nombres[n]} disabled={!editable} onClick={() => onChange(n)}
            className={cn("h-9 rounded-lg border font-cifra text-sm font-semibold transition disabled:cursor-default", valor === n ? "border-primary bg-primary text-primary-foreground shadow-[0_4px_10px_-6px_var(--primary)]" : "hover:border-primary/60")}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function FilaEditor({ f, editable, cambiar, quitar }: { f: FilaRiesgo; editable: boolean; cambiar: (c: Partial<FilaRiesgo>) => void; quitar: () => void }) {
  const n = nivelFila(f);
  const [mas, setMas] = useState(false);
  return (
    <div className={cn("rounded-xl border p-3", !n && "border-aviso/60 bg-aviso/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <LetraGrupo g={f.grupo} />
        <span className="min-w-0 flex-1 font-medium">{f.agente}</span>
        {n ? <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", n.clase)}>{n.texto} · {n.n}</span> : <span className="text-xs font-medium text-aviso-texto">Falta valorar</span>}
        {editable && <Button variant="ghost" size="icon" className="size-8" aria-label={`Quitar ${f.agente}`} onClick={quitar}><X /></Button>}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Escala etiqueta="Probabilidad" valor={f.p} nombres={ESCALA_P} editable={editable} onChange={(p) => cambiar({ p, plazo: f.plazo || (nivelFila({ p, s: f.s })?.plazo ?? "") })} />
        <Escala etiqueta="Severidad" valor={f.s} nombres={ESCALA_S} editable={editable} onChange={(s) => cambiar({ s, plazo: f.plazo || (nivelFila({ p: f.p, s })?.plazo ?? "") })} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><Label className="mb-1 text-xs">Medida recomendada</Label><Textarea rows={2} disabled={!editable} value={f.medida} onChange={(e) => cambiar({ medida: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><Label className="mb-1 text-xs">Responsable</Label>
            <select className={SELECT} disabled={!editable} value={f.responsable} onChange={(e) => cambiar({ responsable: e.target.value as FilaRiesgo["responsable"] })}>{DEPARTAMENTOS.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}</select>
          </div>
          <div><Label className="mb-1 text-xs">Plazo</Label>
            <select className={SELECT} disabled={!editable} value={f.plazo || n?.plazo || ""} onChange={(e) => cambiar({ plazo: e.target.value })}><option value="">—</option>{PLAZOS.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          <div><Label className="mb-1 text-xs">Tipo de medida</Label>
            <select className={SELECT} disabled={!editable} value={f.tipoMedida} onChange={(e) => cambiar({ tipoMedida: e.target.value as FilaRiesgo["tipoMedida"] })}><option value="">—</option>{TIPOS_MEDIDA.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}</select>
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setMas(!mas)} className="mt-2 text-xs font-medium text-primary hover:underline">{mas ? "Menos detalles" : "Fuente, posible daño y controles existentes"}</button>
      {mas && (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><Label className="mb-1 text-xs">De dónde viene</Label><Input disabled={!editable} value={f.fuente} onChange={(e) => cambiar({ fuente: e.target.value })} placeholder="Máquina, sustancia, tarea…" /></div>
          <div><Label className="mb-1 text-xs">Posible daño a la salud</Label><Input disabled={!editable} value={f.efecto} onChange={(e) => cambiar({ efecto: e.target.value })} /></div>
          <div><Label className="mb-1 text-xs">Controles que ya existen</Label><Input disabled={!editable} value={f.controles} onChange={(e) => cambiar({ controles: e.target.value })} placeholder="Ej.: tapones, extractor" /></div>
        </div>
      )}
    </div>
  );
}

// ── Paso 4 ──
function PasoMapa({ x, set, editable, evId, orgId, planoInicial, demo }: ConSet & { evId: string; orgId: string; planoInicial: string | null; demo?: boolean }) {
  const [elegida, setElegida] = useState<string | null>(null);
  const [modo, setModo] = useState<"simbolo" | "area">("simbolo");
  const [textoArea, setTextoArea] = useState("");
  const [url, setUrl] = useState(planoInicial);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const enMapa = new Set(x.mapa.marcas.map((m) => m.filaId));
  const ordenadas = x.filas.map((f, i) => ({ f, i: i + 1, n: nivelFila(f) })).sort((a, b) => (b.n?.n ?? 0) - (a.n?.n ?? 0));
  const siguiente = (sin: string | null) => ordenadas.find(({ f }) => f.id !== sin && !enMapa.has(f.id))?.f.id ?? null;

  const tocar = (px: number, py: number) => {
    if (!editable) return;
    if (modo === "area") {
      if (!textoArea.trim()) { setAviso("Escribe primero el nombre del área."); return; }
      set("mapa", { ...x.mapa, areas: [...x.mapa.areas, { id: nuevoId(), x: px, y: py, texto: textoArea.trim().slice(0, 60) }] });
      setTextoArea(""); setAviso("");
      return;
    }
    const id = elegida ?? siguiente(null);
    if (!id) { setAviso("Todos los riesgos ya están en el mapa. Toca un símbolo para quitarlo y ubicarlo de nuevo."); return; }
    // Un símbolo por riesgo: si ya estaba, se mueve
    set("mapa", { ...x.mapa, marcas: [...x.mapa.marcas.filter((m) => m.filaId !== id), { id: nuevoId(), x: px, y: py, filaId: id }] });
    setElegida(siguiente(id));
    setAviso("");
  };

  const subir = async (lista: FileList | null) => {
    const original = lista?.[0];
    if (!original || demo) { if (demo) setAviso("Modo demo: el plano no se sube."); return; }
    setSubiendo(true); setAviso("");
    try {
      const supabase = crearClienteNavegador();
      const archivo = await prepararArchivo(original);
      // Carpeta de la evaluación: <org>/<evaluación>/<archivo> (la base revisa que sea de esta evaluación)
      const org = orgId;
      if (!org) throw new Error("No se pudo saber la organización.");
      const ruta = `${org}/${evId}/plano-${nuevoId()}.${archivo.type === "image/png" ? "png" : "jpg"}`;
      const { error } = await supabase.storage.from("mapas-riesgo").upload(ruta, archivo, { contentType: archivo.type });
      if (error) throw new Error(/fetch|network|offline|503/i.test(error.message) ? "El plano necesita internet. Mientras tanto puedes usar el croquis cuadriculado." : error.message);
      const viejo = x.mapa.plano;
      set("mapa", { ...x.mapa, plano: ruta });
      const { data: firmada } = await supabase.storage.from("mapas-riesgo").createSignedUrl(ruta, 3600);
      setUrl(firmada?.signedUrl ?? null);
      if (viejo) await supabase.storage.from("mapas-riesgo").remove([viejo]);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo subir el plano.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Tarjeta titulo="4. Mapa de riesgos" ayuda="Sube una foto o dibujo del plano (o usa el croquis cuadriculado). Elige un riesgo de la lista y toca el plano donde está. Los altos y críticos deben quedar ubicados.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-2">
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border p-0.5" role="radiogroup" aria-label="Qué poner en el mapa">
                <button type="button" role="radio" aria-checked={modo === "simbolo"} onClick={() => setModo("simbolo")} className={cn("inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm", modo === "simbolo" && "bg-primary text-primary-foreground")}><MapPin className="size-4" /> Riesgos</button>
                <button type="button" role="radio" aria-checked={modo === "area"} onClick={() => setModo("area")} className={cn("inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm", modo === "area" && "bg-primary text-primary-foreground")}><Type className="size-4" /> Nombres de áreas</button>
              </div>
              {modo === "area" && <Input value={textoArea} onChange={(e) => setTextoArea(e.target.value)} placeholder="Ej.: ALMACÉN — luego toca el plano" className="h-9 w-64" />}
              <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => subir(e.target.files)} />
              <Button variant="outline" size="sm" className="ml-auto" disabled={subiendo} onClick={() => entrada.current?.click()}>
                {subiendo ? <Loader2 className="animate-spin" /> : x.mapa.plano ? <Upload /> : <ImagePlus />} {x.mapa.plano ? "Cambiar plano" : "Subir plano"}
              </Button>
              {x.mapa.plano && <Button variant="ghost" size="sm" onClick={async () => { if (await confirmar("¿Quitar el plano y usar el croquis? Los símbolos se quedan donde están.")) { const r = x.mapa.plano; set("mapa", { ...x.mapa, plano: null }); setUrl(null); if (r && !demo) await crearClienteNavegador().storage.from("mapas-riesgo").remove([r]); } }}>Usar croquis</Button>}
            </div>
          )}
          <MapaRiesgos mapa={x.mapa} filas={x.filas} planoUrl={x.mapa.plano ? url : null} resaltar={elegida}
            onTocar={editable ? tocar : undefined}
            onTocarMarca={editable ? (id) => set("mapa", { ...x.mapa, marcas: x.mapa.marcas.filter((m) => m.id !== id) }) : undefined}
            onTocarArea={editable ? (id) => set("mapa", { ...x.mapa, areas: x.mapa.areas.filter((a) => a.id !== id) }) : undefined} />
          {x.mapa.plano && !url && <p className="text-xs text-muted-foreground">El plano se ve con internet; los símbolos se guardan igual.</p>}
          {aviso && <p className="text-sm text-aviso-texto">{aviso}</p>}
          <LeyendaMapa />
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">Riesgos ({x.mapa.marcas.length} de {x.filas.length} en el mapa)</div>
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
            {ordenadas.map(({ f, i, n }) => {
              const puesto = enMapa.has(f.id);
              const grave = (n?.n ?? 0) >= 10;
              return (
                <li key={f.id}>
                  <button type="button" disabled={!editable} onClick={() => { setModo("simbolo"); setElegida(f.id); }}
                    className={cn("flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition disabled:cursor-default", elegida === f.id ? "border-primary bg-primary/10" : "hover:bg-muted", !puesto && grave && "border-alerta/50")}>
                    <span className="w-5 text-right font-cifra text-xs text-muted-foreground">{i}</span>
                    <LetraGrupo g={f.grupo} chico />
                    <span className="min-w-0 flex-1"><span className="block truncate">{f.agente}</span><span className="block truncate text-[11px] text-muted-foreground">{f.puesto}{n && ` · ${n.texto}`}</span></span>
                    {puesto ? <Check className="size-4 text-ok-texto" /> : grave ? <span className="text-[10px] font-semibold text-alerta-texto">Ubicar</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {editable && <p className="mt-2 text-xs text-muted-foreground">Toca un símbolo del plano para quitarlo. Al poner uno, pasa solo al siguiente sin ubicar.</p>}
        </div>
      </div>
    </Tarjeta>
  );
}

// ── Paso 5 ──
function PasoResultados({ x, set, editable, cerrada, puedeEditar, ev }: ConSet & { cerrada: boolean; puedeEditar: boolean; ev: EvaluacionRiesgos }) {
  const r = resumen(x.filas);
  const expuestos = x.puestos.reduce((a, p) => a + (p.expuestos ?? 0), 0);
  const [obs, setObs] = useState(x.observaciones);
  const [guardando, iniciar] = useTransition();
  const [msj, setMsj] = useState("");
  // Conclusión propuesta a partir de los resultados; el evaluador la ajusta
  const propuesta = () => {
    const graves = x.filas.filter((f) => (nivelFila(f)?.n ?? 0) >= 10).sort((a, b) => (nivelFila(b)?.n ?? 0) - (nivelFila(a)?.n ?? 0));
    const grupos = r.porGrupo.sort((a, b) => b.n - a.n).slice(0, 3).map((g) => NOMBRE_GRUPO[g.grupo].toLowerCase());
    return [
      `Se identificaron ${x.filas.length} riesgos en ${x.puestos.length} puestos de trabajo, con ${expuestos} trabajadores expuestos. Predominan los riesgos ${grupos.join(", ")}.`,
      graves.length
        ? `Requieren acción prioritaria ${graves.length} riesgos altos o críticos: ${graves.slice(0, 5).map((f) => `${f.agente.toLowerCase()} en ${f.puesto}`).join("; ")}${graves.length > 5 ? "; entre otros" : ""}.`
        : "No se encontraron riesgos altos ni críticos.",
      "Se recomienda aplicar las medidas en el orden de prioridad de la tabla, informar por escrito a los trabajadores los riesgos de su puesto (LOPCYMAT art. 56.3) y repetir la identificación ante los cambios que indica la NT-04-2023 (art. 14.2.4).",
    ].join("\n\n");
  };
  return (
    <div className="space-y-4">
      <Tarjetas filas={x.filas} expuestos={expuestos} puestos={x.puestos.length} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Tarjeta titulo="Riesgos por grupo"><DonaGrupos filas={x.filas} /></Tarjeta>
        <Tarjeta titulo="Matriz probabilidad × severidad"><MatrizRiesgos filas={x.filas} /></Tarjeta>
      </div>
      <Tarjeta titulo="Riesgos por puesto y nivel" ayuda="Los puestos con más riesgo arriba."><BarrasPuestos filas={x.filas} /></Tarjeta>
      <Tarjeta titulo="Cada grupo de riesgo"><FichasGrupo filas={x.filas} /></Tarjeta>
      <Tarjeta titulo="5. Conclusión" ayuda="Sale en el informe. Puedes partir de la propuesta y ajustarla.">
        <Textarea rows={6} disabled={!editable} value={x.conclusion} onChange={(e) => set("conclusion", e.target.value)} placeholder="Qué se encontró, qué es lo más urgente y qué se recomienda." />
        {editable && <Button variant="outline" size="sm" className="mt-2" onClick={() => set("conclusion", propuesta())}><Sparkles /> Proponer conclusión</Button>}
      </Tarjeta>
      {cerrada && puedeEditar && (
        <Tarjeta titulo="Observaciones y seguimiento" ayuda="Lo único que cambia después de cerrar. Sale en el informe del servicio, no en el de la empresa.">
          <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" disabled={guardando || obs === x.observaciones} onClick={() => iniciar(async () => { const res = await guardarObservacionesRiesgos(ev.id, obs); setMsj(res.mensaje); if (res.ok) set("observaciones", obs); })}>Guardar observaciones</Button>
            {msj && <span className="text-xs text-muted-foreground">{msj}</span>}
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
