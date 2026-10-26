"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Item } from "@/lib/listas";
import { claveRiesgo, ESCALA_P, ESCALA_S, GRUPOS, type GrupoRiesgo, nivelRiesgo, type Puesto } from "@/lib/puestos-tipos";
import { cn } from "@/lib/utils";
import { guardarPuesto } from "./acciones";

type Props = {
  empresaId: string;
  puesto?: Puesto;
  dependencias: { id: string; nombre: string }[];
  agentes: Item[];
  turnos: Item[];
};

const VACIO: Puesto = { id: "", codigo: "", nombre: "", dependenciaId: null, dependencia: null, descripcion: "", tareas: "", herramientas: "", turno: "", riesgos: {}, evaluacion: {}, trabajadores: 0 };
const SELECT = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

export function EditorPuesto({ empresaId, puesto, dependencias, agentes, turnos }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [p, setP] = useState<Puesto>(puesto ?? VACIO);
  const [nuevo, setNuevo] = useState<Partial<Record<GrupoRiesgo, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const set = <K extends keyof Puesto>(k: K, v: Puesto[K]) => setP((x) => ({ ...x, [k]: v }));

  const alternar = (g: GrupoRiesgo, agente: string) => {
    const lista = p.riesgos[g] ?? [];
    set("riesgos", { ...p.riesgos, [g]: lista.includes(agente) ? lista.filter((a) => a !== agente) : [...lista, agente] });
  };
  const valorar = (g: GrupoRiesgo, agente: string, campo: "p" | "s", v: number) => {
    const k = claveRiesgo(g, agente);
    set("evaluacion", { ...p.evaluacion, [k]: { ...(p.evaluacion[k] ?? { p: 0, s: 0 }), [campo]: v } });
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) { setP(puesto ?? VACIO); setError(null); }
      }}
    >
      <DialogTrigger asChild>
        {puesto ? <Button variant="ghost" size="sm"><Pencil /> Editar</Button> : <Button><Plus /> Nuevo puesto</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{puesto ? puesto.nombre : "Nuevo puesto de trabajo"}</DialogTitle>
          <DialogDescription>Los riesgos marcados salen en la ficha del trabajador, en la consulta y en la constancia de aptitud.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><Label className="mb-1.5">Nombre del cargo *</Label><Input value={p.nombre} onChange={(e) => set("nombre", e.target.value)} /></div>
          <div><Label className="mb-1.5">Código</Label><Input value={p.codigo} onChange={(e) => set("codigo", e.target.value)} /></div>
          <div>
            <Label className="mb-1.5">Turno</Label>
            <select value={p.turno} onChange={(e) => set("turno", e.target.value)} className={SELECT}>
              <option value="">Sin definir</option>
              {turnos.map((t) => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5">Dependencia</Label>
            <select value={p.dependenciaId ?? ""} onChange={(e) => set("dependenciaId", e.target.value || null)} className={SELECT}>
              <option value="">Sin dependencia</option>
              {dependencias.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><Label className="mb-1.5">Herramientas y equipos</Label><Input value={p.herramientas} onChange={(e) => set("herramientas", e.target.value)} /></div>
          <div className="sm:col-span-4"><Label className="mb-1.5">Tareas del puesto</Label><Textarea rows={2} value={p.tareas} onChange={(e) => set("tareas", e.target.value)} /></div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold">Matriz de riesgos <span className="font-normal text-muted-foreground">· marca los agentes y valora probabilidad × severidad (1 a 5)</span></div>
          {GRUPOS.map(([g, nombre]) => {
            const marcados = p.riesgos[g] ?? [];
            const catalogo = agentes.filter((a) => a.grupo === g).map((a) => a.nombre);
            const opciones = [...catalogo, ...marcados.filter((m) => !catalogo.includes(m))];
            return (
              <div key={g} className="rounded-lg border p-3">
                <div className="mb-2 text-sm font-medium">{nombre}</div>
                <div className="flex flex-wrap gap-1.5">
                  {opciones.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => alternar(g, a)}
                      className={cn("rounded-full border px-2.5 py-1 text-xs transition", marcados.includes(a) ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}
                    >
                      {a}
                    </button>
                  ))}
                  <span className="inline-flex items-center gap-1">
                    <input
                      value={nuevo[g] ?? ""}
                      onChange={(e) => setNuevo({ ...nuevo, [g]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && nuevo[g]?.trim()) {
                          e.preventDefault();
                          alternar(g, nuevo[g]!.trim());
                          setNuevo({ ...nuevo, [g]: "" });
                        }
                      }}
                      placeholder="Otro… (Enter)"
                      className="h-7 w-32 rounded-full border bg-transparent px-2.5 text-xs outline-none focus:border-primary"
                    />
                  </span>
                </div>
                {marcados.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {marcados.map((a) => {
                      const v = p.evaluacion[claveRiesgo(g, a)];
                      const n = nivelRiesgo(v);
                      return (
                        <div key={a} className="grid items-center gap-2 text-sm sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem_auto]">
                          <span className="truncate">{a}</span>
                          <select value={v?.p ?? 0} onChange={(e) => valorar(g, a, "p", Number(e.target.value))} className={SELECT}>
                            <option value={0}>Probabilidad</option>
                            {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i} · {ESCALA_P[i]}</option>)}
                          </select>
                          <select value={v?.s ?? 0} onChange={(e) => valorar(g, a, "s", Number(e.target.value))} className={SELECT}>
                            <option value={0}>Severidad</option>
                            {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i} · {ESCALA_S[i]}</option>)}
                          </select>
                          <span className={cn("rounded-full px-2 py-0.5 text-center text-xs font-medium", n ? n.clase : "bg-muted text-muted-foreground")}>
                            {n ? `${n.texto} (${n.n})` : "Sin valorar"}
                          </span>
                          <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => alternar(g, a)}><X className="size-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
          <Button
            disabled={guardando}
            onClick={() => iniciar(async () => {
              const r = await guardarPuesto(empresaId, p);
              if (r.ok) setAbierto(false);
              else setError(r.mensaje);
            })}
          >
            {guardando && <Loader2 className="animate-spin" />} Guardar puesto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
