"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type Atencion, bs, ETIQUETA_UNIDAD, type ItemCobro, type Servicio, servicioParaCategoria, servicioParaMotivo, type SugerenciaCobro, totales, usd } from "@/lib/facturacion-tipos";
import { crearCobro } from "../acciones";

type Props = { empresaId: string; desde: string; hasta: string; atenciones: Atencion[]; servicios: Servicio[]; tasa: number | null; aFactura?: boolean; sugerencias?: SugerenciaCobro[] };

const fecha = (iso: string) => iso.split("-").reverse().join("/");

// Renglón de «Otros servicios»; «clave» si viene de una sugerencia marcada arriba (al desmarcarla se quita)
type Extra = ItemCobro & { clave?: string };

export function ArmarCobro({ empresaId, desde, hasta, atenciones, servicios, tasa, aFactura = false, sugerencias = [] }: Props) {
  // Cada atención propone el servicio de su motivo; se puede cambiar o excluir
  const [lineas, setLineas] = useState(() =>
    atenciones.map((a) => {
      const s = servicioParaMotivo(servicios, a.motivoCodigo);
      return { atencion: a, incluir: Boolean(s), servicioId: s?.id ?? "", precio: s?.precioUsd ?? 0 };
    }),
  );
  const [extras, setExtras] = useState<Extra[]>([]);
  // «¿Facturar también…?»: lo hecho en el período para la empresa (vigilancia, puestos…). Al marcarlo pasa a
  // «Otros servicios» como un renglón más (precio editable, «Quitar»); al desmarcarlo se quita.
  const elegidas = new Set(extras.map((x) => x.clave).filter(Boolean));
  const [preguntaVista, setPreguntaVista] = useState(true);
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
    ...extras.map((x) => ({ servicioId: x.servicioId, consultaId: x.consultaId, descripcion: x.descripcion, detalle: x.detalle, cantidad: x.cantidad, precioUsd: x.precioUsd })),
  ];
  const t = totales({ items, ivaPct: 0, igtfPct: 0, tasaBcv: tasa });
  const sinServicio = lineas.filter((l) => l.incluir && !l.servicioId).length;

  const alternar = (x: SugerenciaCobro) => {
    if (elegidas.has(x.clave)) return setExtras(extras.filter((y) => y.clave !== x.clave));
    const sv = servicioParaCategoria(servicios, x.categoria);
    setExtras([...extras, { clave: x.clave, servicioId: sv?.id ?? null, consultaId: null, descripcion: sv?.nombre ?? x.titulo, detalle: x.detalle, cantidad: 1, precioUsd: sv?.precioUsd ?? 0 }]);
  };

  return (
    <div className="space-y-4">
      {preguntaVista && sugerencias.length > 0 && (
        <div data-aviso="otros-servicios" className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-medium">¿Facturarás también otros servicios?</div>
              <div className="text-sm text-muted-foreground">Se hizo esto para la empresa en el período y no está cobrado. Marca lo que quieres agregar; lo demás (asesorías, charlas…) va con «Agregar» en «Otros servicios».</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPreguntaVista(false)}>Ignorar</Button>
          </div>
          <ul className="divide-y rounded-lg border bg-card">
              {sugerencias.map((x) => {
                const sv = servicioParaCategoria(servicios, x.categoria);
                return (
                  <li key={x.clave}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input type="checkbox" checked={elegidas.has(x.clave)} onChange={() => alternar(x)} className="size-4 accent-[var(--primary)]" />
                      <span className="min-w-0 flex-1"><span className="font-medium">{sv?.nombre ?? x.titulo}</span><span className="block text-xs text-muted-foreground">{x.detalle}</span></span>
                      <span className="tabular-nums">{sv ? usd(sv.precioUsd) : <span className="text-xs text-aviso-texto">Sin servicio en «Servicios y precios»</span>}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
        </div>
      )}
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-3"><CardTitle className="text-base">Atenciones del período ({lineas.length})</CardTitle></CardHeader>
        <CardContent className="px-0">
          {lineas.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No hay atenciones pendientes de cobro en el período.</p>}
          <ul className="divide-y">
            {lineas.map((l, i) => (
              <li key={l.atencion.id} className="grid grid-cols-1 items-center gap-2 px-5 py-2 text-sm sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,2fr)_7rem]">
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
          {extras.length > 0 && (
            <div aria-hidden className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_7rem_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Servicio</span><span>Detalle</span><span>Cant.</span><span>Precio $</span><span className="w-20" />
            </div>
          )}
          {extras.map((x, i) => (
            <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_7rem_auto]">
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
              <label className="block"><span className="mb-1 block text-xs text-muted-foreground sm:hidden">Cant.</span><Input type="number" min={0} step="0.5" value={x.cantidad} aria-label="Cantidad u horas" title="Cantidad u horas" className="h-9" onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, cantidad: Number(e.target.value) } : y)))} /></label>
              <label className="block"><span className="mb-1 block text-xs text-muted-foreground sm:hidden">Precio $</span><Input type="number" min={0} step="0.01" value={x.precioUsd} aria-label="Precio en dólares" className="h-9" onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, precioUsd: Number(e.target.value) } : y)))} /></label>
              <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setExtras(extras.filter((_, j) => j !== i))}><Trash2 /> Quitar</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4">
        <div>
          <div className="text-sm text-muted-foreground">{items.length} renglones</div>
          <div className="text-2xl font-semibold">{usd(t.total)}</div>
          {t.totalBs !== null ? <div className="text-sm text-muted-foreground">{bs(t.totalBs)} a tasa {tasa}</div> : <Link href="/facturacion" target="_blank" className="text-sm text-aviso-texto underline underline-offset-2 hover:text-foreground">Cargar la tasa BCV de hoy para ver el monto en Bs.</Link>}
        </div>
        {sinServicio > 0 && <p className="text-sm text-alerta-texto">{sinServicio} atenciones marcadas sin servicio: elígelo o desmárcalas.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          size="lg"
          className="ml-auto"
          disabled={ocupado || items.length === 0 || sinServicio > 0}
          onClick={() => iniciar(async () => {
            const r = await crearCobro({ empresaId, desde, hasta, tasaBcv: tasa, items }, aFactura ? "factura" : "nota");
            if (r && !r.ok) setError(r.mensaje);
          })}
        >
          {ocupado && <Loader2 className="animate-spin" />} {aFactura ? "Crear y pasar a la factura" : "Crear nota de cobro"}
        </Button>
      </div>
    </div>
  );
}
