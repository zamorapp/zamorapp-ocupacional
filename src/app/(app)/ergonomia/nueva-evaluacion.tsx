"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NIOSH, REBA, ROSA, RULA, type ClaveMetodo } from "@/lib/ergonomia";
import { DEB } from "@/lib/ergonomia-deb";
import { cn } from "@/lib/utils";
import { crearEvaluacion } from "./acciones";

type Props = {
  empresas: { id: string; nombre: string }[];
  empresaInicial: string | null;
  puestos: Record<string, { id: string; nombre: string; tareas: string }[]>;
  // Desde la ficha de la empresa: puesto ya elegido
  fijo?: { empresaId: string; puestoId: string; puesto: string; tareas: string };
  boton?: React.ReactNode;
};

const SELECT = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const OPCIONES: { clave: ClaveMetodo; titulo: string; texto: string }[] = [
  { clave: "deb", titulo: "DEB (CENEA)", texto: DEB.paraQue },
  { clave: "rula", titulo: "RULA", texto: RULA.paraQue },
  { clave: "reba", titulo: "REBA", texto: REBA.paraQue },
  { clave: "rosa", titulo: "ROSA", texto: ROSA.paraQue },
  { clave: "niosh", titulo: "NIOSH", texto: NIOSH.paraQue },
  { clave: "libre", titulo: "Inspección con hallazgos", texto: "Fotos y lista de riesgos con prioridad y recomendaciones, sin puntaje de postura." },
];

export function NuevaEvaluacion({ empresas, empresaInicial, puestos, fijo, boton }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empresaId, setEmpresaId] = useState(fijo?.empresaId ?? empresaInicial ?? (empresas.length === 1 ? empresas[0].id : ""));
  const [puestoId, setPuestoId] = useState(fijo?.puestoId ?? "");
  const [puesto, setPuesto] = useState(fijo?.puesto ?? "");
  const [tarea, setTarea] = useState(fijo?.tareas?.split("\n")[0]?.slice(0, 200) ?? "");
  const [metodo, setMetodo] = useState<ClaveMetodo>("deb");
  const [error, setError] = useState<string | null>(null);
  const [creando, iniciar] = useTransition();
  const lista = puestos[empresaId] ?? [];

  return (
    <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); setError(null); }}>
      <DialogTrigger asChild>{boton ?? <Button size="lg"><Plus /> Nueva evaluación</Button>}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva evaluación ergonómica</DialogTitle>
          <DialogDescription>Elige el puesto y el método. Después tomas las fotos y marcas las posturas.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!fijo && (
            <>
              <div>
                <Label className="mb-1.5">Empresa</Label>
                <select value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setPuestoId(""); setPuesto(""); }} className={SELECT}>
                  <option value="">Elige…</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div>
                <Label className="mb-1.5">Puesto</Label>
                <select
                  value={puestoId || (puesto ? "otro" : "")}
                  disabled={!empresaId}
                  onChange={(e) => {
                    const p = lista.find((x) => x.id === e.target.value);
                    setPuestoId(p?.id ?? "");
                    setPuesto(p?.nombre ?? (e.target.value === "otro" ? " " : ""));
                    if (p?.tareas && !tarea) setTarea(p.tareas.split("\n")[0].slice(0, 200));
                  }}
                  className={SELECT}
                >
                  <option value="">Elige…</option>
                  {lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  <option value="otro">Otro (escribirlo)</option>
                </select>
              </div>
              {!puestoId && puesto && (
                <div className="sm:col-span-2"><Label className="mb-1.5">Nombre del puesto</Label><Input autoFocus value={puesto.trimStart()} onChange={(e) => setPuesto(e.target.value || " ")} /></div>
              )}
            </>
          )}
          <div className="sm:col-span-2">
            <Label className="mb-1.5">Tarea que se observa</Label>
            <Input value={tarea} onChange={(e) => setTarea(e.target.value)} placeholder="Ej.: cobro en caja, carga de sacos al camión" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Método</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
            {OPCIONES.map((o) => (
              <button
                key={o.clave}
                type="button"
                role="radio"
                aria-checked={metodo === o.clave}
                onClick={() => setMetodo(o.clave)}
                className={cn("rounded-lg border-2 p-3 text-left text-sm transition", metodo === o.clave ? "border-primary bg-primary/10" : "hover:bg-muted")}
              >
                <div className="flex items-center gap-1.5 font-semibold">{o.clave === "libre" && <ClipboardList className="size-4" />}{o.titulo}</div>
                <div className="mt-1 text-xs text-muted-foreground">{o.texto}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">¿No sabes por dónde empezar? Haz primero el DEB: te dice qué método específico usar. OCRA y KIM llegan en las próximas versiones.</p>
        </div>

        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
          <Button
            disabled={creando}
            onClick={() => iniciar(async () => {
              const r = await crearEvaluacion({ empresaId, puestoId: puestoId || null, puesto: puesto.trim(), tarea, metodo });
              if (!r.ok || !r.id) { setError(r.mensaje); return; }
              setAbierto(false);
              router.push(`/ergonomia/${r.id}`);
            })}
          >
            {creando && <Loader2 className="animate-spin" />} Empezar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
