"use client";

import { useState, useTransition } from "react";
import { Banknote, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bs, type Cobro, ETIQUETA_METODO, type MetodoPago, METODO_EN_BS, saldo, usd } from "@/lib/facturacion-tipos";
import { hoyCaracas } from "@/lib/fecha";
import { tasaParaFecha } from "@/lib/tasa-bcv";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/app/confirmar";
import { eliminarPago, registrarPago, type ResultadoPago } from "../acciones";

const f = (iso: string) => iso.split("-").reverse().join("/");
const num = (n: number, d = 2) => n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d });

// Pagos y abonos de una nota de cobro (Cesar, 14-nov-2026): forma de pago, referencia y monto; la nota pasa sola a
// «pagada» cuando lo abonado cubre el total. Lo pagado en bolívares lleva la tasa BCV del día del pago.
export function PagosCobro({ c, editable, tasas, alCambiar }: { c: Cobro; editable: boolean; tasas: { fecha: string; tasa: number }[]; alCambiar: (r: ResultadoPago) => void }) {
  const s = saldo(c);
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [fecha, setFecha] = useState(hoyCaracas());
  const [metodo, setMetodo] = useState<MetodoPago | "">("");
  const [referencia, setReferencia] = useState("");
  const [monto, setMonto] = useState("");
  const [tasa, setTasa] = useState("");
  const enBs = metodo !== "" && METODO_EN_BS.includes(metodo);
  const tasaDelDia = tasaParaFecha(tasas, fecha);
  const tasaUsada = Number(tasa) > 0 ? Number(tasa) : tasaDelDia?.tasa ?? null;
  const montoN = Number(monto);

  const abrir = () => {
    setFecha(hoyCaracas()); setMetodo(""); setReferencia(""); setTasa("");
    setMonto(s.falta > 0 ? s.falta.toFixed(2) : ""); setAviso(null); setAbierto(true);
  };
  const tras = (r: ResultadoPago) => { setAviso(r); if (r.ok) alCambiar(r); };
  const guardar = () =>
    iniciar(async () => {
      if (!metodo) return setAviso({ ok: false, mensaje: "Elige la forma de pago." });
      const r = await registrarPago(c.id, { fecha, metodo, referencia, montoUsd: montoN, tasaBcv: enBs ? tasaUsada : null });
      tras(r);
      if (r.ok) setAbierto(false);
    });

  if (c.tipo !== "cobro" || (c.estado !== "emitida" && c.pagos.length === 0)) return null;

  return (
    <Card data-prueba="pagos-cobro" className="gap-0 py-0">
      <CardContent className="px-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold"><Banknote className="size-4 text-muted-foreground" /> Pagos recibidos</h2>
          <span className="text-sm text-muted-foreground">Pagado <b className="text-foreground tabular-nums">{usd(s.pagado)}</b></span>
          <span className={cn("text-sm", s.falta > 0 ? "text-alerta-texto" : "text-ok-texto")}>
            {s.falta > 0 ? <>Falta <b className="tabular-nums">{usd(s.falta)}</b></> : "Pagada completa"}
          </span>
          {editable && c.estado === "emitida" && !abierto && <Button size="sm" className="ml-auto" onClick={abrir}><Plus /> Registrar pago</Button>}
        </div>

        {c.pagos.length === 0 && !abierto && <p className="px-5 py-4 text-sm text-muted-foreground">Aún no hay pagos. Con «Registrar pago» anotas cómo pagó la empresa; si paga en partes, registra cada abono.</p>}
        {c.pagos.map((p) => (
          <div key={p.id} className="grid grid-cols-[6rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-b px-5 py-2 text-sm last:border-0 sm:grid-cols-[6rem_10rem_minmax(0,1fr)_auto_auto]">
            <span className="tabular-nums">{f(p.fecha)}</span>
            <span className="truncate font-medium">{ETIQUETA_METODO[p.metodo]}</span>
            <span className="hidden truncate text-muted-foreground sm:block">{p.referencia ? `Ref. ${p.referencia}` : "Sin referencia"}</span>
            <span className="text-right">
              <span className="font-medium tabular-nums">{usd(p.montoUsd)}</span>
              {p.tasaBcv && <span className="block text-xs text-muted-foreground tabular-nums">{bs(p.montoUsd * p.tasaBcv)}</span>}
            </span>
            {editable ? (
              <button type="button" aria-label="Borrar este abono" className="text-muted-foreground hover:text-destructive" disabled={ocupado}
                onClick={async () => (await confirmar({ titulo: "¿Borrar este abono?", texto: s.cubierta ? "La nota vuelve a quedar pendiente de pago." : "Deja de contar como pagado.", accion: "Borrar", peligro: true })) && iniciar(async () => tras(await eliminarPago(p.id, c.id)))}>
                <Trash2 className="size-4" />
              </button>
            ) : <span />}
          </div>
        ))}

        {abierto && (
          <div className="space-y-3 border-t bg-muted/30 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label className="mb-1.5">Fecha del pago</Label><Input type="date" max={hoyCaracas()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
              <div>
                <Label className="mb-1.5">Forma de pago</Label>
                <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago | "")} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">Elige…</option>
                  {Object.entries(ETIQUETA_METODO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><Label className="mb-1.5">Referencia</Label><Input value={referencia} maxLength={80} placeholder="Nº de operación (opcional)" onChange={(e) => setReferencia(e.target.value)} /></div>
              <div>
                <Label className="mb-1.5">Monto en $</Label>
                <Input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
                {s.falta > 0 && montoN > 0 && montoN < s.falta - 0.004 && <p className="mt-1 text-xs text-muted-foreground">Abono: quedarán {usd(s.falta - montoN)} por pagar.</p>}
              </div>
            </div>
            {enBs && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="mb-1.5">Tasa BCV del día del pago</Label>
                  <Input type="number" step="0.0001" value={tasa} placeholder={tasaDelDia ? num(tasaDelDia.tasa, 4) : "Se toma la del BCV"} onChange={(e) => setTasa(e.target.value)} />
                  {tasaDelDia && !tasa && <p className="mt-1 text-xs text-muted-foreground">BCV del {f(tasaDelDia.fecha)}.</p>}
                </div>
                {tasaUsada && montoN > 0 && <div className="flex items-end pb-2 text-sm">Recibes <b className="ml-1 tabular-nums">{bs(montoN * tasaUsada)}</b></div>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {aviso && !aviso.ok && <span className="text-sm text-destructive">{aviso.mensaje}</span>}
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" disabled={ocupado} onClick={() => setAbierto(false)}><X /> Cancelar</Button>
                <Button disabled={ocupado || !metodo || !(montoN > 0)} onClick={guardar}>{ocupado ? <Loader2 className="animate-spin" /> : <Banknote />} Guardar pago</Button>
              </div>
            </div>
          </div>
        )}
        {aviso && (aviso.ok || !abierto) && <p className={cn("border-t px-5 py-2 text-sm", aviso.ok ? "text-ok-texto" : "text-destructive")}>{aviso.mensaje}</p>}
      </CardContent>
    </Card>
  );
}
