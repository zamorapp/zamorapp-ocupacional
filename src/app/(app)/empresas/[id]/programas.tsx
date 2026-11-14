"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Dependencia } from "@/lib/puestos";
import type { Programa } from "@/lib/vigilancia-programas";
import { cn } from "@/lib/utils";
import { guardarPrograma, type ProgramaEntrada } from "./acciones";

type Opcion = { id: string; nombre: string };

const VACIO: ProgramaEntrada = { id: null, nombre: "", proyecto: "", riesgo: "", condiciones: "", dependencia_ids: [], puesto_ids: [], examenes: [], metas: [], activo: true };

const aEntrada = (p: Programa): ProgramaEntrada => ({
  id: p.id,
  nombre: p.nombre,
  proyecto: p.proyecto ?? "",
  riesgo: p.riesgo ?? "",
  condiciones: p.condiciones ?? "",
  dependencia_ids: p.dependencia_ids ?? [],
  puesto_ids: p.puesto_ids ?? [],
  examenes: (p.examenes ?? []).map((e) => ({ nombre: e.nombre, cada_meses: e.cada_meses ?? null })),
  metas: (p.metas ?? []).map((m) => ({ indicador: m.indicador, meta: m.meta ?? "" })),
  activo: p.activo,
});

// Programas de vigilancia de la empresa: riesgo, a quién cubre, exámenes con su frecuencia y metas.
// El agente solo los propone (Reportes › Propuestas del agente); aquí se crean y se corrigen a mano.
export function ProgramasVigilancia({ empresaId, programas, dependencias, puestos, editable }: {
  empresaId: string; programas: Programa[]; dependencias: Dependencia[]; puestos: Opcion[]; editable: boolean;
}) {
  const [form, setForm] = useState<ProgramaEntrada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const nombreDe = (lista: Opcion[], ids: string[]) => ids.map((i) => lista.find((x) => x.id === i)?.nombre).filter(Boolean).join(", ");

  const guardar = (f: ProgramaEntrada) => iniciar(async () => {
    const r = await guardarPrograma(empresaId, f);
    setError(r.ok ? null : r.mensaje);
    if (r.ok) setForm(null);
  });

  if (form) return <Formulario form={form} setForm={setForm} dependencias={dependencias} puestos={puestos} ocupado={ocupado} error={error}
    onGuardar={() => guardar(form)} onCancelar={() => { setForm(null); setError(null); }} />;

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {programas.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            Sin programas. Crea uno (p. ej. «Conservación auditiva») o pídeselo a tu agente.
          </li>
        )}
        {programas.map((p) => (
          <li key={p.id} className={cn("flex items-start gap-3 px-4 py-3 text-sm", !p.activo && "opacity-60")}>
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-medium">{p.nombre}{!p.activo && <span className="ml-2 text-xs font-normal text-muted-foreground">(pausado)</span>}</p>
              {p.riesgo && <p className="text-muted-foreground">Riesgo: {p.riesgo}</p>}
              <p className="text-xs text-muted-foreground">
                {p.dependencia_ids.length || p.puesto_ids.length
                  ? [nombreDe(dependencias, p.dependencia_ids), nombreDe(puestos, p.puesto_ids)].filter(Boolean).join(" · ")
                  : "Toda la empresa"}
                {p.examenes.length ? ` · ${p.examenes.length} examen${p.examenes.length === 1 ? "" : "es"}` : ""}
                {p.metas.length ? ` · ${p.metas.length} meta${p.metas.length === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            {editable && <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar ${p.nombre}`} onClick={() => setForm(aEntrada(p))}><Pencil /></Button>}
          </li>
        ))}
      </ul>
      {editable && <Button variant="outline" onClick={() => setForm({ ...VACIO })}><Plus /> Nuevo programa</Button>}
    </div>
  );
}

function Formulario({ form, setForm, dependencias, puestos, ocupado, error, onGuardar, onCancelar }: {
  form: ProgramaEntrada; setForm: (f: ProgramaEntrada) => void; dependencias: Opcion[]; puestos: Opcion[];
  ocupado: boolean; error: string | null; onGuardar: () => void; onCancelar: () => void;
}) {
  const poner = <K extends keyof ProgramaEntrada>(k: K, v: ProgramaEntrada[K]) => setForm({ ...form, [k]: v });
  const alternar = (k: "dependencia_ids" | "puesto_ids", id: string) =>
    poner(k, form[k].includes(id) ? form[k].filter((x) => x !== id) : [...form[k], id]);

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onGuardar(); }}>
      <Campo etiqueta="Nombre del programa">
        <Input autoFocus value={form.nombre} onChange={(e) => poner("nombre", e.target.value)} placeholder="Conservación auditiva" maxLength={120} />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Riesgo que vigila"><Input value={form.riesgo} onChange={(e) => poner("riesgo", e.target.value)} placeholder="Ruido" maxLength={200} /></Campo>
        <Campo etiqueta="Proyecto o contrato"><Input value={form.proyecto} onChange={(e) => poner("proyecto", e.target.value)} placeholder="Opcional" maxLength={200} /></Campo>
      </div>
      <Campo etiqueta="Condiciones">
        <Textarea value={form.condiciones} onChange={(e) => poner("condiciones", e.target.value)} rows={3} maxLength={4000}
          placeholder="Qué pide esta vigilancia: criterios, quién entra, qué se reporta…" />
      </Campo>

      <Campo etiqueta="A quién cubre" ayuda="Si no marcas nada, cubre a toda la empresa.">
        {dependencias.length + puestos.length === 0 ? (
          <p className="text-sm text-muted-foreground">La empresa no tiene dependencias ni puestos todavía: cubrirá a todos.</p>
        ) : (
          <div className="space-y-2">
            {dependencias.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Dependencias</p>
                <div className="flex flex-wrap gap-1.5">
                  {dependencias.map((d) => <Ficha key={d.id} si={form.dependencia_ids.includes(d.id)} onClick={() => alternar("dependencia_ids", d.id)}>{d.nombre}</Ficha>)}
                </div>
              </div>
            )}
            {puestos.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Cargos</p>
                <div className="flex flex-wrap gap-1.5">
                  {puestos.map((p) => <Ficha key={p.id} si={form.puesto_ids.includes(p.id)} onClick={() => alternar("puesto_ids", p.id)}>{p.nombre}</Ficha>)}
                </div>
              </div>
            )}
          </div>
        )}
      </Campo>

      <Campo etiqueta="Exámenes y cada cuántos meses">
        <Filas
          filas={form.examenes}
          vacia={{ nombre: "", cada_meses: 12 }}
          onCambio={(f) => poner("examenes", f)}
          agregar="Agregar examen"
          render={(e, cambiar) => (
            <>
              <Input value={e.nombre} onChange={(x) => cambiar({ ...e, nombre: x.target.value })} placeholder="Audiometría" maxLength={120} aria-label="Examen" className="h-9 min-w-0 flex-1" />
              <Input type="number" min={1} max={120} inputMode="numeric" value={e.cada_meses ?? ""} aria-label="Meses entre exámenes"
                onChange={(x) => cambiar({ ...e, cada_meses: x.target.value ? Number(x.target.value) : null })} className="h-9 w-20" />
              <span className="text-xs text-muted-foreground">meses</span>
            </>
          )}
        />
      </Campo>

      <Campo etiqueta="Metas">
        <Filas
          filas={form.metas}
          vacia={{ indicador: "", meta: "" }}
          onCambio={(f) => poner("metas", f)}
          agregar="Agregar meta"
          render={(m, cambiar) => (
            <>
              <Input value={m.indicador} onChange={(x) => cambiar({ ...m, indicador: x.target.value })} placeholder="Trabajadores evaluados" maxLength={200} aria-label="Meta" className="h-9 min-w-0 flex-1 max-sm:basis-full" />
              <Input value={m.meta} onChange={(x) => cambiar({ ...m, meta: x.target.value })} placeholder="100 %" maxLength={120} aria-label="Valor de la meta (%)" className="h-9 w-24" />
            </>
          )}
        />
      </Campo>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-primary" checked={form.activo} onChange={(e) => poner("activo", e.target.checked)} />
        Activo (sale en Reportes y en el informe)
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={ocupado || form.nombre.trim().length < 3}>{ocupado && <Loader2 className="animate-spin" />} Guardar</Button>
        <Button type="button" variant="ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</Button>
      </div>
    </form>
  );
}

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{etiqueta}</p>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

function Ficha({ si, onClick, children }: { si: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={si} onClick={onClick}
      className={cn("inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors max-sm:min-h-11",
        si ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
      {si && <Check className="size-3.5" aria-hidden />}
      {children}
    </button>
  );
}

function Filas<T>({ filas, vacia, onCambio, agregar, render }: {
  filas: T[]; vacia: T; onCambio: (f: T[]) => void; agregar: string; render: (fila: T, cambiar: (f: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {filas.map((f, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {render(f, (n) => onCambio(filas.map((x, j) => (j === i ? n : x))))}
          <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Quitar" onClick={() => onCambio(filas.filter((_, j) => j !== i))}><Trash2 /></Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onCambio([...filas, { ...vacia }])}><Plus /> {agregar}</Button>
    </div>
  );
}
