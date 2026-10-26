"use client";

import { useState, useTransition } from "react";
import { Calculator, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarHoras } from "./acciones";

export type MesHoras = { mes: string; horas: number | null; trabajadores: number | null; metodo: "nomina" | "estimado" };

const NOMBRE_MES = new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric", timeZone: "UTC" });

// Días hábiles (lunes a viernes) del mes
function diasHabiles(mes: string) {
  const d = new Date(mes + "T00:00:00Z");
  const m = d.getUTCMonth();
  let n = 0;
  while (d.getUTCMonth() === m) {
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export function HorasTrabajadas({ empresaId, inicial, trabajadoresActuales, editable }: { empresaId: string; inicial: MesHoras[]; trabajadoresActuales: number; editable: boolean }) {
  const [filas, setFilas] = useState(inicial);
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const cambiar = (i: number, c: Partial<MesHoras>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...c } : f)));

  // COVENIN 474, 5.2: sin nómina, trabajadores × 8 h × días hábiles, declarando el método
  const estimar = () =>
    setFilas(filas.map((f) => {
      if (f.horas !== null && f.metodo === "nomina") return f;
      const t = f.trabajadores ?? trabajadoresActuales;
      return { ...f, trabajadores: t, horas: t * 8 * diasHabiles(f.mes), metodo: "estimado" };
    }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Base de los índices de accidentalidad. Carga las horas de la nómina; si no las tienes, <b>Estimar</b> calcula trabajadores × 8 h × días hábiles (COVENIN 474, 5.2).
      </p>
      <div className="divide-y rounded-lg border">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-2 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Mes</span><span>Trabajadores</span><span>Horas hombre</span><span>Método</span>
        </div>
        {filas.map((f, i) => (
          <div key={f.mes} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-2 px-3 py-1.5 text-sm">
            <span className="first-letter:uppercase">{NOMBRE_MES.format(new Date(f.mes + "T00:00:00Z"))}</span>
            <Input type="number" min={0} disabled={!editable} value={f.trabajadores ?? ""} className="h-8" onChange={(e) => cambiar(i, { trabajadores: e.target.value === "" ? null : Number(e.target.value) })} />
            <Input type="number" min={0} disabled={!editable} value={f.horas ?? ""} className="h-8" onChange={(e) => cambiar(i, { horas: e.target.value === "" ? null : Number(e.target.value), metodo: "nomina" })} />
            <select disabled={!editable} value={f.metodo} onChange={(e) => cambiar(i, { metodo: e.target.value as MesHoras["metodo"] })} className="h-8 rounded-md border bg-transparent px-2 text-sm">
              <option value="nomina">Nómina</option>
              <option value="estimado">Estimado</option>
            </select>
          </div>
        ))}
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={estimar}><Calculator /> Estimar los vacíos</Button>
          <Button size="sm" disabled={ocupado} onClick={() => iniciar(async () => setAviso(await guardarHoras(empresaId, filas.filter((f) => f.horas !== null))))}>
            {ocupado ? <Loader2 className="animate-spin" /> : <Save />} Guardar horas
          </Button>
          {aviso && <span className={aviso.ok ? "text-sm text-ok-texto" : "text-sm text-destructive"}>{aviso.mensaje}</span>}
        </div>
      )}
    </div>
  );
}
