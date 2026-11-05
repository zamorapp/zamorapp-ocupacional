"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Loader2, Ruler, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type Cobro, totales } from "@/lib/facturacion-tipos";
import { guardarNumeroFactura } from "@/app/(app)/facturacion/acciones";
import { BarraImpresion } from "../../barra";

// Medidas del talonario de Cesar (20,6 × 14,6 cm apaisado, 04-nov-2026). El membrete preimpreso llega a ~3 cm y la
// leyenda legal empieza a los 13,5 cm: todo lo impreso cabe en la franja 33–135 mm desde el borde de arriba.
const FRANJA = { arriba: 33, abajo: 135, lado: 10 };
const ALTO = FRANJA.abajo - FRANJA.arriba;
const ESCALA_MINIMA = 0.8;
// Corrimiento por impresora (cada equipo arrastra la hoja distinto): se guarda en este equipo, no en la nube
const CLAVE = "zamorapp.factura-forma-libre.ajuste";
type Ajuste = { arriba: number; izquierda: number };

const num = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

type Renglon = { cantidad: number; descripcion: string; detalle: string; precio: number };

export function FacturaFormaLibre({ cobro: c, direccion, telefono, sugerido, editable }: { cobro: Cobro; direccion: string; telefono: string; sugerido: string; editable: boolean }) {
  const [numero, setNumero] = useState(c.numeroFacturaFiscal || sugerido);
  const [guardado, setGuardado] = useState(c.numeroFacturaFiscal);
  const [emision, setEmision] = useState(c.fecha);
  const [detallar, setDetallar] = useState(false);
  const [guia, setGuia] = useState(false);
  const [ajuste, setAjuste] = useState<Ajuste>({ arriba: 0, izquierda: 0 });
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [escala, setEscala] = useState(1);
  const [desborde, setDesborde] = useState(false);
  const contenido = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const a = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Ajuste | null;
      if (a && Number.isFinite(a.arriba) && Number.isFinite(a.izquierda)) setAjuste(a);
    } catch {}
  }, []);
  const mover = (k: keyof Ajuste, v: number) => {
    const a = { ...ajuste, [k]: Math.max(-20, Math.min(20, Math.round(v * 2) / 2)) };
    setAjuste(a);
    try { localStorage.setItem(CLAVE, JSON.stringify(a)); } catch {}
  };

  // En bolívares si hay tasa BCV (lo que exige la factura en Venezuela); si no, en dólares
  const tasa = c.tasaBcv && c.tasaBcv > 0 ? c.tasaBcv : null;
  const moneda = tasa ? "Bs." : "$";
  const enMoneda = (usd: number) => (tasa ? usd * tasa : usd);
  const t = totales(c);

  // Agrupados: los renglones iguales (mismo servicio y precio) se suman en uno; así 30 evaluaciones caben en una línea
  const renglones: Renglon[] = useMemo(() => {
    if (detallar) return c.items.map((i) => ({ cantidad: i.cantidad, descripcion: i.descripcion, detalle: i.detalle, precio: i.precioUsd }));
    const m = new Map<string, Renglon>();
    for (const i of c.items) {
      const k = `${i.descripcion.trim().toLowerCase()}|${i.precioUsd}`;
      const r = m.get(k);
      if (r) r.cantidad += i.cantidad;
      else m.set(k, { cantidad: i.cantidad, descripcion: i.descripcion, detalle: "", precio: i.precioUsd });
    }
    return [...m.values()];
  }, [c.items, detallar]);

  // Si no cabe en la franja, se reduce hasta un 80 %; si ni así cabe, se avisa (nunca se imprime sobre la leyenda)
  useLayoutEffect(() => {
    const el = contenido.current;
    if (!el) return;
    el.style.zoom = "";
    const mm = el.scrollHeight / (96 / 25.4);
    const z = mm > ALTO ? Math.max(ESCALA_MINIMA, Math.floor((ALTO / mm) * 100) / 100) : 1;
    el.style.zoom = z < 1 ? String(z) : "";
    setEscala(z);
    setDesborde(mm * z > ALTO + 0.5);
  }, [renglones, numero, emision, direccion]);

  const guardarNumero = () => {
    if (!editable || numero.trim() === guardado) return;
    iniciar(async () => {
      const r = await guardarNumeroFactura(c.id, numero);
      setAviso(r);
      if (r.ok) setGuardado(numero.trim());
    });
  };

  const sinNumero = !numero.trim();
  return (
    <div className="min-h-dvh bg-neutral-100 print:min-h-0 print:bg-white">
      <BarraImpresion
        volver={`/facturacion/${c.id}`}
        titulo={`Factura ${numero ? `Nº ${numero}` : "(sin número)"} · ${c.empresa}`}
        bloqueado={sinNumero || desborde || ocupado}
      />
      <div className="mx-auto mb-4 max-w-[206mm] space-y-3 px-4 print:hidden">
        <div className="grid grid-cols-1 gap-3 rounded-lg border bg-white p-3 text-sm shadow-sm sm:grid-cols-[10rem_9.5rem_minmax(0,1fr)]">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Nº de factura (talonario)</span>
            <Input value={numero} inputMode="numeric" placeholder="000123" disabled={!editable} onChange={(e) => setNumero(e.target.value)} onBlur={guardarNumero} onKeyDown={(e) => e.key === "Enter" && guardarNumero()} className="font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Fecha de emisión</span>
            <Input type="date" value={emision} onChange={(e) => setEmision(e.target.value || c.fecha)} />
          </label>
          <div className="flex flex-col justify-end gap-1.5">
            <label className="flex items-center gap-2"><input type="checkbox" checked={detallar} onChange={(e) => setDetallar(e.target.checked)} /> Un renglón por trabajador (sin agrupar)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={guia} onChange={(e) => setGuia(e.target.checked)} /> <Ruler className="size-4 text-muted-foreground" /> Hoja de prueba: imprime la franja en papel blanco para calibrar</label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">Corrimiento de esta impresora (mm):</span>
          <label className="flex items-center gap-1.5">Bajar <Input type="number" step="0.5" min={-20} max={20} value={ajuste.arriba} onChange={(e) => mover("arriba", Number(e.target.value))} className="h-8 w-20" /></label>
          <label className="flex items-center gap-1.5">A la derecha <Input type="number" step="0.5" min={-20} max={20} value={ajuste.izquierda} onChange={(e) => mover("izquierda", Number(e.target.value))} className="h-8 w-20" /></label>
          {(ajuste.arriba !== 0 || ajuste.izquierda !== 0) && <Button size="sm" variant="ghost" onClick={() => { setAjuste({ arriba: 0, izquierda: 0 }); try { localStorage.removeItem(CLAVE); } catch {} }}>Volver a 0</Button>}
          {ocupado && <Loader2 className="size-4 animate-spin" />}
          {aviso && <span className={aviso.ok ? "inline-flex items-center gap-1 text-ok-texto" : "text-destructive"}>{aviso.ok && <Check className="size-4" />}{aviso.mensaje}</span>}
        </div>
        <p className="text-xs text-muted-foreground">Al imprimir: papel «Media carta» u hoja personalizada de 20,6 × 14,6 cm, horizontal, escala 100 % y sin encabezados. La primera vez usa «Hoja de prueba» en papel blanco, ponla sobre una hoja del talonario a contraluz y corrige aquí si hace falta.</p>
        {sinNumero && <p className="rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">Escribe el número de la factura del talonario para poder imprimir.</p>}
        {desborde && (
          <p className="flex items-start gap-2 rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> No cabe entre el membrete y la leyenda ni reducida al 80 %. {detallar ? "Desmarca «Un renglón por trabajador»" : "Divide la nota de cobro en dos"} para que entre en una hoja.
          </p>
        )}
        {!tasa && <p className="text-xs text-muted-foreground">Sin tasa BCV en la nota de cobro: los montos salen en dólares. Anota la tasa en la nota para facturar en bolívares.</p>}
        {escala < 1 && !desborde && <p className="text-xs text-muted-foreground">Letra reducida al {Math.round(escala * 100)} % para que quepa en la franja.</p>}
      </div>

      {/* La hoja del talonario: en pantalla se dibujan en gris el membrete y la leyenda preimpresos (no se imprimen) */}
      <section className="relative mx-auto mb-8 h-[146mm] w-[206mm] overflow-hidden bg-white font-doc text-[#111] shadow-[0_1px_2px_rgba(0,0,0,.08),0_12px_40px_rgba(16,40,36,.14)] [page:formalibre] print:m-0 print:h-[145.5mm] print:shadow-none">
        <div aria-hidden className="pointer-events-none absolute inset-x-[10mm] top-0 h-[30mm] border-b-2 border-dashed border-sky-300 print:hidden">
          <span className="absolute bottom-1 left-0 text-[10px] uppercase tracking-wide text-sky-400">Membrete preimpreso</span>
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-x-[10mm] top-[135mm] bottom-0 border-t-2 border-dashed border-sky-300 print:hidden">
          <span className="absolute top-1 left-0 text-[10px] uppercase tracking-wide text-sky-400">Leyenda legal preimpresa</span>
        </div>
        <div
          className={`absolute overflow-hidden ${guia ? "outline outline-1 outline-neutral-500" : ""}`}
          style={{ top: `${FRANJA.arriba + ajuste.arriba}mm`, left: `${FRANJA.lado + ajuste.izquierda}mm`, width: `${206 - 2 * FRANJA.lado}mm`, height: `${ALTO}mm` }}
        >
          {guia && <span className="absolute right-1 top-0.5 font-mono text-[8px] text-neutral-500">franja 33–135 mm · {ajuste.arriba >= 0 ? "+" : ""}{ajuste.arriba} / {ajuste.izquierda >= 0 ? "+" : ""}{ajuste.izquierda} mm</span>}
          <div ref={contenido} className="text-[10.5px] leading-snug">
            <div className="mb-1.5 flex items-baseline justify-between gap-4">
              <div className="text-[13px] font-bold tracking-wide">FACTURA</div>
              <div className="flex items-baseline gap-5">
                <span>Nº <b className="font-mono text-[13px]">{numero || "______"}</b></span>
                <span>Fecha de emisión: <b className="font-mono">{fecha(emision)}</b></span>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-y border-neutral-500 py-1">
              <div className="truncate"><span className="text-neutral-600">Nombre o razón social:</span> <b>{c.empresa}</b></div>
              <div><span className="text-neutral-600">RIF:</span> <b className="font-mono">{c.rif}</b></div>
              <div className="truncate"><span className="text-neutral-600">Domicilio fiscal:</span> {direccion || "—"}</div>
              <div>{telefono && <><span className="text-neutral-600">Teléfono:</span> {telefono}</>}</div>
              {c.desde && <div className="col-span-2"><span className="text-neutral-600">Periodo:</span> del {fecha(c.desde)} al {fecha(c.hasta ?? c.desde)}</div>}
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-500 text-left text-[9.5px] uppercase tracking-wide text-neutral-700">
                  <th className="w-[12mm] py-0.5 pr-2 text-right font-semibold">Cant.</th>
                  <th className="py-0.5 font-semibold">Descripción</th>
                  <th className="w-[30mm] py-0.5 text-right font-semibold">Precio unit. {moneda}</th>
                  <th className="w-[32mm] py-0.5 text-right font-semibold">Monto {moneda}</th>
                </tr>
              </thead>
              <tbody>
                {renglones.map((r, k) => (
                  <tr key={k} className="border-b border-neutral-200 align-top">
                    <td className="py-[1px] pr-2 text-right font-mono tabular-nums">{r.cantidad}</td>
                    <td className="py-[1px]">{r.descripcion}{r.detalle && <span className="text-neutral-600"> · {r.detalle}</span>}{c.ivaPct === 0 && " (E)"}</td>
                    <td className="py-[1px] text-right font-mono tabular-nums">{num(enMoneda(r.precio))}</td>
                    <td className="py-[1px] text-right font-mono tabular-nums">{num(enMoneda(r.cantidad * r.precio))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1.5 flex items-start justify-between gap-6">
              <div className="max-w-[95mm] text-[9px] text-neutral-700">
                {c.ivaPct === 0 && <div>(E) Exento del IVA.</div>}
                {tasa && <div>Equivale a $ {num(t.total)} a la tasa BCV de Bs. {num(tasa)} por dólar.</div>}
                {c.observacion && <div>{c.observacion}</div>}
              </div>
              <div className="w-[72mm] shrink-0 space-y-[1px]">
                <div className="flex justify-between"><span>{c.ivaPct === 0 ? "Monto exento" : "Base imponible"}</span><span className="font-mono tabular-nums">{num(enMoneda(t.subtotal))}</span></div>
                {c.ivaPct > 0 && <div className="flex justify-between"><span>IVA {c.ivaPct} %</span><span className="font-mono tabular-nums">{num(enMoneda(t.iva))}</span></div>}
                {c.igtfPct > 0 && <div className="flex justify-between"><span>IGTF {c.igtfPct} %</span><span className="font-mono tabular-nums">{num(enMoneda(t.igtf))}</span></div>}
                <div className="flex justify-between border-t border-neutral-800 pt-0.5 text-[12px] font-bold"><span>TOTAL A PAGAR {moneda}</span><span className="font-mono tabular-nums">{num(enMoneda(t.total))}</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
