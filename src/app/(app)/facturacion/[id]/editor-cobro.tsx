"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRightLeft, CheckCircle2, Loader2, Plus, Printer, Save, Send, ThumbsDown, ThumbsUp, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bs, type Cobro, type EstadoCobro, etiquetaEstado, type Servicio, totales, usd } from "@/lib/facturacion-tipos";
import { cn } from "@/lib/utils";
import { actualizarCobro, convertirPresupuesto, eliminarCobro } from "../acciones";
import { confirmar } from "@/components/app/confirmar";
import { hoyCaracas } from "@/lib/fecha";

const f = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

export function EditorCobro({ inicial, editable, servicios, precios }: { inicial: Cobro; editable: boolean; servicios: Servicio[]; precios: Record<string, number> }) {
  const [c, setC] = useState(inicial);
  const [guardado, setGuardado] = useState(JSON.stringify(inicial));
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const set = <K extends keyof Cobro>(k: K, v: Cobro[K]) => setC((x) => ({ ...x, [k]: v }));
  const t = totales(c);
  const borrador = c.estado === "borrador";
  const cambios = JSON.stringify(c) !== guardado;
  const presupuesto = c.tipo === "presupuesto";
  const nombre = presupuesto ? "Presupuesto" : "Nota de cobro";
  // Agregar un servicio del catálogo (asesorías por hora, evaluaciones de puesto, paquetes de exámenes…)
  const agregar = (id: string) => {
    const s = servicios.find((x) => x.id === id);
    if (s) set("items", [...c.items, { id: "", servicioId: s.id, consultaId: null, descripcion: s.nombre, detalle: "", cantidad: 1, precioUsd: precios[s.id] ?? s.precioUsd }]);
  };

  const guardar = (nuevoEstado?: EstadoCobro) =>
    iniciar(async () => {
      const siguiente = { ...c, ...(nuevoEstado ? { estado: nuevoEstado } : {}), ...(nuevoEstado === "pagada" && !c.fechaPago ? { fechaPago: hoyCaracas() } : {}) };
      const r = await actualizarCobro(siguiente);
      setAviso(r);
      if (r.ok) { setC(siguiente); setGuardado(JSON.stringify(siguiente)); }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{nombre} #{c.numero}</h1>
          <p className="text-muted-foreground">{c.empresa} · {c.rif} · {f(c.fecha)}{c.desde && ` · periodo ${f(c.desde)} al ${f(c.hasta)}`}</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{etiquetaEstado(c.tipo, c.estado)}</span>
        <Button variant="outline" asChild><Link href={`/imprimir/cobro/${c.id}`} target="_blank"><Printer /> Imprimir</Link></Button>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="px-0">
          <div className="grid grid-cols-[minmax(0,3fr)_5rem_7rem_7rem_auto] gap-2 border-b bg-muted/40 px-5 py-2 text-xs font-medium text-muted-foreground">
            <span>Descripción</span><span className="text-right">Cant.</span><span className="text-right">Precio $</span><span className="text-right">Importe $</span><span />
          </div>
          {c.items.map((i, k) => (
            <div key={k} className="grid grid-cols-[minmax(0,3fr)_5rem_7rem_7rem_auto] items-center gap-2 border-b px-5 py-2 text-sm last:border-0">
              <div><div className="font-medium">{i.descripcion}</div>{i.detalle && <div className="text-xs text-muted-foreground">{i.detalle}</div>}</div>
              {borrador && editable ? (
                <>
                  <Input type="number" min={0} step="0.5" value={i.cantidad} className="h-8 text-right" onChange={(e) => set("items", c.items.map((x, j) => (j === k ? { ...x, cantidad: Number(e.target.value) } : x)))} />
                  <Input type="number" min={0} step="0.01" value={i.precioUsd} className="h-8 text-right" onChange={(e) => set("items", c.items.map((x, j) => (j === k ? { ...x, precioUsd: Number(e.target.value) } : x)))} />
                </>
              ) : (
                <><span className="text-right tabular-nums">{i.cantidad}</span><span className="text-right tabular-nums">{i.precioUsd.toFixed(2)}</span></>
              )}
              <span className="text-right font-medium tabular-nums">{(i.cantidad * i.precioUsd).toFixed(2)}</span>
              {borrador && editable ? (
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("items", c.items.filter((_, j) => j !== k))}><Trash2 className="size-4" /></button>
              ) : <span />}
            </div>
          ))}
          {c.items.length === 0 && <p className="px-5 py-6 text-center text-sm text-muted-foreground">Agrega servicios del catálogo.</p>}
          {borrador && editable && (
            <div className="flex items-center gap-2 border-t px-5 py-3">
              <Plus className="size-4 text-muted-foreground" />
              <select value="" onChange={(e) => agregar(e.target.value)} className="h-9 flex-1 rounded-md border bg-transparent px-2 text-sm">
                <option value="">Agregar servicio…</option>
                {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {usd(precios[s.id] ?? s.precioUsd)} por {s.unidad}</option>)}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label className="mb-1.5">Tasa BCV (Bs/$)</Label><Input type="number" step="0.0001" disabled={!editable || c.estado === "pagada"} value={c.tasaBcv ?? ""} onChange={(e) => set("tasaBcv", e.target.value ? Number(e.target.value) : null)} /></div>
            <div><Label className="mb-1.5">Nº de factura fiscal</Label><Input disabled={!editable} value={c.numeroFacturaFiscal} placeholder="Cuando la emitas en el sistema fiscal" onChange={(e) => set("numeroFacturaFiscal", e.target.value)} /></div>
            <div><Label className="mb-1.5">IVA %</Label><Input type="number" min={0} disabled={!editable || !borrador} value={c.ivaPct} onChange={(e) => set("ivaPct", Number(e.target.value))} /></div>
            <div><Label className="mb-1.5">IGTF % (pago en divisas)</Label><Input type="number" min={0} disabled={!editable || !borrador} value={c.igtfPct} onChange={(e) => set("igtfPct", Number(e.target.value))} /></div>
            <div className="sm:col-span-2"><Label className="mb-1.5">Observación</Label><Input disabled={!editable} value={c.observacion} onChange={(e) => set("observacion", e.target.value)} /></div>
            {presupuesto && <div><Label className="mb-1.5">Válido hasta</Label><Input type="date" disabled={!editable || !borrador} value={c.vence ?? ""} onChange={(e) => set("vence", e.target.value || null)} /></div>}
            {c.estado === "pagada" && <div><Label className="mb-1.5">Fecha de pago</Label><Input type="date" disabled={!editable} value={c.fechaPago ?? ""} onChange={(e) => set("fechaPago", e.target.value || null)} /></div>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{usd(t.subtotal)}</span></div>
            {c.ivaPct > 0 && <div className="flex justify-between"><span>IVA {c.ivaPct} %</span><span className="tabular-nums">{usd(t.iva)}</span></div>}
            {c.igtfPct > 0 && <div className="flex justify-between"><span>IGTF {c.igtfPct} %</span><span className="tabular-nums">{usd(t.igtf)}</span></div>}
            <div className="flex justify-between border-t pt-2 text-lg font-semibold"><span>Total</span><span className="tabular-nums">{usd(t.total)}</span></div>
            {t.totalBs !== null && <div className="flex justify-between text-muted-foreground"><span>En bolívares</span><span className="tabular-nums">{bs(t.totalBs)}</span></div>}
          </CardContent>
        </Card>
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          {aviso?.mensaje && <span className={cn("text-sm", aviso.ok ? "text-ok-texto" : "text-destructive")}>{aviso.mensaje}</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            {borrador && <Button variant="ghost" className="text-destructive" disabled={ocupado} onClick={async () => (await confirmar(presupuesto ? { titulo: "¿Eliminar este presupuesto?", accion: "Eliminar", peligro: true } : { titulo: "¿Eliminar este borrador?", texto: "Las atenciones vuelven a quedar pendientes de cobro.", accion: "Eliminar", peligro: true })) && iniciar(async () => { const r = await eliminarCobro(c.id); if (r && !r.ok) setAviso(r); })}><Trash2 /> Eliminar</Button>}
            {!presupuesto && c.estado !== "anulada" && c.estado !== "borrador" && <Button variant="ghost" disabled={ocupado} onClick={async () => (await confirmar({ titulo: "¿Anular esta nota de cobro?", texto: "Queda registrada como anulada y deja de contar como deuda.", accion: "Anular", peligro: true })) && guardar("anulada")}><XCircle /> Anular</Button>}
            <Button variant="outline" disabled={ocupado || !cambios} onClick={() => guardar()}>{ocupado ? <Loader2 className="animate-spin" /> : <Save />} Guardar</Button>
            {borrador && <Button disabled={ocupado || c.items.length === 0} onClick={() => guardar("emitida")}><Send /> {presupuesto ? "Marcar enviado" : "Emitir"}</Button>}
            {!presupuesto && c.estado === "emitida" && <Button disabled={ocupado} onClick={() => guardar("pagada")}><CheckCircle2 /> Marcar pagada</Button>}
            {presupuesto && c.estado === "emitida" && <Button variant="outline" disabled={ocupado} onClick={() => guardar("rechazado")}><ThumbsDown /> Rechazado</Button>}
            {presupuesto && c.estado === "emitida" && <Button disabled={ocupado} onClick={() => guardar("aprobado")}><ThumbsUp /> Aprobado</Button>}
            {presupuesto && c.estado === "aprobado" && <Button disabled={ocupado} onClick={() => iniciar(async () => { const r = await convertirPresupuesto(c.id); if (r && !r.ok) setAviso(r); })}><ArrowRightLeft /> Convertir en nota de cobro</Button>}
          </div>
        </div>
      )}
      {!presupuesto && <p className="text-xs text-muted-foreground">La nota de cobro no sustituye la factura fiscal: emítela en tu sistema homologado o con la imprenta autorizada y anota aquí su número.</p>}
    </div>
  );
}
