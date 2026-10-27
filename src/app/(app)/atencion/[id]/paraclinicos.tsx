"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ExternalLink, FileImage, FileText, Loader2, Paperclip, RotateCcw, RotateCw, Save, Trash2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmar } from "@/components/app/confirmar";
import { COLUMNAS_ADJUNTO, TIPOS_ADJUNTO, type Adjunto } from "@/lib/adjuntos-tipos";
import type { Paraclinico } from "@/lib/consultas-tipos";
import type { Item } from "@/lib/listas";
import { contarResultados, defExamen, ESTILO_RESULTADO, ETIQUETA_RESULTADO, estadoCalculado, pendiente, plural, textoReferencia, type DefExamen, type EstadoResultado } from "@/lib/paraclinicos";
import { subirAdjunto } from "@/lib/preparar-archivo";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// editar: consulta en curso (se agregan y quitan exámenes); resultados: cerrada (solo resultados y archivos);
// lectura: firmada (resultados bloqueados; los archivos se pueden seguir ligando a sus exámenes)
export type ModoParaclinicos = "editar" | "resultados" | "lectura";

type Props = {
  paraclinicos: Paraclinico[];
  onChange: (p: Paraclinico[]) => void;
  modo: ModoParaclinicos;
  catalogo: Item[];
  sexo: string | null;
  archivos: { orgId: string; trabajadorId: string; consultaId: string; lista: Adjunto[] } | null;
  // Antes de ligar un archivo, los exámenes nuevos tienen que estar guardados en la consulta (lo exige la base)
  asegurarGuardado: () => Promise<boolean>;
  resultados?: { sinGuardar: boolean; guardando: boolean; guardar: () => void };
};

const ARRASTRE = "application/x-zamorapp-adjunto";
const SIN_DEF: DefExamen = { tipo: "numero", unidad: "", min: null, max: null, minF: null, maxF: null };
const CICLO: EstadoResultado[] = ["normal", "fuera", "alterado"];
const tamano = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const esPdf = (a: Adjunto) => a.tipo_mime === "application/pdf";

/** Paraclínicos de la consulta: resultados con semáforo, archivos ligados a cada examen y visor. */
export function ParaclinicosDigitales({ paraclinicos, onChange, modo, catalogo, sexo, archivos, asegurarGuardado, resultados }: Props) {
  const defs = useMemo(() => new Map(catalogo.map((i) => [i.id, defExamen(i.datos)])), [catalogo]);
  const def = useCallback((id: string) => defs.get(id) ?? SIN_DEF, [defs]);
  const editableResultado = modo !== "lectura";

  const [lista, setLista] = useState<Adjunto[]>(archivos?.lista ?? []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [ver, setVer] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);

  const deConsulta = lista.filter((a) => archivos && a.consulta_id === archivos.consultaId);
  const sinAsignar = deConsulta.filter((a) => !a.examenes.length);
  const anteriores = lista.filter((a) => !archivos || a.consulta_id !== archivos.consultaId);
  const actual = lista.find((a) => a.id === ver) ?? deConsulta[0] ?? null;
  const conteo = contarResultados(paraclinicos);

  // URLs firmadas de 10 minutos (el bucket es privado): una sola llamada para los archivos de la consulta
  const firmar = useCallback(async (aa: Adjunto[]) => {
    const faltan = aa.filter((a) => !urls[a.id]);
    if (!faltan.length) return;
    const { data } = await crearClienteNavegador().storage.from("adjuntos").createSignedUrls(faltan.map((a) => a.ruta), 600);
    const porRuta = new Map((data ?? []).map((f) => [f.path, f.signedUrl]));
    setUrls((u) => ({ ...u, ...Object.fromEntries(faltan.map((a) => [a.id, porRuta.get(a.ruta) ?? ""]).filter(([, v]) => v)) }));
  }, [urls]);
  const idsConsulta = deConsulta.map((a) => a.id).join(",");
  useEffect(() => { void firmar(deConsulta); }, [idsConsulta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (actual) void firmar([actual]); }, [actual?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setZoom(1); setGiro(0); }, [actual?.id]);

  // ── Resultados ──
  const recalcular = (p: Paraclinico): Paraclinico => {
    const dx = def(p.id);
    const estado = p.manual || dx.tipo === "informe" ? p.estado ?? "" : estadoCalculado(p.resultado, dx, sexo);
    return { ...p, estado, unidad: dx.unidad || p.unidad || "", referencia: textoReferencia(dx, sexo) || p.referencia || "" };
  };
  const cambiar = (id: string, cambio: Partial<Paraclinico>) => onChange(paraclinicos.map((x) => (x.id === id ? recalcular({ ...x, ...cambio }) : x)));
  const cicloManual = (p: Paraclinico) => {
    const i = CICLO.indexOf(p.estado ?? "");
    cambiar(p.id, { estado: CICLO[(i + 1) % CICLO.length], manual: true });
  };

  // ── Archivos ──
  const reemplazar = (a: Adjunto) => setLista((l) => l.map((x) => (x.id === a.id ? a : x)));
  const subir = async (files: FileList | File[] | null, examen?: string) => {
    if (!archivos || !files || !files.length) return;
    setOcupado(true);
    setError(null);
    if (examen && modo === "editar" && !(await asegurarGuardado())) { setOcupado(false); return; }
    const supabase = crearClienteNavegador();
    let ultimo: Adjunto | null = null;
    for (const f of Array.from(files)) {
      try {
        ultimo = await subirAdjunto(supabase, { orgId: archivos.orgId, trabajadorId: archivos.trabajadorId, consultaId: archivos.consultaId, examenes: examen ? [examen] : [] }, f);
        const nuevo = ultimo;
        setLista((l) => [nuevo, ...l]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (ultimo) setVer(ultimo.id);
    if (entrada.current) entrada.current.value = "";
    if (camara.current) camara.current.value = "";
    setOcupado(false);
  };

  const cambiarExamenes = async (a: Adjunto, examenes: string[]) => {
    setError(null);
    if (modo === "editar" && !(await asegurarGuardado())) return;
    const { data, error: e } = await crearClienteNavegador().from("adjuntos").update({ examenes }).eq("id", a.id).select(COLUMNAS_ADJUNTO).single();
    if (e) return setError(e.message);
    reemplazar(data as unknown as Adjunto);
  };
  const ligar = async (archivoId: string, examen: string) => {
    const a = lista.find((x) => x.id === archivoId);
    setElegido(null);
    if (!a || a.examenes.includes(examen)) return;
    // Un archivo de otra consulta no se liga aquí: se sube de nuevo en esta
    if (a.consulta_id !== archivos?.consultaId) return setError("Ese archivo es de otra consulta: descárgalo y súbelo en esta si corresponde.");
    await cambiarExamenes(a, [...a.examenes, examen]);
    setVer(a.id);
  };

  const borrar = async (a: Adjunto) => {
    if (!(await confirmar({ titulo: `¿Borrar «${a.nombre}»?`, texto: "El archivo se elimina y no se puede recuperar.", accion: "Borrar", peligro: true }))) return;
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("adjuntos").delete().eq("id", a.id);
    if (e) return setError(e.message);
    await supabase.storage.from("adjuntos").remove([a.ruta]);
    setLista((l) => l.filter((x) => x.id !== a.id));
    if (ver === a.id) setVer(null);
  };

  // Arrastrar: un archivo de «Sin asignar» a un examen, o archivos del equipo a la zona o directo a un examen
  const alSoltar = (e: React.DragEvent, examen?: string) => {
    e.preventDefault();
    setSobre(null);
    const id = e.dataTransfer.getData(ARRASTRE);
    if (id && examen) return void ligar(id, examen);
    if (e.dataTransfer.files.length) void subir(e.dataTransfer.files, examen);
  };
  const alPasar = (e: React.DragEvent, clave: string) => { if (archivos) { e.preventDefault(); setSobre(clave); } };

  const nombreExamen = (id: string) => paraclinicos.find((p) => p.id === id)?.nombre ?? "examen ya no solicitado";
  const ligadosA = (id: string) => deConsulta.filter((a) => a.examenes.includes(id));

  const grupos = useMemo(() => {
    const g = new Map<string, Paraclinico[]>();
    for (const p of paraclinicos) g.set(p.grupo ?? "Otros", [...(g.get(p.grupo ?? "Otros") ?? []), p]);
    return [...g.entries()];
  }, [paraclinicos]);

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Resumen del semáforo */}
      {paraclinicos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {conteo.normales > 0 && <span className="rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-semibold text-ok-texto">{plural(conteo.normales, "normal", "normales")}</span>}
          {conteo.alterados > 0 && <span className="rounded-full bg-alerta/15 px-2.5 py-0.5 text-xs font-semibold text-alerta-texto">{conteo.alterados} fuera de rango</span>}
          {conteo.pendientes > 0
            ? <span className="rounded-full bg-aviso/20 px-2.5 py-0.5 text-xs font-semibold text-aviso-texto">Faltan {plural(conteo.pendientes, "resultado", "resultados")}</span>
            : <span className="rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-semibold text-ok-texto">Resultados completos</span>}
          {resultados && (
            <Button size="sm" className="ml-auto" onClick={resultados.guardar} disabled={!resultados.sinGuardar || resultados.guardando}>
              {resultados.guardando ? <Loader2 className="animate-spin" /> : <Save />} {resultados.sinGuardar ? "Guardar resultados" : "Resultados guardados"}
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-1 gap-3">
          {archivos && (
            <>
              <div
                onDragOver={(e) => alPasar(e, "zona")}
                onDragLeave={() => setSobre(null)}
                onDrop={(e) => alSoltar(e)}
                className={cn("grid justify-items-center gap-3 rounded-xl border-[1.5px] border-dashed bg-accent/50 p-4 text-center transition", sobre === "zona" ? "border-primary bg-accent" : "border-input")}
              >
                {ocupado ? <Loader2 className="size-7 animate-spin text-primary" /> : <Upload className="size-7 text-primary" />}
                <div>
                  <b className="font-semibold">Suelta aquí los resultados</b>
                  <div className="text-xs text-muted-foreground">PDF o fotos, varios a la vez. Luego arrástralos al examen que corresponde.</div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <input ref={entrada} type="file" multiple accept={TIPOS_ADJUNTO} className="hidden" onChange={(e) => subir(e.target.files)} />
                  <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => subir(e.target.files)} />
                  <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => entrada.current?.click()}><Upload /> Elegir archivos</Button>
                  <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => camara.current?.click()}><Camera /> Tomar foto</Button>
                </div>
                <p className="text-xs text-muted-foreground">«Tomar foto» abre la cámara en el teléfono o la tablet. Del escáner: guarda el PDF y suéltalo aquí. Hasta 10 MB; las fotos se comprimen y pierden los datos de ubicación.</p>
              </div>

              <Card className="gap-2 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Sin asignar</h3>
                  <span className="text-xs text-muted-foreground">Arrástralos a un examen, o tócalos y luego toca el clip del examen</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {sinAsignar.length ? sinAsignar.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData(ARRASTRE, a.id)}
                      onClick={() => { setElegido(elegido === a.id ? null : a.id); setVer(a.id); }}
                      className={cn("inline-flex max-w-full cursor-grab items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs", elegido === a.id && "border-primary ring-2 ring-primary/25")}
                    >
                      {esPdf(a) ? <FileText className="size-4 shrink-0 text-primary" /> : <FileImage className="size-4 shrink-0 text-primary" />}
                      <span className="truncate">{a.nombre}</span>
                    </button>
                  )) : <span className="text-xs text-muted-foreground">{deConsulta.length ? "Todo está ligado a su examen." : "Aún no hay archivos en esta consulta."}</span>}
                </div>
              </Card>
            </>
          )}
          {error && <p className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">{error}</p>}

          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <h2 className="font-semibold">Solicitados ({paraclinicos.length})</h2>
              <span className="text-xs text-muted-foreground">El color sale del rango del examen. Tócalo para cambiarlo a mano.</span>
            </div>
            {paraclinicos.length === 0 && <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">Elige exámenes del catálogo.</p>}
            {grupos.map(([grupo, items]) => (
              <div key={grupo}>
                <div className="bg-muted px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{grupo}</div>
                {items.map((p) => {
                  const dx = def(p.id);
                  const st: EstadoResultado = p.estado ?? "";
                  const ref = textoReferencia(dx, sexo) || p.referencia;
                  const ligados = ligadosA(p.id);
                  const etiqueta = st === "" && !pendiente(p) ? "Registrado" : ETIQUETA_RESULTADO[st];
                  return (
                    <div
                      key={p.id}
                      onDragOver={(e) => alPasar(e, p.id)}
                      onDragLeave={() => setSobre(null)}
                      onDrop={(e) => alSoltar(e, p.id)}
                      className={cn(
                        "grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 border-t px-4 py-2.5 sm:grid-cols-[0.75rem_minmax(0,1fr)_minmax(6.5rem,11rem)_auto_auto]",
                        sobre === p.id && "bg-accent",
                      )}
                    >
                      <span className={cn("size-2.5 rounded-full", ESTILO_RESULTADO[st].punto)} title={etiqueta} />
                      <div className="min-w-0">
                        <b className="block leading-tight font-medium break-words">{p.nombre}</b>
                        <span className="text-xs text-muted-foreground">
                          {dx.tipo === "informe" ? "Informe del especialista" : ref ? <>Ref. <span className="font-mono tabular-nums">{ref}</span> {dx.unidad || p.unidad}</> : "Sin rango en el catálogo"}
                        </span>
                      </div>
                      <div className="col-span-2 col-start-2 row-start-2 flex items-center gap-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto">
                        {dx.tipo === "informe" ? (
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            <div className="inline-flex overflow-hidden rounded-md border border-input" role="group" aria-label={`Resultado de ${p.nombre}`}>
                              {(["normal", "alterado"] as const).map((x) => (
                                <button
                                  key={x}
                                  type="button"
                                  disabled={!editableResultado}
                                  aria-pressed={st === x}
                                  onClick={() => cambiar(p.id, { estado: st === x ? "" : x, manual: false })}
                                  className={cn("px-2 py-1 text-xs disabled:opacity-60", st === x && "bg-primary text-primary-foreground")}
                                >
                                  {x === "normal" ? "Normal" : "Alterado"}
                                </button>
                              ))}
                            </div>
                            <input
                              value={p.resultado}
                              disabled={!editableResultado}
                              placeholder="Hallazgo (opcional)"
                              aria-label={`Hallazgo de ${p.nombre}`}
                              onChange={(e) => cambiar(p.id, { resultado: e.target.value })}
                              className="h-8 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                            />
                          </div>
                        ) : (
                          <label className="flex h-8 min-w-0 flex-1 items-center overflow-hidden rounded-md border border-input bg-card focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20">
                            <input
                              value={p.resultado}
                              disabled={!editableResultado}
                              inputMode="decimal"
                              placeholder="—"
                              aria-label={`Resultado de ${p.nombre}`}
                              onChange={(e) => cambiar(p.id, { resultado: e.target.value, manual: false })}
                              className="w-full min-w-0 bg-transparent px-2 text-right font-mono text-sm tabular-nums outline-none disabled:opacity-60"
                            />
                            {(dx.unidad || p.unidad) && <span className="pr-2 text-xs whitespace-nowrap text-muted-foreground">{dx.unidad || p.unidad}</span>}
                          </label>
                        )}
                      </div>
                      <span className="hidden items-center gap-1 sm:flex">
                        <button
                          type="button"
                          disabled={!editableResultado || pendiente(p)}
                          onClick={() => cicloManual(p)}
                          title={pendiente(p) ? "Escribe el resultado" : "Cambiar a mano"}
                          className={cn("rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", ESTILO_RESULTADO[st].pildora)}
                        >
                          {etiqueta}
                        </button>
                        {p.manual && editableResultado && (
                          <button type="button" title="Volver al color del rango" aria-label="Volver al color del rango" className="text-muted-foreground hover:text-foreground" onClick={() => cambiar(p.id, { manual: false })}>
                            <RotateCcw className="size-3.5" />
                          </button>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        {archivos && (
                          <button
                            type="button"
                            onClick={() => (elegido ? void ligar(elegido, p.id) : ligados.length ? setVer(ligados[0].id) : setError("Toca primero un archivo de «Sin asignar» o arrástralo a este examen."))}
                            aria-label={ligados.length ? `Ver archivo de ${p.nombre}` : `Ligar archivo a ${p.nombre}`}
                            className={cn("inline-flex items-center gap-1 rounded-md p-1 text-xs hover:bg-muted", ligados.length || elegido ? "font-semibold text-primary" : "text-muted-foreground")}
                          >
                            <Paperclip className="size-4" />{ligados.length || ""}
                          </button>
                        )}
                        {modo === "editar" && (
                          <button type="button" aria-label={`Quitar ${p.nombre}`} className="p-1 text-muted-foreground hover:text-destructive" onClick={() => onChange(paraclinicos.filter((x) => x.id !== p.id))}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </Card>
          {modo === "lectura" && paraclinicos.length > 0 && (
            <p className="text-xs text-muted-foreground">La consulta está firmada: para cambiar un resultado usa «Corregir». Los archivos sí se pueden seguir ligando.</p>
          )}
        </div>

        {/* Visor */}
        {archivos && (
          <Card className="gap-0 overflow-hidden py-0 lg:sticky lg:top-44">
            {actual ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
                  {esPdf(actual) ? <FileText className="size-4 text-muted-foreground" /> : <FileImage className="size-4 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-medium">{actual.nombre}</b>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {actual.consulta_id !== archivos.consultaId ? (
                        <span>De otra fecha · {actual.creado_en.slice(0, 10).split("-").reverse().join("/")} · {tamano(actual.tamano)}</span>
                      ) : actual.examenes.length ? (
                        <>Ligado a: {actual.examenes.map((x) => (
                          <span key={x} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-px">
                            {nombreExamen(x)}
                            <button type="button" aria-label={`Quitar de ${nombreExamen(x)}`} onClick={() => cambiarExamenes(actual, actual.examenes.filter((y) => y !== x))}><X className="size-3" /></button>
                          </span>
                        ))}</>
                      ) : <span>Sin ligar a un examen</span>}
                    </div>
                  </div>
                  {!esPdf(actual) && (
                    <>
                      <Button size="icon" variant="ghost" className="size-8" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}><ZoomOut /></Button>
                      <Button size="icon" variant="ghost" className="size-8" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}><ZoomIn /></Button>
                      <Button size="icon" variant="ghost" className="size-8" aria-label="Girar" onClick={() => setGiro((g) => (g + 90) % 360)}><RotateCw /></Button>
                    </>
                  )}
                  {urls[actual.id] && (
                    <Button size="icon" variant="ghost" className="size-8" asChild>
                      <a href={urls[actual.id]} target="_blank" rel="noreferrer" aria-label="Abrir en otra pestaña"><ExternalLink /></a>
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Borrar archivo" onClick={() => borrar(actual)}><Trash2 /></Button>
                </div>
                <div className="grid min-h-[26rem] place-items-center overflow-auto bg-muted p-3">
                  {!urls[actual.id] ? (
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  ) : esPdf(actual) ? (
                    <iframe src={`${urls[actual.id]}#view=FitH`} title={actual.nombre} className="h-[65vh] w-full rounded bg-white" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[actual.id]} alt={actual.nombre} style={{ transform: `scale(${zoom}) rotate(${giro}deg)` }} className="max-h-[65vh] max-w-full rounded shadow-sm transition-transform" />
                  )}
                </div>
              </>
            ) : (
              <div className="grid min-h-[20rem] place-items-center p-6 text-center text-sm text-muted-foreground">
                <div className="grid justify-items-center gap-2"><FileText className="size-8" /> Los resultados que subas se ven aquí, sin descargarlos.</div>
              </div>
            )}
            {deConsulta.length + anteriores.length > 0 && (
              <div className="grid gap-2 border-t px-3 py-2.5">
                <div className="flex gap-2 overflow-x-auto">
                  {deConsulta.map((a) => <Miniatura key={a.id} a={a} url={urls[a.id]} activa={actual?.id === a.id} onClick={() => setVer(a.id)} />)}
                </div>
                {anteriores.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Archivos de otras fechas ({anteriores.length})</summary>
                    <ul className="mt-1.5 divide-y rounded-md border">
                      {anteriores.map((a) => (
                        <li key={a.id}>
                          <button type="button" onClick={() => setVer(a.id)} className={cn("flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted", actual?.id === a.id && "bg-accent")}>
                            <span className="min-w-0 flex-1 truncate">{a.nombre}</span>
                            <span className="shrink-0 text-muted-foreground">{a.creado_en.slice(0, 10).split("-").reverse().join("/")}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function Miniatura({ a, url, activa, onClick }: { a: Adjunto; url?: string; activa: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} draggable onDragStart={(e) => e.dataTransfer.setData(ARRASTRE, a.id)} className="grid w-16 flex-none justify-items-center gap-1 text-[11px] text-muted-foreground" aria-current={activa}>
      <span className={cn("grid h-14 w-11 place-items-center overflow-hidden rounded border bg-white", activa && "outline-2 outline-offset-1 outline-primary")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {!esPdf(a) && url ? <img src={url} alt="" className="size-full object-cover" /> : <FileText className="size-5 text-alerta-texto" />}
      </span>
      <span className="max-w-16 truncate">{a.nombre}</span>
      {a.examenes.length > 0 && <span className="sr-only">ligado</span>}
    </button>
  );
}
