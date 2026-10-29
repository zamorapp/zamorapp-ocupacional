"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Eye, Loader2, ScanText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Paraclinico } from "@/lib/consultas-tipos";
import type { Item } from "@/lib/listas";
import { identidad, interpretar, normalizar, sinonimosDe, type ExamenCatalogo, type FilaLeida, type Linea } from "@/lib/ocr/interpretar";
import { esCancelado, leerResultado, type Avance, type Pagina } from "@/lib/ocr/leer";
import { defExamen, estadoCalculado, rango } from "@/lib/paraclinicos";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Fila = FilaLeida & { incluir: boolean; confirmada: boolean; original: Pick<FilaLeida, "examen" | "valor" | "unidad" | "referencia"> };

export type Registro = { paraclinicos: Paraclinico[]; examenes: string[] };

type Props = {
  archivo: { id: string; nombre: string; url: string; tipo: string };
  consultaId: string;
  paraclinicos: Paraclinico[];
  catalogo: Item[];
  sexo: string | null;
  paciente: { cedula: string; nombre: string };
  // editar: se agregan exámenes nuevos; resultados (consulta cerrada): solo los ya solicitados
  puedeAgregar: boolean;
  onRegistrar: (r: Registro) => void;
  onCerrar: () => void;
};

const ICONO_NIVEL = { ok: CheckCircle2, revisar: AlertTriangle, alerta: AlertTriangle };
const ESTILO_NIVEL = {
  ok: "border-ok/40 bg-ok/10 text-ok-texto",
  revisar: "border-aviso/50 bg-aviso/15 text-aviso-texto",
  alerta: "border-alerta/50 bg-alerta/10 text-alerta-texto",
};

/** Lee el informe del laboratorio, propone los resultados y espera la confirmación del médico para registrarlos. */
export function LectorLaboratorio({ archivo, consultaId, paraclinicos, catalogo, sexo, paciente, puedeAgregar, onRegistrar, onCerrar }: Props) {
  const examenes = useMemo<ExamenCatalogo[]>(() => catalogo.map((i) => {
    const dx = defExamen(i.datos);
    return { id: i.id, nombre: i.nombre, grupo: i.grupo, sinonimos: sinonimosDe(i.datos), unidad: dx.unidad, max: rango(dx, sexo).max };
  }), [catalogo, sexo]);
  const [avance, setAvance] = useState<Avance>({ texto: "Abriendo el archivo…", paso: 0, total: 1 });
  const [error, setError] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [cabecera, setCabecera] = useState({ laboratorio: "", fecha: "", cedula: "", nombre: "" });
  const [ignorada, setIgnorada] = useState(false);
  const [resaltada, setResaltada] = useState<number | null>(null);
  const [verImagen, setVerImagen] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const control = useRef<AbortController | null>(null);
  const valores = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const c = new AbortController();
    control.current = c;
    (async () => {
      try {
        const r = await fetch(archivo.url, { signal: c.signal });
        if (!r.ok) throw new Error("No se pudo abrir el archivo. Vuelve a intentarlo.");
        const leido = await leerResultado(await r.blob(), archivo.tipo, { avance: setAvance, senal: c.signal });
        const { cabecera: cab, filas: fs } = interpretar(leido.lineas, examenes);
        setLineas(leido.lineas);
        setPaginas(leido.paginas);
        setCabecera(cab);
        setFilas(fs.map((f) => {
          const solicitado = paraclinicos.some((p) => p.id === f.examenId);
          return { ...f, incluir: puedeAgregar || solicitado, confirmada: false, original: { examen: f.examen, valor: f.valor, unidad: f.unidad, referencia: f.referencia } };
        }));
      } catch (e) {
        if (!esCancelado(e) && !c.signal.aborted) setError((e as Error).message || "No se pudo leer el archivo.");
      }
    })();
    return () => c.abort();
  }, [archivo.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => paginas.forEach((p) => URL.revokeObjectURL(p.imagen)), [paginas]);

  const id = identidad(cabecera, paciente);
  const IconoId = ICONO_NIVEL[id.nivel];
  const incluidas = (filas ?? []).filter((f) => f.incluir && f.examenId && f.valor.trim());
  const porRevisar = incluidas.filter((f) => f.dudas.length && !f.confirmada).length;
  const identidadPendiente = id.nivel !== "ok" && !ignorada;
  const noSolicitado = (f: Fila) => !puedeAgregar && !paraclinicos.some((p) => p.id === f.examenId);

  const cambiar = (i: number, cambio: Partial<Fila>) => setFilas((fs) => fs && fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const editada = (f: Fila, k: keyof Fila["original"]) => f[k] !== f.original[k];
  const alEnter = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    valores.current[i + 1]?.focus();
  };

  const registrar = async () => {
    if (!filas) return;
    setRegistrando(true);
    const lista = [...paraclinicos];
    for (const f of incluidas) {
      const cat = catalogo.find((c) => c.id === f.examenId);
      const conRango = f.min !== null || f.max !== null;
      const deLab = { tipo: "numero" as const, unidad: f.unidad, min: f.min, max: f.max, minF: null, maxF: null };
      const estado = conRango ? estadoCalculado(f.valor, deLab, null) : f.marca ? "fuera" : undefined;
      const cambio: Partial<Paraclinico> = {
        resultado: f.valor.trim(), unidad: f.unidad, ...(f.referencia ? { referencia: f.referencia } : {}),
        // Con el rango del laboratorio el color queda fijo (no lo recalcula el rango del catálogo)
        ...(estado !== undefined ? { estado, manual: true } : { manual: false }),
      };
      const i = lista.findIndex((p) => p.id === f.examenId);
      if (i >= 0) lista[i] = { ...lista[i], ...cambio };
      else if (puedeAgregar && f.examenId) lista.push({ id: f.examenId, nombre: cat?.nombre ?? f.examen, grupo: cat?.grupo ?? null, resultado: "", ...cambio });
    }
    // Bitácora: cada lectura registrada y, si se ignoró, la cédula que se leyó
    const e = await Promise.resolve().then(() => crearClienteNavegador().rpc("registrar_lectura_laboratorio", {
      p_consulta: consultaId, p_adjunto: archivo.id, p_cedula_leida: cabecera.cedula ? cabecera.cedula.slice(0, 20) : null,
      p_cedula_coincide: id.nivel === "ok", p_cedula_ignorada: ignorada, p_examenes: incluidas.length,
    })).then((r) => r.error, (x: Error) => x);
    setRegistrando(false);
    if (e) return setError(e.message || "No se pudo registrar. Revisa la conexión y vuelve a intentarlo.");
    onRegistrar({ paraclinicos: lista, examenes: [...new Set(incluidas.map((f) => f.examenId!))] });
  };

  const pagina = (n: number) => paginas.find((p) => p.pagina === n);
  const lineaResaltada = resaltada !== null ? lineas[resaltada] : null;

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) { control.current?.abort(); onCerrar(); } }}>
      <DialogContent className="grid h-[94dvh] w-[96vw] max-w-7xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-7xl">
        <div className="border-b px-4 py-3 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base"><ScanText className="size-5 text-primary" /> Leer resultados · {archivo.nombre}</DialogTitle>
          <DialogDescription className="mt-1 text-xs">Se lee en este equipo, sin enviar la imagen a nadie. Revisa cada fila: nada se guarda hasta que toques «Registrar».</DialogDescription>
        </div>

        {!filas ? (
          <div className="grid place-items-center p-6">
            {error ? (
              <div className="grid max-w-md justify-items-center gap-3 text-center">
                <AlertTriangle className="size-8 text-alerta-texto" />
                <p className="text-sm">{error}</p>
                <Button variant="outline" onClick={onCerrar}>Cerrar y escribirlos a mano</Button>
              </div>
            ) : (
              <div className="grid w-full max-w-sm justify-items-center gap-3 text-center" role="status" aria-live="polite">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm font-medium">{avance.texto}</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Avance de la lectura"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((avance.paso + 0.5) / Math.max(1, avance.total)) * 100)}>
                  <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(((avance.paso + 0.5) / Math.max(1, avance.total)) * 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">La primera vez el lector tarda unos segundos en prepararse.</p>
                <Button variant="ghost" onClick={() => { control.current?.abort(); onCerrar(); }}>Cancelar</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            {/* Imagen con la línea resaltada (en el celular, solo al tocar «Ver en la imagen») */}
            <div className={cn("min-h-0 overflow-auto border-b bg-muted p-3 lg:block lg:border-r lg:border-b-0", verImagen ? "block max-h-[45dvh] lg:max-h-none" : "hidden")}>
              {paginas.map((p) => (
                <div key={p.pagina} className="relative mx-auto mb-3 w-full max-w-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imagen} alt={`Página ${p.pagina} del informe`} className="w-full rounded bg-white shadow-sm" />
                  {lineaResaltada?.caja && lineaResaltada.pagina === p.pagina && (
                    <span
                      ref={(el) => el?.scrollIntoView({ block: "center", behavior: "smooth" })}
                      className="pointer-events-none absolute rounded-sm border-2 border-primary"
                      style={{ left: `${lineaResaltada.caja.x0 * 100}%`, top: `${lineaResaltada.caja.y0 * 100}%`, width: `${(lineaResaltada.caja.x1 - lineaResaltada.caja.x0) * 100}%`, height: `${(lineaResaltada.caja.y1 - lineaResaltada.caja.y0) * 100}%` }}
                    />
                  )}
                </div>
              ))}
              {!pagina(1) && <p className="text-center text-sm text-muted-foreground">Sin vista previa.</p>}
            </div>

            <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
              <div className="grid gap-2 border-b p-3">
                <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm", ESTILO_NIVEL[ignorada ? "revisar" : id.nivel])}>
                  <IconoId className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">{ignorada ? `Identidad revisada por ti (queda registrado). ${id.texto}` : id.texto}</span>
                  {id.nivel !== "ok" && !ignorada && <Button size="sm" variant="outline" className="h-7" onClick={() => setIgnorada(true)}>Es su informe · Ignorar</Button>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[cabecera.laboratorio, cabecera.fecha && `Fecha ${cabecera.fecha.split("-").reverse().join("/")}`, cabecera.nombre && `Paciente: ${cabecera.nombre}`].filter(Boolean).join(" · ") || "No se leyó la cabecera del informe."}
                </p>
              </div>

              <div className="min-h-0 overflow-auto">
                {filas.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No se reconoció ningún examen del catálogo. Si el laboratorio usa otro nombre, agrégalo como sinónimo en Configuración › Listas › Paraclínicos, o escribe los resultados a mano.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {filas.map((f, i) => {
                      const dudosa = f.dudas.length > 0 && !f.confirmada;
                      const bloqueada = noSolicitado(f);
                      return (
                        <li
                          key={i}
                          onFocusCapture={() => setResaltada(f.linea)}
                          onMouseEnter={() => setResaltada(f.linea)}
                          // Ojo: en el celular la grilla ubica a los hijos por posición (nth-child: 1 casilla, 2 examen, 3 valor, 6+ estado y dudas).
                          // Si agregas, quitas o reordenas hijos de este <li>, ajusta esos selectores.
                          className={cn("grid gap-2 border-l-4 px-3 py-2.5 max-sm:grid-cols-[1.5rem_repeat(3,minmax(0,1fr))] max-sm:[&>*:nth-child(2)]:col-span-3 max-sm:[&>*:nth-child(3)]:col-start-2 max-sm:[&>*:nth-child(n+6)]:col-span-4 sm:grid-cols-[1.5rem_minmax(0,1.4fr)_minmax(5rem,0.8fr)_minmax(4rem,0.6fr)_minmax(5rem,0.8fr)_auto] sm:items-center",
                            !f.incluir || bloqueada ? "border-l-transparent opacity-60" : dudosa ? "border-l-aviso bg-aviso/5" : "border-l-ok/60")}
                        >
                          <input type="checkbox" checked={f.incluir && !bloqueada} disabled={bloqueada} aria-label={`Incluir ${f.examen}`} onChange={(e) => cambiar(i, { incluir: e.target.checked })} className="size-4 accent-primary" />
                          <BuscadorExamen
                            valor={f.examen}
                            editado={editada(f, "examen")}
                            original={f.original.examen}
                            examenes={examenes}
                            onElegir={(e) => cambiar(i, { examenId: e.id, examen: e.nombre, unidad: f.unidad || e.unidad })}
                          />
                          <Celda etiqueta="Valor" valor={f.valor} editado={editada(f, "valor")} original={f.original.valor} mono
                            refInput={(el) => { valores.current[i] = el; }} onKeyDown={(e) => alEnter(e, i)} onChange={(v) => cambiar(i, { valor: v })} />
                          <Celda etiqueta="Unidad" valor={f.unidad} editado={editada(f, "unidad")} original={f.original.unidad} onKeyDown={(e) => alEnter(e, i)} onChange={(v) => cambiar(i, { unidad: v })} />
                          <Celda etiqueta="Rango" valor={f.referencia} editado={editada(f, "referencia")} original={f.original.referencia} mono onKeyDown={(e) => alEnter(e, i)}
                            onChange={(v) => {
                              const m = v.match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)/);
                              const n = (x?: string) => (x ? Number(x.replace(",", ".")) : null);
                              cambiar(i, { referencia: v, min: m ? n(m[1]) : null, max: m ? n(m[2]) : null });
                            }} />
                          <div className="flex items-center gap-1.5 sm:justify-end">
                            {bloqueada ? (
                              <span className="text-xs text-muted-foreground">No solicitado (consulta cerrada)</span>
                            ) : dudosa ? (
                              <Button size="sm" variant="outline" className="h-7 border-aviso/60 text-aviso-texto" title={f.dudas.join(" · ")} onClick={() => cambiar(i, { confirmada: true })}>
                                <AlertTriangle className="size-3.5" /> Revisar · Confirmar
                              </Button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-ok-texto"><Check className="size-3.5" /> {f.confirmada ? "Confirmado" : "Leído"}</span>
                            )}
                            {f.marca && <span className="rounded bg-muted px-1.5 text-xs font-semibold" title={f.marca === "H" ? "Marcado alto por el laboratorio" : "Marcado bajo por el laboratorio"}>{f.marca}</span>}
                            <Button size="icon" variant="ghost" className="size-7 lg:hidden" aria-label={`Ver ${f.examen} en la imagen`} onClick={() => { setResaltada(f.linea); setVerImagen(true); }}><Eye /></Button>
                          </div>
                          {dudosa && <p className="text-xs text-aviso-texto sm:col-span-5 sm:col-start-2">{f.dudas.join(" · ")}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          {error && filas && <span role="alert" className="text-sm text-alerta-texto">{error}</span>}
          {filas && verImagen && <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setVerImagen(false)}><X /> Ocultar imagen</Button>}
          <span className="ml-auto" />
          <Button variant="ghost" onClick={() => { control.current?.abort(); onCerrar(); }}>Cancelar</Button>
          {filas && (
            <Button onClick={registrar} disabled={registrando || !incluidas.length || porRevisar > 0 || identidadPendiente}>
              {registrando ? <Loader2 className="animate-spin" /> : <Check />}
              Registrar {incluidas.length} resultado{incluidas.length === 1 ? "" : "s"}{porRevisar ? ` (${porRevisar} por revisar)` : identidadPendiente ? " (confirma la identidad)" : ""}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Celda({ etiqueta, valor, editado, original, mono, onChange, onKeyDown, refInput }: {
  etiqueta: string; valor: string; editado: boolean; original: string; mono?: boolean;
  onChange: (v: string) => void; onKeyDown: (e: React.KeyboardEvent) => void; refInput?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <label className="grid gap-0.5">
      <span className="text-[11px] text-muted-foreground sm:sr-only">{etiqueta}</span>
      <input
        ref={refInput}
        value={valor}
        aria-label={etiqueta}
        title={editado ? `Leído: «${original || "vacío"}»` : undefined}
        inputMode={mono ? "decimal" : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn("h-8 w-full min-w-0 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20",
          mono && "font-mono tabular-nums", editado ? "border-dashed border-primary" : "border-input")}
      />
    </label>
  );
}

function BuscadorExamen({ valor, editado, original, examenes, onElegir }: {
  valor: string; editado: boolean; original: string; examenes: ExamenCatalogo[]; onElegir: (e: ExamenCatalogo) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const lista = useId();
  const abierto = texto !== null;
  const q = normalizar(texto ?? "");
  const opciones = abierto
    ? examenes.filter((e) => !q || [e.nombre, ...e.sinonimos].some((n) => normalizar(n).includes(q))).slice(0, 8)
    : [];
  return (
    <div className="relative">
      <span className="text-[11px] text-muted-foreground sm:sr-only">Examen</span>
      <input
        role="combobox"
        aria-expanded={abierto}
        aria-controls={lista}
        aria-label="Examen"
        value={texto ?? valor}
        title={editado ? `Leído: «${original}»` : undefined}
        onFocus={() => setTexto("")}
        onBlur={() => setTimeout(() => setTexto(null), 150)}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && opciones[0]) { e.preventDefault(); onElegir(opciones[0]); setTexto(null); } if (e.key === "Escape") setTexto(null); }}
        placeholder={valor}
        className={cn("h-8 w-full min-w-0 rounded-md border bg-card px-2 text-sm font-medium outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20", editado ? "border-dashed border-primary" : "border-input")}
      />
      {abierto && opciones.length > 0 && (
        <ul id={lista} role="listbox" className="absolute top-full right-0 left-0 z-20 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {opciones.map((e) => (
            <li key={e.id} role="option" aria-selected={e.nombre === valor}>
              <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => { onElegir(e); setTexto(null); }} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
                <span className="truncate">{e.nombre}</span>
                {e.grupo && <span className="shrink-0 text-xs text-muted-foreground">{e.grupo}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
