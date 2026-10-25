"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type Atencion, bs, ETIQUETA_UNIDAD, type ItemCobro, type Servicio, servicioParaMotivo, totales, usd } from "@/lib/facturacion-tipos";
import { crearCobro } from "../acciones";

type Props = { empresaId: string; desde: string; hasta: string; atenciones: Atencion[]; servicios: Servicio[]; tasa: number | null };

const fecha = (iso: string) => iso.split("-").reverse().join("/");

export function ArmarCobro({ empresaId, desde, hasta, atenciones, servicios, tasa }: Props) {
  // Cada atención propone el servicio de su motivo; se puede cambiar o excluir
  const [lineas, setLineas] = useState(() =>
    atenciones.map((a) => {
      const s = servicioParaMotivo(servicios, a.motivoCodigo);
      return { atencion: a, incluir: Boolean(s), servicioId: s?.id ?? "", precio: s?.precioUsd ?? 0 };
    }),
  );
  const [extras, setExtras] = useState<ItemCobro[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const porId = useMemo(() => new Map(servicios.map((s) => [s.id, s])), [servicios]);

  const items: ItemCobro[] = [
    ...lineas.filter((l) => l.incluir && l.servicioId).map((l) => ({
      servicioId: l.servicioId,
      consultaId: l.atencion.id,
      descripcion: porId.get(l.servicioId)?.nombre ?? "",
      detalle: `${l.atencion.paciente} · ${l.atencion.cedula} · ${fecha(l.atencion.fecha)}`,
      cantidad: 1,
      precioUsd: l.precio,
    })),
    ...extras,
  ];
  const t = totales({ items, ivaPct: 0, igtfPct: 0, tasaBcv: tasa });
  const sinServicio = lineas.filter((l) => l.incluir && !l.servicioId).length;

  return (
    <div className="space-y-4">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-3"><CardTitle className="text-base">Atenciones del periodo ({lineas.length})</CardTitle></CardHeader>
        <CardContent className="px-0">
          {lineas.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No hay atenciones pendientes de cobro.</p>}
          <ul className="divide-y">
            {lineas.map((l, i) => (
              <li key={l.atencion.id} className="grid items-center gap-2 px-5 py-2 text-sm sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,2fr)_7rem]">
                <input type="checkbox" checked={l.incluir} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, incluir: e.target.checked } : x)))} className="size-4 accent-[var(--primary)]" />
                <div>
                  <div className="font-medium">{l.atencion.paciente}</div>
                  <div className="text-xs text-muted-foreground">{fecha(l.atencion.fecha)} · {l.atencion.cedula} · {l.atencion.motivo ?? "Sin motivo"}</div>
                </div>
                <select
                  value={l.servicioId}
                  disabled={!l.incluir}
                  onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, servicioId: e.target.value, precio: porId.get(e.target.value)?.precioUsd ?? 0 } : x)))}
                  className={`h-9 rounded-md border bg-transparent px-2 text-sm ${l.incluir && !l.servicioId ? "border-alerta" : ""}`}
                >
                  <option value="">Elegir servicio…</option>
                  {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <Input type="number" min={0} step="0.01" disabled={!l.incluir} value={l.precio} className="h-9" onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, precio: Number(e.target.value) } : x)))} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-3">
          <CardTitle className="text-base">Otros servicios</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setExtras([...extras, { servicioId: null, consultaId: null, descripcion: "", detalle: "", cantidad: 1, precioUsd: 0 }])}><Plus /> Agregar</Button>
        </CardHeader>
        <CardContent className="space-y-2 px-5 py-3">
          {extras.length === 0 && <p className="text-sm text-muted-foreground">Informes de vigilancia, asesorías por hora, evaluaciones de puestos, charlas…</p>}
          {extras.map((x, i) => (
            <div key={i} className="grid items-center gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_7rem_auto]">
              <select
                value={x.servicioId ?? ""}
                onChange={(e) => {
                  const s = porId.get(e.target.value);
                  setExtras(extras.map((y, j) => (j === i ? { ...y, servicioId: s?.id ?? null, descripcion: s?.nombre ?? y.descripcion, precioUsd: s?.precioUsd ?? y.precioUsd } : y)));
                }}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">Servicio…</option>
                {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} (por {ETIQUETA_UNIDAD[s.unidad]})</option>)}
              </select>
              <Input value={x.detalle} placeholder="Detalle (ej. informe del III trimestre)" className="h-9" onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, detalle: e.target.value } : y)))} />
              <Input type="number" min={0} step="0.5" value={x.cantidad} title="Cantidad u horas" className="h-9" onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, cantidad: Number(e.target.value) } : y)))} />
              <Input type="number" min={0} step="0.01" value={x.precioUsd} className="h-9" onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, precioUsd: Number(e.target.value) } : y)))} />
              <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setExtras(extras.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4">
        <div>
          <div className="text-sm text-muted-foreground">{items.length} renglones</div>
          <div className="text-2xl font-semibold">{usd(t.total)}</div>
          {t.totalBs !== null ? <div className="text-sm text-muted-foreground">{bs(t.totalBs)} a tasa {tasa}</div> : <div className="text-sm text-amber-700">Carga la tasa BCV para ver el monto en Bs.</div>}
        </div>
        {sinServicio > 0 && <p className="text-sm text-alerta">{sinServicio} atenciones marcadas sin servicio: elígelo o desmárcalas.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          size="lg"
          className="ml-auto"
          disabled={ocupado || items.length === 0 || sinServicio > 0}
          onClick={() => iniciar(async () => {
            const r = await crearCobro({ empresaId, desde, hasta, tasaBcv: tasa, items });
            if (r && !r.ok) setError(r.mensaje);
          })}
        >
          {ocupado && <Loader2 className="animate-spin" />} Crear nota de cobro
        </Button>
      </div>
    </div>
  );
}
