"use client";

import { useState, useTransition } from "react";
import { Loader2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { depurarNomina } from "./acciones";
import { hoyCaracas, sumarMeses } from "@/lib/fecha";

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";
const haceUnAno = () => sumarMeses(hoyCaracas(), -12);

/** Marca como egresados, en lote, a los trabajadores que no se atienden desde una fecha (ej. ya no trabajan en la empresa). */
export function DepurarNomina({ empresas, empresaInicial }: { empresas: { id: string; nombre: string }[]; empresaInicial: string }) {
  const [abierto, setAbierto] = useState(false);
  const [empresa, setEmpresa] = useState(empresaInicial);
  const [desde, setDesde] = useState(haceUnAno);
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();

  const contar = () => iniciar(async () => {
    const r = await depurarNomina(empresa || null, desde, false);
    setCantidad(r.ok ? r.cantidad ?? 0 : null);
    setMensaje(r.ok ? null : { ok: false, texto: r.mensaje });
  });
  const aplicar = () => iniciar(async () => {
    const r = await depurarNomina(empresa || null, desde, true);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    setCantidad(null);
  });

  return (
    <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); setCantidad(null); setMensaje(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><UserMinus /> Depurar nómina</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar egresados en lote</DialogTitle>
          <DialogDescription>
            Pasa a «Egresado» a los trabajadores activos, en reposo o aspirantes que no tienen ninguna consulta desde la fecha que elijas.
            Sus historias no se borran y puedes volver a activarlos uno por uno.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="dep-empresa" className="mb-1.5">Empresa</Label>
            <select id="dep-empresa" className={SELECT} value={empresa} onChange={(e) => { setEmpresa(e.target.value); setCantidad(null); }}>
              <option value="">Todas las empresas</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="dep-desde" className="mb-1.5">Sin consulta desde</Label>
            <Input id="dep-desde" type="date" className="h-10" value={desde} onChange={(e) => { setDesde(e.target.value); setCantidad(null); }} />
          </div>
          {mensaje && <p className={mensaje.ok ? "text-sm text-ok-texto" : "text-sm text-destructive"}>{mensaje.texto}</p>}
          {cantidad === null ? (
            <Button className="w-full" onClick={contar} disabled={ocupado}>{ocupado && <Loader2 className="animate-spin" />} Calcular cuántos son</Button>
          ) : cantidad === 0 ? (
            <p className="text-sm text-muted-foreground">No hay trabajadores para marcar con esos filtros.</p>
          ) : (
            <Button variant="destructive" className="w-full" onClick={aplicar} disabled={ocupado}>
              {ocupado && <Loader2 className="animate-spin" />} Marcar {cantidad} como egresados
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
