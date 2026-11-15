"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idGrupo } from "@/lib/psicosocial";
import { crearPsicosocial } from "./acciones";

type Props = { empresas: { id: string; nombre: string }[]; empresaInicial: string | null; puestos: Record<string, string[]>; anio: string };

const SELECT = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

export function NuevaPsicosocial({ empresas, empresaInicial, puestos, anio }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empresaId, setEmpresaId] = useState(empresaInicial ?? (empresas.length === 1 ? empresas[0].id : ""));
  const [titulo, setTitulo] = useState(`Riesgos psicosociales ${anio}`);
  const [trabajadores, setTrabajadores] = useState("");
  const [grupos, setGrupos] = useState<string[]>([]);
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, iniciar] = useTransition();
  const sugeridos = useMemo(() => (puestos[empresaId] ?? []).filter((p) => !grupos.includes(p)).slice(0, 30), [puestos, empresaId, grupos]);

  const agregar = (n: string) => { const t = n.trim().slice(0, 120); if (t && !grupos.includes(t) && grupos.length < 40) setGrupos([...grupos, t]); setNuevo(""); };

  const crear = () => iniciar(async () => {
    setError(null);
    const ids: string[] = [];
    const lista = grupos.map((nombre) => { const id = idGrupo(ids); ids.push(id); return { id, nombre }; });
    const r = await crearPsicosocial({ empresaId, titulo, trabajadores: trabajadores ? Number(trabajadores) : null, grupos: lista });
    if (!r.ok) { setError(r.mensaje); return; }
    setAbierto(false);
    router.push(`/psicosocial/${r.id}`);
  });

  return (
    <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); setError(null); }}>
      <DialogTrigger asChild><Button size="lg"><Plus /> Nueva evaluación</Button></DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva evaluación psicosocial</DialogTitle>
          <DialogDescription>Para toda la plantilla de una empresa. Los puestos o áreas sirven para ver resultados por grupo; puedes cambiarlos después.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ps-empresa">Empresa</Label>
            <select id="ps-empresa" className={SELECT} value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setGrupos([]); }}>
              <option value="">Elige…</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="ps-titulo">Nombre</Label>
              <Input id="ps-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-trab">Trabajadores</Label>
              <Input id="ps-trab" inputMode="numeric" value={trabajadores} onChange={(e) => setTrabajadores(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Ej. 48" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-grupo">Puestos o áreas</Label>
            {grupos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {grupos.map((g) => (
                  <span key={g} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pr-1 pl-3 text-sm text-primary">
                    {g}
                    <button type="button" onClick={() => setGrupos(grupos.filter((x) => x !== g))} className="rounded-full p-0.5 hover:bg-primary/20" aria-label={`Quitar ${g}`}><X className="size-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input id="ps-grupo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(nuevo); } }} placeholder="Ej. Almacén y despacho" />
              <Button type="button" variant="outline" onClick={() => agregar(nuevo)} disabled={!nuevo.trim()}>Agregar</Button>
            </div>
            {sugeridos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Puestos de la empresa:</span>
                {sugeridos.map((p) => (
                  <button key={p} type="button" onClick={() => agregar(p)} className="rounded-full border px-2.5 py-0.5 text-xs hover:border-primary">+ {p}</button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Mejor áreas amplias que cargos de una sola persona: los grupos con menos de 5 respuestas se juntan para proteger el anonimato.</p>
          </div>
          {error && <p role="alert" className="text-sm text-alerta-texto">{error}</p>}
          <Button className="w-full" onClick={crear} disabled={creando || !empresaId}>
            {creando && <Loader2 className="animate-spin" />} Crear evaluación
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
