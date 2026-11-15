"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Monitor, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TIPOS_EVALUACION, type TipoEvaluacion } from "@/lib/riesgos-puesto";
import { cn } from "@/lib/utils";
import { crearEvaluacionRiesgos } from "./acciones";

const SELECT = "h-10 w-full rounded-md border bg-transparent px-2 text-sm";

export function NuevaIdentificacion({ empresas, empresaInicial, motivos, tipoInicial = "general", boton }: {
  empresas: { id: string; nombre: string }[];
  empresaInicial: string | null;
  motivos: string[];
  tipoInicial?: TipoEvaluacion;
  boton?: React.ReactNode;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empresaId, setEmpresaId] = useState(empresaInicial ?? (empresas.length === 1 ? empresas[0].id : ""));
  const [tipo, setTipo] = useState<TipoEvaluacion>(tipoInicial);
  const [titulo, setTitulo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, iniciar] = useTransition();
  const empresa = empresas.find((e) => e.id === empresaId)?.nombre ?? "";

  return (
    <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); setError(null); if (v) setTipo(tipoInicial); }}>
      <DialogTrigger asChild>{boton ?? <Button size="lg"><Plus /> Nueva identificación</Button>}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva identificación de riesgos</DialogTitle>
          <DialogDescription>Después vas paso a paso: puestos, lista de chequeo, mapa y resultados. Se guarda sola.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo">
          {TIPOS_EVALUACION.map((t) => {
            const Icono = t.clave === "oficina" ? Monitor : Building2;
            return (
              <button key={t.clave} type="button" role="radio" aria-checked={tipo === t.clave} onClick={() => setTipo(t.clave)}
                className={cn("rounded-xl border-2 p-3 text-left text-sm transition", tipo === t.clave ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                <div className="flex items-center gap-1.5 font-semibold"><Icono className="size-4" />{t.nombre}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.texto}</div>
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5">Empresa</Label>
            <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={SELECT}>
              <option value="">Elige…</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <Label className="mb-1.5">Qué se evalúa</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === "oficina" ? "Ej.: Oficinas administrativas, piso 2" : `Ej.: ${empresa || "Planta"}, almacén y patio`} />
          </div>
          <div>
            <Label className="mb-1.5">Motivo</Label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={SELECT}>
              <option value="">Elige… (o después)</option>
              {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
          <Button disabled={creando || !empresaId} onClick={() => iniciar(async () => {
            const r = await crearEvaluacionRiesgos({ empresaId, titulo: titulo.trim() || (tipo === "oficina" ? "Oficinas administrativas" : `Identificación de riesgos · ${empresa}`), motivo, tipo });
            if (!r.ok || !r.id) { setError(r.mensaje); return; }
            setAbierto(false);
            router.push(`/riesgos/${r.id}`);
          })}>
            {creando && <Loader2 className="animate-spin" />} Empezar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
