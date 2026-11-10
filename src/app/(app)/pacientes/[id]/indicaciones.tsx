"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, FileText, Loader2, Pill, Plus, Printer, Syringe, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Medicamento } from "@/lib/consultas-tipos";
import type { Item } from "@/lib/listas";
import { concentracionEnNombre, faltantesMedicinas, CAMPOS_RECIPE } from "@/lib/recipe";
import { abrirEnVentana } from "@/lib/escritorio";
import { cn } from "@/lib/utils";
import {
  ETIQUETA_ESTADO_INDICACION, ETIQUETA_TIPO, lineaOrden, medicinaVacia, type IndicacionSuelta, type TipoIndicacion,
} from "@/lib/indicaciones-sueltas";
import { BuscadorMedicina } from "../../atencion/[id]/buscador-diagnostico";
import { indicacionPreestablecida } from "../../atencion/[id]/perfiles";
import { anularIndicacion, cumplirIndicacion, emitirIndicacion, listasIndicacion } from "./indicaciones-acciones";

const SELECT = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const nombreCampo = (c: string) => CAMPOS_RECIPE.find(([k]) => k === c)?.[1] ?? c;
const fechaCorta = (f: string) => f.slice(0, 10).split("-").reverse().join("/");
const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(iso));

// Botón de la ficha: «Indicación / récipe» sin abrir consulta (no cuenta como morbilidad)
export function BotonIndicacion({ trabajadorId, nombre }: { trabajadorId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button variant="outline" className="flex-1 xl:flex-none" data-accion="indicacion-sin-consulta" onClick={() => setAbierto(true)}>
        <Pill /> Indicación / récipe
      </Button>
      {abierto && <FormIndicacion trabajadorId={trabajadorId} nombre={nombre} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function FormIndicacion({ trabajadorId, nombre, onCerrar }: { trabajadorId: string; nombre: string; onCerrar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoIndicacion>("enfermeria");
  const [meds, setMeds] = useState<Medicamento[]>([medicinaVacia()]);
  const [texto, setTexto] = useState("");
  const [indicadoPor, setIndicadoPor] = useState("");
  const [listas, setListas] = useState<Record<string, Item[]> | null>(null);
  const [propias, setPropias] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  // Las listas (vademécum, vías, frecuencias) se piden al abrir: la ficha no las carga en cada visita
  useEffect(() => {
    let vivo = true;
    listasIndicacion().then((l) => { if (vivo) setListas(l); }).catch(() => { if (vivo) setListas({}); });
    return () => { vivo = false; };
  }, []);
  const lista = (k: string) => listas?.[k] ?? [];
  const medicinas = [...propias, ...lista("medicina")];
  const cambiar = (i: number, c: Partial<Medicamento>) => setMeds((x) => x.map((m, j) => (j === i ? { ...m, ...c } : m)));
  const faltan = tipo === "recipe" ? new Map(faltantesMedicinas(meds).map((f) => [f.indice, f.campos])) : new Map<number, string[]>();

  const datos = () => ({ trabajadorId, tipo, tratamiento: meds, indicaciones: texto, indicadoPor: tipo === "enfermeria" ? indicadoPor : "" });
  const guardar = (imprimir: boolean) => {
    setError(null);
    if (imprimir) {
      // La ventana se abre con el clic (si no, el navegador la bloquea) y se dirige al guardar
      void abrirEnVentana(async () => {
        const r = await emitirIndicacion(datos());
        if (!r.ok || !r.id) { setError(r.mensaje); return null; }
        onCerrar(); router.refresh();
        return `/imprimir/indicacion/${r.id}`;
      });
      return;
    }
    iniciar(async () => {
      const r = await emitirIndicacion(datos());
      if (!r.ok) return setError(r.mensaje);
      onCerrar(); router.refresh();
    });
  };

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onCerrar(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Indicación o récipe</SheetTitle>
          <SheetDescription>{nombre} · No abre consulta ni cuenta en morbilidad. Queda en su historial y se imprime con tu firma.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Qué vas a emitir">
            {([
              ["enfermeria", Syringe, "Orden a enfermería", "Para que la enfermera coloque el tratamiento"],
              ["recipe", FileText, "Récipe", "Para que compre la medicina"],
            ] as const).map(([k, Icono, titulo, sub]) => (
              <button key={k} type="button" role="radio" aria-checked={tipo === k} data-tipo={k} onClick={() => { setTipo(k); setError(null); }}
                className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition",
                  tipo === k ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:border-primary/50 hover:bg-muted/40")}>
                <Icono className={cn("mt-0.5 size-5 shrink-0", tipo === k ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span><span className="block text-sm font-semibold">{titulo}</span><span className="block text-xs text-muted-foreground">{sub}</span></span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Medicinas</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setMeds((x) => [...x, medicinaVacia()])} disabled={meds.length >= 20}><Plus /> Medicina</Button>
            </div>
            {listas === null && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Cargando tu vademécum…</p>}
            {meds.map((m, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3" data-fila-medicina={i}>
                <div className="col-span-2 flex gap-2 sm:col-span-3">
                  <div className="min-w-0 flex-1">
                    <BuscadorMedicina valor={m.medicina} medicinas={medicinas}
                      onAgregada={(it) => setPropias((x) => [...x, it])}
                      onEscribir={(v) => cambiar(i, { medicina: v })}
                      onElegir={(it) => {
                        const pre = indicacionPreestablecida(it.texto);
                        cambiar(i, {
                          medicina: it.nombre, concentracion: pre.concentracion ?? concentracionEnNombre(it.nombre) ?? "",
                          presentacion: pre.presentacion ?? "", via: pre.via ?? "", dosis: pre.dosis ?? "",
                          frecuencia: pre.frecuencia ?? "", duracion: pre.duracion ?? "", observacion: pre.observacion ?? "",
                        });
                      }} />
                  </div>
                  <Button type="button" size="icon" variant="ghost" aria-label="Quitar medicina" className="text-muted-foreground hover:text-destructive"
                    onClick={() => setMeds((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [medicinaVacia()]))}><Trash2 /></Button>
                </div>
                <Input value={m.concentracion ?? ""} aria-label="Concentración" placeholder={concentracionEnNombre(m.medicina) ? `${concentracionEnNombre(m.medicina)} (del nombre)` : "Concentración"}
                  className="h-9" onChange={(e) => cambiar(i, { concentracion: e.target.value })} />
                <Input value={m.dosis} aria-label="Dosis" placeholder="Dosis" className="h-9" onChange={(e) => cambiar(i, { dosis: e.target.value })} />
                {([["presentacion", "presentacion_medicina", "Presentación"], ["via", "via_administracion", "Vía"], ["frecuencia", "frecuencia_dosis", "Frecuencia"], ["duracion", "duracion_tratamiento", "Duración"]] as const).map(([k, l, ph]) => (
                  <select key={k} aria-label={ph} value={m[k]} onChange={(e) => cambiar(i, { [k]: e.target.value })} className={SELECT}>
                    <option value="">{ph}</option>
                    {lista(l).map((x) => <option key={x.id} value={x.nombre}>{x.nombre}</option>)}
                    {m[k] && !lista(l).some((x) => x.nombre === m[k]) && <option value={m[k]}>{m[k]}</option>}
                  </select>
                ))}
                <Input value={m.observacion ?? ""} aria-label="Nota" placeholder={tipo === "recipe" ? "Nota al paciente (ej. después de las comidas)" : "Nota a enfermería (ej. glúteo, lento)"}
                  className="col-span-2 h-9 sm:col-span-3" onChange={(e) => cambiar(i, { observacion: e.target.value })} />
                {faltan.get(i) && m.medicina.trim() && (
                  <p className="col-span-2 text-xs text-aviso-texto sm:col-span-3" data-estado="falta-recipe">
                    Para el récipe falta: {faltan.get(i)!.map(nombreCampo).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {tipo === "enfermeria" && (
            <div>
              <Label htmlFor="indicado-por" className="mb-1.5">Indicado por (médico externo, opcional)</Label>
              <Input id="indicado-por" value={indicadoPor} maxLength={200} placeholder="Ej.: Dr. Pérez, traumatólogo" onChange={(e) => setIndicadoPor(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="texto-indicacion" className="mb-1.5">{tipo === "recipe" ? "Otras indicaciones al paciente" : "Indicación a enfermería"}</Label>
            <Textarea id="texto-indicacion" rows={3} value={texto} maxLength={2000} onChange={(e) => setTexto(e.target.value)}
              placeholder={tipo === "recipe" ? "Ej.: continuar tratamiento crónico; control en 3 meses" : "Ej.: colocar hoy, observar 15 minutos"} />
          </div>
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>

        {/* En el celular: «Guardar e imprimir» a todo lo ancho y fijo abajo; debajo «Cancelar · Guardar» */}
        <SheetFooter className="sticky bottom-0 mt-auto grid grid-cols-2 gap-2 border-t bg-background sm:flex sm:flex-row sm:justify-end sm:border-t-0">
          <Button type="button" className="col-span-2 sm:order-3" disabled={guardando} onClick={() => guardar(true)} data-accion="guardar-imprimir-indicacion"><Printer /> Guardar e imprimir</Button>
          <Button type="button" variant="ghost" className="sm:order-1" onClick={onCerrar}>Cancelar</Button>
          <Button type="button" variant="outline" className="sm:order-2" disabled={guardando} onClick={() => guardar(false)} data-accion="guardar-indicacion">
            {guardando && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const ESTILO_ESTADO = {
  pendiente: "bg-aviso/15 text-aviso-texto",
  cumplida: "bg-primary/10 text-primary",
  emitida: "bg-muted text-foreground",
  anulada: "bg-muted text-muted-foreground line-through",
} as const;

// Historial de indicaciones y récipes del trabajador, con «Cumplida» (enfermería) y «Anular» (médico)
export function ListaIndicaciones({ trabajadorId, items, puedeAnular, compacta }: {
  trabajadorId: string; items: IndicacionSuelta[]; puedeAnular: boolean; compacta?: boolean;
}) {
  if (!items.length) return <p className="py-10 text-center text-sm text-muted-foreground">Sin indicaciones ni récipes sueltos.</p>;
  return (
    <ul className="divide-y">
      {items.map((x) => <FilaIndicacion key={x.id} x={x} trabajadorId={trabajadorId} puedeAnular={puedeAnular} compacta={compacta} />)}
    </ul>
  );
}

function FilaIndicacion({ x, trabajadorId, puedeAnular, compacta }: { x: IndicacionSuelta; trabajadorId: string; puedeAnular: boolean; compacta?: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<null | "cumplir" | "anular">(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const Icono = x.tipo === "recipe" ? FileText : Syringe;
  const lineas = x.tratamiento.filter((m) => m.medicina?.trim()).map(lineaOrden);
  const confirmar = () => iniciar(async () => {
    const r = modo === "cumplir" ? await cumplirIndicacion(x.id, trabajadorId, nota) : await anularIndicacion(x.id, trabajadorId, nota);
    if (!r.ok) return setError(r.mensaje);
    setModo(null); setNota(""); router.refresh();
  });

  return (
    <li className={cn("flex flex-wrap items-start gap-3 py-3", !compacta && "px-5")} data-indicacion={x.estado}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", x.tipo === "recipe" ? "bg-muted" : "bg-primary/10 text-primary")}><Icono className="size-4" aria-hidden /></span>
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{ETIQUETA_TIPO[x.tipo]}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ESTILO_ESTADO[x.estado])}>{ETIQUETA_ESTADO_INDICACION[x.estado]}</span>
          <span className="font-mono text-xs text-muted-foreground">{fechaCorta(x.fecha)}</span>
        </div>
        <ul className={cn("mt-1 space-y-0.5 text-sm", x.estado === "anulada" && "text-muted-foreground line-through")}>
          {lineas.map((l, i) => <li key={i}>{l}</li>)}
          {x.indicaciones && <li className="whitespace-pre-line text-muted-foreground">{x.indicaciones}</li>}
        </ul>
        <p className="mt-1 text-xs text-muted-foreground">
          {[x.medico && `Emitió ${x.medico}`, x.indicadoPor && `indicado por ${x.indicadoPor}`].filter(Boolean).join(" · ")}
          {x.estado === "cumplida" && <> · Cumplida{x.cumplidaPor && ` por ${x.cumplidaPor}`}{x.cumplidaEn && ` el ${fechaHora(x.cumplidaEn)}`}{x.notaCumplimiento && `: ${x.notaCumplimiento}`}</>}
          {x.estado === "anulada" && x.motivoAnulacion && <> · Anulada: {x.motivoAnulacion}</>}
        </p>
        {modo && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input autoFocus value={nota} onChange={(e) => setNota(e.target.value)} maxLength={modo === "cumplir" ? 500 : 300} className="h-9 min-w-0 flex-1 basis-56"
              placeholder={modo === "cumplir" ? "Nota (opcional): dónde se colocó, reacción…" : "Motivo (ej. dosis equivocada)"} />
            <Button size="sm" disabled={enviando} variant={modo === "anular" ? "destructive" : "default"} onClick={confirmar}>
              {enviando && <Loader2 className="animate-spin" />}{modo === "cumplir" ? "Confirmar cumplida" : "Anular"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setModo(null); setError(null); }}>Cancelar</Button>
          </div>
        )}
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      {!modo && (
        <div className="flex flex-wrap gap-1.5">
          {x.estado === "pendiente" && (
            <Button size="sm" onClick={() => setModo("cumplir")} data-accion="cumplir-indicacion"><CheckCircle2 /> Cumplida</Button>
          )}
          {x.estado !== "anulada" && (
            <Button size="sm" variant="outline" onClick={() => abrirEnVentana(`/imprimir/indicacion/${x.id}`)}><Printer /> Imprimir</Button>
          )}
          {puedeAnular && (x.estado === "pendiente" || x.estado === "emitida") && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setModo("anular")}><Ban /> Anular</Button>
          )}
        </div>
      )}
    </li>
  );
}
