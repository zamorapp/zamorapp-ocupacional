"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Lock, Plus, Printer, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type ClaveSeccion, ETIQUETA_INSTANCIA, faltantes, type Instancia, type Investigacion, type Participante, SECCIONES } from "@/lib/investigacion-tipos";
import { cn } from "@/lib/utils";
import { guardarInvestigacion } from "./acciones";

const SELECT = "h-9 w-full rounded-md border bg-transparent px-3 text-sm";

export function EditorInvestigacion({ inicial, sugerencias, evento }: {
  inicial: Investigacion;
  sugerencias: Partial<Record<ClaveSeccion, string>>;
  evento: { id: string; numero: number; tipo: string; diagnostico: string };
}) {
  const [inv, setInv] = useState(inicial);
  const [guardado, setGuardado] = useState(JSON.stringify(inicial));
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const cambios = JSON.stringify(inv) !== guardado;
  const terminado = inv.estado === "terminado";
  const pendientes = faltantes(inv.secciones);
  const texto = (k: ClaveSeccion, v: string) => setInv((x) => ({ ...x, secciones: { ...x.secciones, [k]: v } }));
  const participante = (i: number, c: Partial<Participante>) =>
    setInv((x) => ({ ...x, participantes: x.participantes.map((p, j) => (j === i ? { ...p, ...c } : p)) }));

  const ejecutar = (accion: "guardar" | "terminar" | "reabrir") =>
    iniciar(async () => {
      const r = await guardarInvestigacion(inv, accion);
      setAviso(r);
      if (!r.ok) return;
      const nuevo: Investigacion = { ...inv, id: r.id ?? inv.id, terminadoEn: r.terminadoEn ?? null, estado: accion === "terminar" ? "terminado" : accion === "reabrir" ? "borrador" : inv.estado };
      setInv(nuevo);
      setGuardado(JSON.stringify(nuevo));
    });

  // Llena solo las partes vacías; lo ya escrito no se toca
  const llenarVacias = () =>
    setInv((x) => ({
      ...x,
      secciones: Object.fromEntries(SECCIONES.map(({ clave }) => [clave, x.secciones[clave]?.trim() ? x.secciones[clave] : sugerencias[clave] ?? ""])),
    }));

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-10 -mx-4 border-b bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">Informe de investigación · NT-02-2008</div>
            <p className="truncate text-sm text-muted-foreground">
              Evento #{evento.numero}{evento.diagnostico && ` · ${evento.diagnostico}`} · {terminado ? `Terminado el ${inv.terminadoEn ?? ""}` : `${SECCIONES.length - pendientes.length} de ${SECCIONES.length} partes`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {inv.id && <Button variant="outline" asChild><Link href={`/imprimir/investigacion/${evento.id}`} target="_blank"><Printer /> Imprimir</Link></Button>}
            {terminado ? (
              <Button variant="outline" disabled={ocupado} onClick={() => ejecutar("reabrir")}><Lock /> Reabrir</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => ejecutar("guardar")} disabled={ocupado || !cambios}>{ocupado ? <Loader2 className="animate-spin" /> : <Save />} {cambios ? "Guardar" : "Guardado"}</Button>
                <Button disabled={ocupado} onClick={() => ejecutar("terminar")}><CheckCircle2 /> Terminar informe</Button>
              </>
            )}
          </div>
        </div>
        {aviso?.mensaje && <p className={cn("mt-2 text-sm", aviso.ok ? "text-ok-texto" : "text-destructive")}>{aviso.mensaje}</p>}
      </div>

      {!terminado && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1">La app propone cada parte con la historia, el puesto, los reposos, la morbilidad y los paraclínicos que ya tiene. Revisa y completa lo marcado «[por completar]».</p>
          <Button size="sm" onClick={llenarVacias}><Wand2 /> Llenar las partes vacías</Button>
        </div>
      )}

      <fieldset disabled={terminado} className="contents">
        <Card className="gap-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Portada: participantes del estudio</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={() => setInv((x) => ({ ...x, participantes: [...x.participantes, { nombre: "", cedula: "", cargo: "", instancia: "servicio" }] }))}><Plus /> Participante</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {inv.participantes.length === 0 && <p className="text-sm text-muted-foreground">Servicio de SST, Comité de Seguridad y Salud Laboral o, si no está constituido, los delegados de prevención (NT-02, 6.3).</p>}
            {inv.participantes.map((p, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,2fr)_auto]">
                <Input value={p.nombre} placeholder="Nombre y apellido" className="h-9" onChange={(x) => participante(i, { nombre: x.target.value })} />
                <Input value={p.cedula} placeholder="Cédula" className="h-9" onChange={(x) => participante(i, { cedula: x.target.value })} />
                <Input value={p.cargo} placeholder="Cargo" className="h-9" onChange={(x) => participante(i, { cargo: x.target.value })} />
                <select value={p.instancia} className={SELECT} onChange={(x) => participante(i, { instancia: x.target.value as Instancia })}>
                  {(Object.keys(ETIQUETA_INSTANCIA) as Instancia[]).map((k) => <option key={k} value={k}>{ETIQUETA_INSTANCIA[k]}</option>)}
                </select>
                <button type="button" aria-label="Quitar" className="text-muted-foreground hover:text-destructive" onClick={() => setInv((x) => ({ ...x, participantes: x.participantes.filter((_, j) => j !== i) }))}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </CardContent>
        </Card>

        {SECCIONES.map(({ clave, titulo, guia }) => {
          const valor = inv.secciones[clave] ?? "";
          const vacia = !valor.trim();
          return (
            <Card key={clave} className="gap-3">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {vacia ? <span className="size-2 rounded-full bg-aviso" /> : <CheckCircle2 className="size-4 text-ok-texto" />} {titulo}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{guia}</p>
                </div>
                {sugerencias[clave] && !terminado && (
                  <Button type="button" size="sm" variant="ghost" className="shrink-0"
                    onClick={() => { if (vacia || window.confirm("¿Reemplazar lo escrito por la sugerencia?")) texto(clave, sugerencias[clave]!); }}>
                    <Wand2 /> Usar sugerencia
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Textarea value={valor} rows={vacia ? 3 : Math.min(18, Math.max(4, valor.split("\n").length + 1))} onChange={(x) => texto(clave, x.target.value)}
                  className={cn(valor.includes("[por completar]") && "border-aviso/60")} />
              </CardContent>
            </Card>
          );
        })}
      </fieldset>
    </div>
  );
}
