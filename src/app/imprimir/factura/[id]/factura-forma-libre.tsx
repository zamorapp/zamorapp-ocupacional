"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown, ListChecks, Loader2, Ruler, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type Cobro, limpiarNumeroFactura, totales } from "@/lib/facturacion-tipos";
import { guardarNumeroFactura, guardarTasaCobro } from "@/app/(app)/facturacion/acciones";
import { leerTasaEscrita, tasaParaFecha } from "@/lib/tasa-bcv";
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
const cifraTasa = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const fechaEnLetras = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-VE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

type Renglon = { cantidad: number; descripcion: string; detalle: string; precio: number };

// relacion: enlace a la relación de pacientes de esta nota (null si no trae trabajadores). Tras imprimir la factura se
// ofrece imprimirla también (con «Ignorar»); además queda siempre un botón en la barra.
export function FacturaFormaLibre({ cobro: c, direccion, telefono, sugerido, editable, datosPago = "", tasas = [], hoy, relacion = null }: { cobro: Cobro; direccion: string; telefono: string; sugerido: string; editable: boolean; datosPago?: string; tasas?: { fecha: string; tasa: number }[]; hoy?: string; relacion?: string | null }) {
  const [numero, setNumero] = useState(c.numeroFacturaFiscal || sugerido);
  const [guardado, setGuardado] = useState(c.numeroFacturaFiscal);
  // Una factura que todavía no tiene número se emite hoy (con la tasa de hoy); una ya numerada conserva su fecha
  const emisionInicial = !c.numeroFacturaFiscal && hoy && hoy > c.fecha ? hoy : c.fecha;
  const [emision, setEmision] = useState(emisionInicial);
  // Tasa BCV de la fecha de emisión (la de ese día o la anterior más cercana); si no hay, la de la nota de cobro.
  // Se puede corregir a mano. Al imprimir se anota en la nota para que el registro diga lo mismo que el papel.
  // En una nota pagada la tasa queda fija: la anotada en la nota (la del pago); nunca se cambia desde aquí.
  const tasaFija = c.estado === "pagada" && !!c.tasaBcv;
  const tasaAuto = (d: string) => tasaParaFecha(tasas, d);
  const [tasaTxt, setTasaTxt] = useState(() => { const a = tasaFija ? c.tasaBcv : (tasaAuto(emisionInicial)?.tasa ?? c.tasaBcv); return a ? cifraTasa(a) : ""; });
  const cambiarEmision = (d: string) => {
    setEmision(d);
    const a = tasaAuto(d);
    if (a && !tasaFija) setTasaTxt(cifraTasa(a.tasa));
  };
  const [detallar, setDetallar] = useState(false);
  const [guia, setGuia] = useState(false);
  const [ajuste, setAjuste] = useState<Ajuste>({ arriba: 0, izquierda: 0 });
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [escala, setEscala] = useState(1);
  const [desborde, setDesborde] = useState(false);
  const [ofrecerRelacion, setOfrecerRelacion] = useState(false);
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

  // En bolívares y en dólares si hay tasa BCV (la factura en Venezuela va en bolívares); si no, solo en dólares
  const tasaLeida = leerTasaEscrita(tasaTxt);
  const tasa = Number.isFinite(tasaLeida) && tasaLeida > 0 ? tasaLeida : null;
  const auto = tasaAuto(emision);
  const origenTasa = !tasa ? "" : auto && auto.tasa === tasa ? `BCV, fecha valor ${fecha(auto.fecha)}` : c.tasaBcv === tasa ? "de la nota de cobro" : "escrita aquí";
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
  }, [renglones, numero, emision, direccion, tasa]);

  const guardarNumero = (alImprimir = false) => {
    // La tasa impresa queda anotada en la nota de cobro (si cambió)
    if (editable && tasa && tasa !== c.tasaBcv && c.estado !== "pagada" && c.estado !== "anulada") void guardarTasaCobro(c.id, tasa);
    if (!editable || !numero.trim() || numero.trim() === guardado) return;
    iniciar(async () => {
      const r = await guardarNumeroFactura(c.id, numero);
      // Si se imprimió y no se guardó (duplicado, sin conexión…), que se vea qué número salió en el papel
      setAviso(!r.ok && alImprimir ? { ok: false, mensaje: `La factura se imprimió con el Nº ${limpiarNumeroFactura(numero)} pero no se guardó: ${r.mensaje} Corrígelo y vuelve a intentarlo.` } : r);
      if (r.ok) { const n = r.numero ?? numero.trim(); setGuardado(n); setNumero(n); }
    });
  };

  // Al imprimir (navegador o escritorio) se guarda el número aunque no se haya salido del campo
  const guardarAntes = useRef(guardarNumero);
  guardarAntes.current = guardarNumero;
  useEffect(() => {
    const antes = () => guardarAntes.current(true);
    // Después de imprimir (navegador; el escritorio avisa por alImprimir) se ofrece la relación de pacientes
    const despues = () => setOfrecerRelacion(true);
    window.addEventListener("beforeprint", antes);
    window.addEventListener("afterprint", despues);
    return () => { window.removeEventListener("beforeprint", antes); window.removeEventListener("afterprint", despues); };
  }, []);

  const sinNumero = !numero.trim();
  const propuesto = !guardado && numero.trim() === sugerido && !!sugerido;
  return (
    <div className="min-h-dvh bg-neutral-100 print:min-h-0 print:bg-white">
      <BarraImpresion
        volver={`/facturacion/${c.id}`}
        titulo={`Factura ${numero ? `Nº ${numero}` : "(sin número)"} · ${c.empresa}`}
        // Sin «ocupado»: al salir del campo Nº se guarda y, si eso apagaba el botón, el clic de imprimir se perdía (06-nov)
        bloqueado={sinNumero || desborde}
        alImprimir={() => setOfrecerRelacion(true)}
        siguiente={relacion && <Button variant="outline" asChild><Link href={relacion}><ListChecks /> Relación de pacientes</Link></Button>}
      />
      <div className="mx-auto mb-4 max-w-[206mm] space-y-3 px-4 print:hidden">
        {relacion && ofrecerRelacion && (
          <div role="status" data-aviso="relacion" className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <ListChecks className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1"><div className="font-medium text-foreground">¿Imprimir también la relación de pacientes?</div><div className="text-muted-foreground">Trabajadores de esta factura con cargo, fecha y resultado. Sin diagnósticos.</div></div>
            <Button variant="ghost" onClick={() => setOfrecerRelacion(false)}>Ignorar</Button>
            <Button asChild><Link href={relacion}><ListChecks /> Imprimir relación</Link></Button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 rounded-lg border bg-white p-3 text-sm shadow-sm sm:grid-cols-[10rem_9.5rem_9.5rem_minmax(0,1fr)]">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Nº de factura (talonario)</span>
            <Input value={numero} inputMode="numeric" placeholder="000123" disabled={!editable} onChange={(e) => setNumero(e.target.value)} onBlur={() => guardarNumero()} onKeyDown={(e) => e.key === "Enter" && guardarNumero()} className="font-mono text-foreground disabled:opacity-100" />
            <span className="block text-xs text-muted-foreground">{ocupado ? "Guardando…" : propuesto ? "Propuesto: el siguiente del talonario" : guardado && numero.trim() === guardado ? "Guardado en la nota de cobro" : numero.trim() ? "Se guarda al salir del campo o al imprimir" : "\u00a0"}</span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Fecha de emisión</span>
            <Input type="date" value={emision} onChange={(e) => cambiarEmision(e.target.value || emisionInicial)} />
            <span className="block text-xs text-muted-foreground">{fechaEnLetras(emision)}</span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Tasa BCV (Bs/$)</span>
            <Input value={tasaTxt} inputMode="decimal" placeholder="Ej. 896,1225" disabled={!editable || tasaFija} onChange={(e) => setTasaTxt(e.target.value)} className="font-mono text-foreground disabled:opacity-100" />
            <span className="block text-xs text-muted-foreground">{tasaFija ? "La del pago (nota pagada)" : tasa ? origenTasa : "Sin tasa: sale solo en $"}</span>
          </label>
          <div className="flex flex-col justify-start gap-1.5 pt-5">
            <label className="flex items-center gap-2"><input type="checkbox" checked={detallar} onChange={(e) => setDetallar(e.target.checked)} /> Un renglón por trabajador (sin agrupar)</label>
          </div>
          <details className="group sm:col-span-4" open={ajuste.arriba !== 0 || ajuste.izquierda !== 0 || guia}>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              <Ruler className="size-4" /> Ajustar a mi impresora (mm)
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-1.5">Bajar <Input type="number" step="0.5" min={-20} max={20} value={ajuste.arriba} onChange={(e) => mover("arriba", Number(e.target.value))} className="h-8 w-20" /> mm</label>
                <label className="flex items-center gap-1.5">A la derecha <Input type="number" step="0.5" min={-20} max={20} value={ajuste.izquierda} onChange={(e) => mover("izquierda", Number(e.target.value))} className="h-8 w-20" /> mm</label>
                {(ajuste.arriba !== 0 || ajuste.izquierda !== 0) && <Button size="sm" variant="ghost" onClick={() => { setAjuste({ arriba: 0, izquierda: 0 }); try { localStorage.removeItem(CLAVE); } catch {} }}>Volver a 0</Button>}
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={guia} onChange={(e) => setGuia(e.target.checked)} /> Hoja de prueba: imprime la franja en papel blanco para calibrar</label>
              <p className="text-xs text-muted-foreground">Se guarda en este equipo. Papel «Media carta» u hoja personalizada de 20,6 × 14,6 cm, horizontal, escala 100 % y sin encabezados. Pon la hoja de prueba sobre una del talonario a contraluz y corrige aquí si quedó corrida.</p>
            </div>
          </details>
        </div>
        {(ocupado || aviso) && (
          <p className="flex items-center gap-1.5 text-sm">
            {ocupado && <Loader2 className="size-4 animate-spin" />}
            {aviso && <span className={aviso.ok ? "inline-flex items-center gap-1 text-ok-texto" : "text-destructive"}>{aviso.ok && <Check className="size-4" />}{aviso.mensaje}</span>}
          </p>
        )}
        {sinNumero && <p className="rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">Escribe el número de la factura del talonario para poder imprimir.</p>}
        {desborde && (
          <p className="flex items-start gap-2 rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> No cabe: {renglones.length} renglones. No cabe entre el membrete y la leyenda ni reducida al 80 %. {detallar ? "Desmarca «Un renglón por trabajador»" : "Divide la nota de cobro en dos"} para que entre en una hoja.
          </p>
        )}
        {!tasa && <p className="rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">Sin tasa BCV para el {fecha(emision)}: los montos salen solo en dólares. Escribe la tasa arriba para facturar en bolívares.</p>}
        {escala < 1 && !desborde && <p className="text-xs text-muted-foreground">Letra reducida al {Math.round(escala * 100)} % para que quepa en la franja.</p>}
      </div>

      {/* La hoja del talonario: en pantalla se dibujan en gris el membrete y la leyenda preimpresos (no se imprimen) */}
      <div className="overflow-x-auto px-4 print:overflow-visible print:px-0">
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
                <span>Nº <b className="font-mono text-[13px]">{limpiarNumeroFactura(numero) || "______"}</b></span>
                <span>Fecha de emisión: <b>{fecha(emision)}</b></span>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-y border-neutral-500 py-1">
              <div className="truncate"><span className="text-neutral-600">Nombre o razón social:</span> <b>{c.empresa}</b></div>
              <div><span className="text-neutral-600">RIF:</span> <b>{c.rif}</b></div>
              <div className="truncate"><span className="text-neutral-600">Domicilio fiscal:</span> {direccion || "—"}</div>
              <div>{telefono && <><span className="text-neutral-600">Teléfono:</span> {telefono}</>}</div>
              {c.desde && <div className="col-span-2"><span className="text-neutral-600">Periodo:</span> del {fecha(c.desde)} al {fecha(c.hasta ?? c.desde)}</div>}
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-500 text-left text-[9.5px] uppercase tracking-wide text-neutral-700">
                  <th className="w-[12mm] py-0.5 pr-2 text-right font-semibold">Cant.</th>
                  <th className="py-0.5 font-semibold">Descripción</th>
                  {tasa ? (
                    <>
                      <th className="w-[17mm] whitespace-nowrap py-0.5 text-right font-semibold">Precio $</th>
                      <th className="w-[25mm] whitespace-nowrap py-0.5 text-right font-semibold">Precio Bs.</th>
                      <th className="w-[20mm] whitespace-nowrap py-0.5 text-right font-semibold">Monto $</th>
                      <th className="w-[28mm] whitespace-nowrap py-0.5 text-right font-semibold">Monto Bs.</th>
                    </>
                  ) : (
                    <>
                      <th className="w-[30mm] whitespace-nowrap py-0.5 text-right font-semibold">Precio unit. $</th>
                      <th className="w-[32mm] whitespace-nowrap py-0.5 text-right font-semibold">Monto $</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {renglones.map((r, k) => (
                  <tr key={k} className="border-b border-neutral-200 align-top">
                    <td className="py-[1px] pr-2 text-right tabular-nums">{r.cantidad}</td>
                    <td className="py-[1px]">{r.descripcion}{r.detalle && <span className="text-neutral-600"> · {r.detalle}</span>}{c.ivaPct === 0 && " (E)"}</td>
                    {tasa && <td className="whitespace-nowrap py-[1px] text-right font-mono tabular-nums">{num(r.precio)}</td>}
                    <td className="whitespace-nowrap py-[1px] text-right font-mono tabular-nums">{num(enMoneda(r.precio))}</td>
                    {tasa && <td className="whitespace-nowrap py-[1px] text-right font-mono tabular-nums">{num(r.cantidad * r.precio)}</td>}
                    <td className="whitespace-nowrap py-[1px] text-right font-mono tabular-nums">{num(enMoneda(r.cantidad * r.precio))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1.5 flex items-start justify-between gap-6">
              <div className="max-w-[95mm] text-[9px] text-neutral-700">
                {c.ivaPct === 0 && <div>(E) Exento del IVA.</div>}
                {tasa && <div>Tasa BCV: Bs. {cifraTasa(tasa)} por dólar{auto && auto.tasa === tasa ? ` (fecha valor ${fecha(auto.fecha)})` : ""}.</div>}
                {c.observacion && <div>{c.observacion}</div>}
                {datosPago && <div className="mt-0.5 whitespace-pre-line text-[10px] leading-tight"><b>Datos para el pago:</b>{"\n"}{datosPago}</div>}
              </div>
              <div className="w-[72mm] shrink-0 space-y-[1px]">
                <div className="flex justify-between"><span>{c.ivaPct === 0 ? "Monto exento" : "Base imponible"}</span><span className="font-mono tabular-nums">{num(enMoneda(t.subtotal))}</span></div>
                {c.ivaPct > 0 && <div className="flex justify-between"><span>IVA {c.ivaPct} %</span><span className="font-mono tabular-nums">{num(enMoneda(t.iva))}</span></div>}
                {c.igtfPct > 0 && <div className="flex justify-between"><span>IGTF {c.igtfPct} %</span><span className="font-mono tabular-nums">{num(enMoneda(t.igtf))}</span></div>}
                <div className="flex justify-between border-t border-neutral-800 pt-0.5 text-[12px] font-bold"><span>TOTAL A PAGAR {moneda}</span><span className="font-mono tabular-nums">{num(enMoneda(t.total))}</span></div>
                {tasa && <div className="flex justify-between text-[12px] font-bold"><span>TOTAL EN DÓLARES $</span><span className="font-mono tabular-nums">{num(t.total)}</span></div>}
              </div>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
