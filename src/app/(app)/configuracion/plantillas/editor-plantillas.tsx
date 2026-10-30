"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Aviso } from "@/components/app/campo";
import { PLANTILLA_VACIA, resumenPlantilla, type DatosPlantilla, type Plantilla } from "@/lib/plantillas";
import { cn } from "@/lib/utils";
import { guardarPlantilla, type Resultado } from "./acciones";

type ItemLista = { codigo: string | null; nombre: string; grupo: string | null; texto: string | null };
type Motivo = { codigo: string; nombre: string; preventivo: boolean };

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";

const GRUPOS_RECOMENDACION = [
  { campo: "aptitud", lista: "recomendacion_aptitud", titulo: "Observación de la aptitud" },
  { campo: "empresa", lista: "recomendacion_empresa", titulo: "Recomendaciones a la empresa" },
  { campo: "trabajador", lista: "recomendacion_paciente", titulo: "Recomendaciones al trabajador" },
] as const;

// Una recomendación «es de» un motivo si su grupo lo nombra (PRE,PER…) o no nombra ninguno
const deMotivo = (i: ItemLista, motivo: string) => !i.grupo?.trim() || i.grupo.split(",").map((x) => x.trim()).includes(motivo);

function Chips({ items, elegidos, motivo, onChange, disabled }: {
  items: ItemLista[]; elegidos: string[]; motivo: string; onChange: (v: string[]) => void; disabled: boolean;
}) {
  const [todas, setTodas] = useState(false);
  const conCodigo = items.filter((i) => i.codigo);
  // Las elegidas siempre se ven; las de otros motivos solo con «Ver todas»
  const visibles = conCodigo.filter((i) => todas || deMotivo(i, motivo) || elegidos.includes(i.codigo!));
  const ocultas = conCodigo.length - visibles.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visibles.map((i) => {
        const activo = elegidos.includes(i.codigo!);
        return (
          <button
            key={i.codigo}
            type="button"
            disabled={disabled}
            title={i.texto ?? i.nombre}
            aria-pressed={activo}
            onClick={() => onChange(activo ? elegidos.filter((x) => x !== i.codigo) : [...elegidos, i.codigo!])}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-left text-xs transition disabled:opacity-60",
              activo ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50",
            )}
          >
            {activo && <Check className="size-3 shrink-0" />}
            <span className="truncate">{i.nombre}</span>
          </button>
        );
      })}
      {visibles.length === 0 && <span className="text-xs text-muted-foreground">No hay frases para este motivo.</span>}
      {(ocultas > 0 || todas) && (
        <button type="button" onClick={() => setTodas(!todas)} className="rounded-full px-2.5 py-1 text-xs text-primary hover:underline">
          {todas ? "Solo las de este motivo" : `Ver todas (+${ocultas})`}
        </button>
      )}
    </div>
  );
}

function Tarjeta({ motivo, plantilla, listas, editable }: {
  motivo: Motivo; plantilla: Plantilla | null; listas: Record<string, ItemLista[]>; editable: boolean;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState<DatosPlantilla>(plantilla?.datos ?? PLANTILLA_VACIA);
  const [activo, setActivo] = useState(plantilla?.activo ?? true);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [guardando, iniciar] = useTransition();
  const set = <K extends keyof DatosPlantilla>(k: K, v: DatosPlantilla[K]) => { setDatos((x) => ({ ...x, [k]: v })); setResultado(null); };
  const resumen = plantilla ? resumenPlantilla(plantilla.datos) : "";

  const guardar = () => iniciar(async () => {
    const r = await guardarPlantilla(motivo.codigo, datos, activo);
    setResultado(r);
    if (r.ok) router.refresh();
  });

  return (
    <div className={cn("rounded-xl border bg-card transition", abierta && "border-primary/40 shadow-sm")}>
      <button type="button" onClick={() => setAbierta(!abierta)} aria-expanded={abierta} className="flex w-full items-center gap-3 p-4 text-left">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", plantilla?.activo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          <Wand2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 font-medium">
            {motivo.nombre}
            <span className="font-mono text-xs font-normal text-muted-foreground">{motivo.codigo}</span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {!plantilla ? "Sin plantilla" : !plantilla.activo ? "Desactivada" : resumen || "Plantilla vacía"}
          </p>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", abierta && "rotate-180")} />
      </button>

      {abierta && (
        <fieldset disabled={!editable || guardando} className="space-y-5 border-t p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`fun-${motivo.codigo}`} className="mb-1.5">Examen funcional</Label>
              <select id={`fun-${motivo.codigo}`} value={datos.funcional ?? ""} onChange={(e) => set("funcional", e.target.value || null)} className={SELECT}>
                <option value="">No precargar</option>
                {listas.perfil_examen_funcional.filter((p) => p.codigo).map((p) => <option key={p.codigo} value={p.codigo!}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor={`fis-${motivo.codigo}`} className="mb-1.5">Examen físico</Label>
              <select id={`fis-${motivo.codigo}`} value={datos.fisico ?? ""} onChange={(e) => set("fisico", e.target.value || null)} className={SELECT}>
                <option value="">No precargar</option>
                {listas.perfil_examen_fisico.filter((p) => p.codigo).map((p) => <option key={p.codigo} value={p.codigo!}>{p.nombre}</option>)}
              </select>
            </div>
          </div>

          {GRUPOS_RECOMENDACION.map((g) => (
            <div key={g.campo}>
              <p className="mb-1.5 text-sm font-medium">{g.titulo}</p>
              <Chips items={listas[g.lista] ?? []} elegidos={datos[g.campo]} motivo={motivo.codigo} disabled={!editable || guardando} onChange={(v) => set(g.campo, v)} />
            </div>
          ))}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div>
              <Label htmlFor={`mes-${motivo.codigo}`} className="mb-1.5">Vigencia de la aptitud</Label>
              <div className="flex items-center gap-2">
                <Input id={`mes-${motivo.codigo}`} type="number" min={1} max={60} inputMode="numeric" className="h-10 w-20"
                  value={datos.meses ?? ""} onChange={(e) => set("meses", e.target.value ? Number(e.target.value) : null)} />
                <span className="text-sm text-muted-foreground">meses</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Vacío: la de la organización.</p>
            </div>
            <div>
              <Label htmlFor={`con-${motivo.codigo}`} className="mb-1.5">Conclusiones base</Label>
              <Textarea id={`con-${motivo.codigo}`} rows={2} value={datos.conclusiones} onChange={(e) => set("conclusiones", e.target.value)}
                placeholder="Se escriben solo si la consulta no tiene conclusiones." />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-lg bg-ok/5 p-3 sm:grid-cols-2">
            <p className="text-sm sm:col-span-2"><b>Botón «Perfil normal»</b> de la consulta: aplica todo lo de arriba, llena el examen vacío con lo normal y además:</p>
            <div>
              <Label htmlFor={`cla-${motivo.codigo}`} className="mb-1.5">Aptitud</Label>
              <select id={`cla-${motivo.codigo}`} value={datos.clasificacion} onChange={(e) => set("clasificacion", e.target.value)} className={SELECT}>
                <option value="">No poner aptitud</option>
                {(listas.clasificacion_aptitud ?? []).filter((p) => p.codigo).map((p) => <option key={p.codigo} value={p.codigo!}>{p.nombre}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={datos.sano} onChange={(e) => set("sano", e.target.checked)} className="size-4 accent-primary" />
              Marcar «sin diagnósticos» si no hay ninguno
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={activo} onChange={(e) => { setActivo(e.target.checked); setResultado(null); }} className="size-4 accent-primary" />
              Aplicar al elegir este motivo
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Aviso resultado={resultado} />
              {editable ? (
                <Button type="button" onClick={guardar}>{guardando && <Loader2 className="animate-spin" />} Guardar</Button>
              ) : (
                <span className="text-sm text-muted-foreground">Solo el administrador o el gerente médico pueden cambiarla.</span>
              )}
            </div>
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function EditorPlantillas({ motivos, plantillas, listas, editable }: {
  motivos: Motivo[]; plantillas: Plantilla[]; listas: Record<string, ItemLista[]>; editable: boolean;
}) {
  const grupos = [
    { titulo: "Evaluaciones preventivas", items: motivos.filter((m) => m.preventivo) },
    { titulo: "Otros motivos", items: motivos.filter((m) => !m.preventivo) },
  ].filter((g) => g.items.length);
  return (
    <div className="space-y-6">
      {grupos.map((g) => (
        <section key={g.titulo} className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{g.titulo}</h2>
          {g.items.map((m) => (
            <Tarjeta key={m.codigo} motivo={m} plantilla={plantillas.find((p) => p.motivo === m.codigo) ?? null} listas={listas} editable={editable} />
          ))}
        </section>
      ))}
    </div>
  );
}
