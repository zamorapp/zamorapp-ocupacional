"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileStack, Loader2, RefreshCw, ScanText, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Item } from "@/lib/listas";
import { agruparPorPaciente, cedulaLote, type GrupoPaciente } from "@/lib/ocr/interpretar";
import { esCancelado, extraerPaginas, leerResultado, MAX_BYTES, MAX_PAGINAS_LOTE, type Avance, type Pagina } from "@/lib/ocr/leer";
import { subirAdjunto } from "@/lib/preparar-archivo";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LectorLaboratorio } from "../[id]/lector-laboratorio";
import { consultasPorCedula, registrarResultadosLote, type Candidata } from "./acciones";

type Grupo = GrupoPaciente & { cedulaBuscada: string; candidatas: Candidata[]; elegida: string; registrado: number | null };

const hojas = (p: number[]) => (p.length === 1 ? `Hoja ${p[0]}` : `Hojas ${p[0]}–${p.at(-1)}`);
const fechaVe = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const ESTADO = { borrador: "abierta", cerrada: "cerrada", firmada: "firmada" } as Record<string, string>;

/** PDF del laboratorio con varios trabajadores: se lee una vez, se separa por cédula y cada grupo se revisa aparte. */
export function ResultadosLote({ catalogo, demo }: { catalogo: Item[]; demo: boolean }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [avance, setAvance] = useState<Avance | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [miniaturas, setMiniaturas] = useState<Pagina[]>([]);
  const [abierto, setAbierto] = useState<{ i: number; url: string } | null>(null);
  const control = useRef<AbortController | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const adjunto = useRef<string | null>(null);

  useEffect(() => () => miniaturas.forEach((p) => URL.revokeObjectURL(p.imagen)), [miniaturas]);

  const leer = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setGrupos([]);
    setMiniaturas([]);
    setArchivo(null);
    if (f.type !== "application/pdf") return setError("Sube el PDF del laboratorio. Para una foto suelta, usa «Leer resultados» dentro de la consulta.");
    if (f.size > MAX_BYTES) return setError("El archivo pasa de 15 MB.");
    const c = new AbortController();
    control.current = c;
    setArchivo(f);
    setAvance({ texto: "Abriendo el archivo…", paso: 0, total: 1 });
    try {
      const leido = await leerResultado(f, f.type, { avance: setAvance, senal: c.signal, maxPaginas: MAX_PAGINAS_LOTE });
      setMiniaturas(leido.paginas);
      const gs = agruparPorPaciente(leido.lineas, leido.paginas.map((p) => p.pagina));
      const encontradas = await consultasPorCedula(gs.map((g) => g.cedula).filter(Boolean));
      if (c.signal.aborted) return;
      setGrupos(gs.map((g) => conCandidatas({ ...g, cedulaBuscada: g.cedula, candidatas: [], elegida: "", registrado: null }, encontradas)));
    } catch (e) {
      if (!esCancelado(e) && !c.signal.aborted) setError((e as Error).message || "No se pudo leer el archivo.");
    } finally {
      setAvance(null);
    }
  };

  const conCandidatas = (g: Grupo, encontradas: Record<string, Candidata[]>): Grupo => {
    const candidatas = encontradas[cedulaLote(g.cedulaBuscada)] ?? [];
    return { ...g, candidatas, elegida: candidatas.some((c) => c.consultaId === g.elegida) ? g.elegida : "" };
  };

  // Hoja sin cédula legible o cédula mal leída: el médico escribe la correcta y se busca de nuevo
  const buscar = async (i: number, cedula: string) => {
    setError(null);
    const lecturaActual = control.current;
    const encontradas = await consultasPorCedula([cedula]).catch(() => null);
    if (control.current !== lecturaActual) return;
    if (!encontradas) { setError("No se pudo buscar esa cédula. Revisa la conexión."); return; }
    setGrupos((gs) => gs.map((g, j) => (j === i ? conCandidatas({ ...g, cedulaBuscada: cedula, elegida: "" }, encontradas) : g)));
  };

  const actualizar = async () => {
    setActualizando(true);
    setError(null);
    try {
      const encontradas = await consultasPorCedula(grupos.filter((x) => x.registrado === null).map((x) => x.cedulaBuscada).filter(Boolean));
      setGrupos((gs) => gs.map((x) => x.registrado !== null ? x : conCandidatas(x, encontradas)));
    } catch {
      setError("No se pudieron actualizar las consultas. Revisa la conexión.");
    } finally {
      setActualizando(false);
    }
  };

  const revisar = async (i: number) => {
    setError(null);
    if (!archivo) return;
    const lecturaActual = control.current;
    try {
      const sub = await extraerPaginas(archivo, grupos[i].paginas);
      if (control.current !== lecturaActual) return;
      adjunto.current = null;
      setAbierto({ i, url: URL.createObjectURL(sub) });
    } catch {
      setError("No se pudieron separar esas hojas del PDF.");
    }
  };
  const cerrar = () => { if (abierto) URL.revokeObjectURL(abierto.url); setAbierto(null); };

  const g = abierto ? grupos[abierto.i] : null;
  const consulta = g?.candidatas.find((c) => c.consultaId === g.elegida) ?? null;
  const pendientes = grupos.filter((x) => x.registrado === null).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:flex sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileStack className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium">{archivo ? archivo.name : "PDF del laboratorio"}</p>
              <p className="text-muted-foreground">Hasta {MAX_PAGINAS_LOTE} hojas y 15 MB. La lectura se hace en este equipo. Revisa cada hoja antes de registrarla.</p>
            </div>
          </div>
          <input ref={entrada} type="file" accept="application/pdf" className="hidden" onChange={(e) => { void leer(e.target.files?.[0]); e.target.value = ""; }} />
          <Button onClick={() => entrada.current?.click()} disabled={demo || Boolean(avance) || Boolean(abierto) || actualizando}><Upload /> {archivo ? "Subir otro PDF" : "Subir PDF"}</Button>
        </CardContent>
      </Card>

      {avance && (
        <div className="grid justify-items-center gap-3 rounded-lg border p-6 text-center" role="status" aria-live="polite">
          <Loader2 className="size-7 animate-spin text-primary" />
          <p className="text-sm font-medium">{avance.texto}</p>
          <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Avance de la lectura"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((avance.paso + 0.5) / Math.max(1, avance.total)) * 100)}>
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(((avance.paso + 0.5) / Math.max(1, avance.total)) * 100)}%` }} />
          </div>
          <Button variant="ghost" onClick={() => control.current?.abort()}>Cancelar</Button>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg border border-alerta/50 bg-alerta/10 p-3 text-sm text-alerta-texto">{error}</p>}

      {grupos.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {grupos.length} grupo{grupos.length === 1 ? "" : "s"} de hojas · {pendientes ? `${pendientes} por registrar` : "todos registrados"}
          </p>
          {pendientes > 0 && <Button variant="outline" size="sm" disabled={actualizando || Boolean(abierto)} onClick={actualizar}>
            {actualizando ? <Loader2 className="animate-spin" /> : <RefreshCw />} Actualizar consultas
          </Button>}
          <ul className="grid gap-3">
            {grupos.map((x, i) => {
              const c = x.candidatas.find((k) => k.consultaId === x.elegida);
              const mini = miniaturas.find((p) => p.pagina === x.paginas[0]);
              return (
                <li key={i} className={cn("grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center",
                  x.registrado !== null ? "border-ok/40 bg-ok/5" : !c ? "border-aviso/50" : "")}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura local (objectURL), no pasa por el optimizador */}
                  {mini ? <img src={mini.imagen} alt={`${hojas(x.paginas)} del PDF`} className="hidden h-24 w-[4.5rem] rounded border bg-white object-cover object-top sm:block" /> : <span className="hidden sm:block" />}
                  <div className="grid min-w-0 grid-cols-1 gap-1.5 text-sm">
                    <p className="font-medium">
                      {hojas(x.paginas)} · {c ? c.trabajador.nombre : x.nombre || "Paciente sin identificar"}
                      <span className="font-normal text-muted-foreground"> · C.I. {x.cedulaBuscada || "no leída"}</span>
                    </p>
                    {x.conflicto ? (
                      <p className="text-aviso-texto">Se detectaron varias cédulas en esta hoja. Revisa el original y prepara un archivo individual.</p>
                    ) : x.registrado !== null && c ? (
                      <p className="text-muted-foreground">Consulta del {fechaVe(c.fecha)}</p>
                    ) : x.candidatas.length ? (
                      <label className="grid min-w-0 grid-cols-1 gap-1.5 text-muted-foreground">
                        Consulta
                        <select value={x.elegida} disabled={x.registrado !== null || actualizando} onChange={(e) => setGrupos((gs) => gs.map((y, j) => (j === i ? { ...y, elegida: e.target.value } : y)))}
                          className="h-8 w-full min-w-0 max-w-full truncate rounded-md border bg-background px-2 text-foreground">
                          <option value="">Selecciona la consulta</option>
                          {x.candidatas.map((k) => <option key={k.consultaId} value={k.consultaId}>{k.trabajador.nombre} · {k.trabajador.cedula} · {fechaVe(k.fecha)} · {ESTADO[k.estado] ?? k.estado} · {k.pendientes} pendiente{k.pendientes === 1 ? "" : "s"}</option>)}
                        </select>
                      </label>
                    ) : (
                      <div className="space-y-2">
                        {mini && <a className="underline underline-offset-2" href={mini.imagen} target="_blank" rel="noopener noreferrer">Ver la hoja para confirmar la cédula</a>}
                        <BuscarCedula inicial={x.cedulaBuscada} onBuscar={(v) => buscar(i, v)} />
                      </div>
                    )}
                    {c?.estado === "borrador" && x.registrado === null && <p className="text-xs text-aviso-texto">La consulta está abierta: se registra desde la consulta para no pisar lo que se esté escribiendo.</p>}
                    {c?.estado === "firmada" && x.registrado === null && <p className="text-xs text-aviso-texto">La consulta está firmada: para cambiar resultados hay que «Corregir» desde la consulta.</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {x.registrado !== null ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-ok-texto"><CheckCircle2 className="size-4" /> {x.registrado} registrado{x.registrado === 1 ? "" : "s"}</span>
                    ) : c && c.estado === "cerrada" ? (
                      <Button size="sm" disabled={actualizando} onClick={() => revisar(i)}><ScanText /> Revisar y registrar</Button>
                    ) : c ? (
                      <Button size="sm" variant="outline" asChild><Link href={`/atencion/${c.consultaId}?paso=paraclinicos`}>Abrir la consulta</Link></Button>
                    ) : !x.conflicto && !x.candidatas.length ? (
                      <span className="inline-flex items-center gap-1 text-xs text-aviso-texto"><AlertTriangle className="size-3.5" /> Sin consulta con exámenes</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {abierto && g && consulta && archivo && (
        <LectorLaboratorio
          archivo={{ id: "", nombre: `${archivo.name.replace(/\.pdf$/i, "")} · ${hojas(g.paginas).toLowerCase()}`, url: abierto.url, tipo: "application/pdf" }}
          consultaId={consulta.consultaId}
          paraclinicos={consulta.paraclinicos}
          catalogo={catalogo}
          sexo={consulta.trabajador.sexo}
          paciente={{ cedula: consulta.trabajador.cedula, nombre: consulta.trabajador.nombre }}
          puedeAgregar={false}
          maxPaginas={MAX_PAGINAS_LOTE}
          registrarLote={async (r, identidad) => {
            if (!adjunto.current) {
              const blob = await (await fetch(abierto.url)).blob();
              const nombre = "laboratorio-hojas-" + g.paginas.join("-") + ".pdf";
              const a = await subirAdjunto(crearClienteNavegador(), {
                orgId: consulta.orgId, trabajadorId: consulta.trabajador.id, consultaId: consulta.consultaId, examenes: r.examenes,
              }, new File([blob], nombre, { type: "application/pdf" }));
              adjunto.current = a.id;
            }
            await registrarResultadosLote(consulta.consultaId, adjunto.current, consulta.paraclinicos,
              r.paraclinicos.filter((p) => r.examenes.includes(p.id)), identidad);
          }}
          onRegistrar={(r) => {
            setGrupos((gs) => gs.map((y, j) => (j === abierto.i ? { ...y, registrado: r.examenes.length } : y)));
            cerrar();
          }}
          onCerrar={cerrar}
        />
      )}
    </div>
  );
}

function BuscarCedula({ inicial, onBuscar }: { inicial: string; onBuscar: (v: string) => Promise<void> }) {
  const [v, setV] = useState(inicial);
  const [buscando, setBuscando] = useState(false);
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); setBuscando(true); await onBuscar(v); setBuscando(false); }}>
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Cédula del paciente" aria-label="Cédula del paciente" maxLength={20} className="h-8 w-44" />
      <Button type="submit" size="sm" variant="outline" disabled={buscando || !cedulaLote(v)}>
        {buscando ? <Loader2 className="animate-spin" /> : <Search />} Buscar
      </Button>
    </form>
  );
}
