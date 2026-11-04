"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, CloudOff, Lock, Loader2, Plus, Printer, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CLASE_URGENCIA, DEPARTAMENTOS, METODOS, NOMBRE_METODO, PLAZOS, ordenarHallazgos, prioridad, proponerHallazgos,
  type Departamento, type Hallazgo, type Metodo,
} from "@/lib/ergonomia";
import type { Evaluacion, Foto } from "@/lib/ergonomia-datos";
import { ESCALA_P, ESCALA_S } from "@/lib/puestos-tipos";
import { prepararArchivo } from "@/lib/preparar-archivo";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { borrarEvaluacion, guardarEvaluacion, guardarObservaciones, reabrirEvaluacion, type Cambios } from "../acciones";

const SELECT = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const nuevoId = () => crypto.randomUUID().slice(0, 8);

type Props = { ev: Evaluacion; orgId: string; demo?: boolean; puedeEditar: boolean; puedeReabrir: boolean };

export function EditorErgonomia({ ev, orgId, demo, puedeEditar, puedeReabrir }: Props) {
  const router = useRouter();
  const metodo: Metodo | null = ev.metodo === "rula" || ev.metodo === "reba" ? METODOS[ev.metodo] : null;
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
        const r = await guardarEvaluacion(ev.id, ev.metodo, x);
        if (n === vuelta.current) setEstado(r.ok ? { tipo: "ok", texto: "Guardado" } : { tipo: "error", texto: r.mensaje });
      } catch {
        if (n === vuelta.current) setEstado({ tipo: "error", texto: "No se pudo guardar (¿sin conexión?). Tus cambios siguen aquí: se guardan al volver la conexión con cualquier cambio o con «Guardar»." });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [x, editable, demo, ev.id, ev.metodo]);

  const responder = (clave: string, valor: number) => set("datos", { ...x.datos, [clave]: valor });

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
          <div className="sm:col-span-2"><Label className="mb-1.5">Puesto</Label><Input disabled={!editable} value={x.puesto} onChange={(e) => set("puesto", e.target.value)} /></div>
          <div><Label className="mb-1.5">Fecha</Label><Input type="date" disabled={!editable} value={x.fecha} onChange={(e) => set("fecha", e.target.value)} /></div>
          <div>
            <Label className="mb-1.5">Lado evaluado</Label>
            <select disabled={!editable} value={x.lado ?? ""} onChange={(e) => set("lado", (e.target.value || null) as Cambios["lado"])} className={SELECT}>
              <option value="">—</option><option value="derecho">Derecho</option><option value="izquierdo">Izquierdo</option><option value="ambos">Ambos</option>
            </select>
          </div>
          <div className="sm:col-span-3"><Label className="mb-1.5">Tarea observada</Label><Input disabled={!editable} value={x.tarea} onChange={(e) => set("tarea", e.target.value)} /></div>
          <div><Label className="mb-1.5">Trabajadores expuestos</Label><Input type="number" min={0} disabled={!editable} value={x.trabajadoresObservados ?? ""} onChange={(e) => set("trabajadoresObservados", e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))))} /></div>
        </section>

        <Fotos evId={ev.id} orgId={orgId} fotos={x.fotos} editable={editable} onCambio={(f) => set("fotos", f)} />

        {/* Método */}
        {metodo && (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{metodo.nombre}</h2>
              <p className="text-xs text-muted-foreground">Marca la postura más exigente o la que más se repite. Fuente: {metodo.fuente}</p>
            </div>
            {metodo.secciones.map((s) => (
              <div key={s.titulo} className="rounded-xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-medium">{s.titulo}</h3>
                  {resultado?.zonas[s.zona] !== undefined && <span className="font-cifra text-xs text-muted-foreground">zona: {resultado.zonas[s.zona]}</span>}
                </div>
                <div className="space-y-3">
                  {s.preguntas.map((p) => {
                    const actual = x.datos[p.clave];
                    const binaria = p.opciones.length === 2 && p.opciones[0].valor === 0 && p.opciones[0].texto === "No";
                    return (
                      <div key={p.clave} className={cn(binaria ? "flex flex-wrap items-center justify-between gap-2" : "space-y-1.5")}>
                        <div className="text-sm">{p.texto}</div>
                        <div className={cn("flex flex-wrap gap-1.5", !binaria && "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4")} role="radiogroup" aria-label={p.texto}>
                          {p.opciones.map((o) => {
                            const elegido = actual === o.valor || (actual === undefined && binaria && o.valor === 0);
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
                                <span className="block">{o.texto}{!binaria && <span className={cn("ml-1 font-cifra text-xs", elegido ? "opacity-80" : "text-muted-foreground")}>+{o.valor}</span>}</span>
                                {o.detalle && <span className={cn("block text-xs", elegido ? "opacity-80" : "text-muted-foreground")}>{o.detalle}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Hallazgos */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Riesgos y recomendaciones</h2>
              <p className="text-xs text-muted-foreground">Cada hallazgo va a un departamento. La prioridad sale de probabilidad × severidad (matriz 5×5).</p>
            </div>
            {editable && (
              <div className="flex flex-wrap gap-2">
                {metodo && <Button variant="outline" size="sm" onClick={proponer}><Sparkles /> Proponer desde el resultado</Button>}
                <Button variant="outline" size="sm" onClick={() => set("hallazgos", [...x.hallazgos, { id: nuevoId(), factor: "", detalle: "", p: 0, s: 0, consecuencia: "", medida: "", departamento: "ingenieria", plazo: "", origen: "manual" }])}><Plus /> Agregar</Button>
              </div>
            )}
          </div>
          {ordenados.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Sin hallazgos todavía.{metodo ? " Marca las posturas y pulsa «Proponer desde el resultado»." : ""}</p>}
          {ordenados.map((h) => {
            const pr = prioridad(h);
            return (
              <div key={h.id} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-start gap-2">
                  <Input disabled={!editable} value={h.factor} placeholder="Factor de riesgo (ej.: brazos elevados)" onChange={(e) => cambiarHallazgo(h.id, { factor: e.target.value })} className="font-medium" />
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium", pr ? pr.clase : "bg-muted text-muted-foreground")}>{pr ? `${pr.texto} (${pr.n})` : "Sin valorar"}</span>
                  {editable && <button type="button" aria-label="Quitar hallazgo" className="mt-2 text-muted-foreground hover:text-destructive" onClick={() => set("hallazgos", x.hallazgos.filter((y) => y.id !== h.id))}><X className="size-4" /></button>}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <select aria-label="Probabilidad" disabled={!editable} value={h.p} onChange={(e) => cambiarHallazgo(h.id, { p: Number(e.target.value) })} className={SELECT}>
                    <option value={0}>Probabilidad</option>
                    {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>P{i} · {ESCALA_P[i]}</option>)}
                  </select>
                  <select aria-label="Severidad" disabled={!editable} value={h.s} onChange={(e) => cambiarHallazgo(h.id, { s: Number(e.target.value) })} className={SELECT}>
                    <option value={0}>Severidad</option>
                    {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>S{i} · {ESCALA_S[i]}</option>)}
                  </select>
                  <select aria-label="Departamento" disabled={!editable} value={h.departamento} onChange={(e) => cambiarHallazgo(h.id, { departamento: e.target.value as Departamento })} className={SELECT}>
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
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {resultado && (
          <div className="rounded-xl border p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{NOMBRE_METODO[ev.metodo]}</div>
            <div className="mt-2 flex items-end gap-2">
              <span className="font-cifra text-5xl font-semibold leading-none">{resultado.completo ? resultado.puntaje : "—"}</span>
              <span className="pb-1 text-sm text-muted-foreground">de {resultado.maximo}</span>
            </div>
            {resultado.completo ? (
              <>
                <div className={cn("mt-3 rounded-lg px-3 py-2 text-sm font-medium", CLASE_URGENCIA[resultado.urgencia])}>{resultado.nivel}</div>
                <p className="mt-2 text-sm">{resultado.accion}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Marca todas las posturas para ver el resultado.</p>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground">Cómo se calculó</summary>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
                {resultado.parciales.map((p) => (<div key={p.etiqueta} className="contents"><dt className="text-muted-foreground">{p.etiqueta}</dt><dd className="text-right font-cifra">{p.valor}</dd></div>))}
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
              <Button className="w-full" disabled={ocupado} onClick={() => accion(() => guardarEvaluacion(ev.id, ev.metodo, x))}>{ocupado && <Loader2 className="animate-spin" />} Guardar</Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={ocupado}
                onClick={async () => {
                  if (!(await confirmar({ titulo: "¿Cerrar la evaluación?", texto: "Queda como informe entregado: ya no se cambia (solo las observaciones). Un administrador o el gerente médico pueden reabrirla.", accion: "Cerrar evaluación" }))) return;
                  accion(() => guardarEvaluacion(ev.id, ev.metodo, x, true));
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

