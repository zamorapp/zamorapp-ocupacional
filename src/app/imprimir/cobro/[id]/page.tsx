import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerCobro } from "@/lib/facturacion";
import { bs, totales, usd } from "@/lib/facturacion-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { fechaCorta, Hoja } from "../../componentes";

export const metadata: Metadata = { title: "Nota de cobro" };

export default async function ImprimirCobro({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, sesion] = await Promise.all([obtenerCobro(id), obtenerSesion()]);
  if (!c || !sesion.orgId) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: emp }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo").eq("id", sesion.orgId).single(),
    supabase.from("empresas").select("direccion, telefono").eq("id", c.empresaId).single(),
  ]);
  const t = totales(c);

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/facturacion/${id}`} titulo={`${c.tipo === "presupuesto" ? "Presupuesto" : "Nota de cobro"} #${c.numero}`} />
      <Hoja>
        <header className="mb-5 flex items-start justify-between border-b-2 border-teal-700 pb-3">
          <div>
            <div className="text-lg font-bold uppercase text-teal-800">{org?.nombre}</div>
            <div className="text-[11px] text-neutral-600">{[org?.rif && `RIF ${org.rif}`, org?.direccion, org?.telefono, org?.correo].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="text-right">
            <div className="text-base font-bold uppercase">{c.tipo === "presupuesto" ? "Presupuesto" : "Nota de cobro"}</div>
            <div className="text-sm">Nº {String(c.numero).padStart(5, "0")}</div>
            <div className="text-[11px] text-neutral-600">Fecha: {fechaCorta(c.fecha)}</div>
          </div>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-x-6 rounded border border-neutral-300 p-3">
          <div><b>Cliente:</b> {c.empresa}</div>
          <div><b>RIF:</b> {c.rif}</div>
          {emp?.direccion && <div className="col-span-2"><b>Dirección:</b> {emp.direccion}</div>}
          {c.desde && <div className="col-span-2"><b>Periodo:</b> del {fechaCorta(c.desde)} al {fechaCorta(c.hasta)}</div>}
          {c.vence && <div className="col-span-2"><b>Válido hasta:</b> {fechaCorta(c.vence)}</div>}
        </div>

        <table className="mb-4 w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="bg-teal-50">
              <th className="border border-neutral-300 px-2 py-1 text-left">Descripción</th>
              <th className="w-14 border border-neutral-300 px-2 py-1 text-right">Cant.</th>
              <th className="w-24 border border-neutral-300 px-2 py-1 text-right">Precio $</th>
              <th className="w-24 border border-neutral-300 px-2 py-1 text-right">Importe $</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((i, k) => (
              <tr key={k} className="break-inside-avoid">
                <td className="border border-neutral-300 px-2 py-0.5">{i.descripcion}{i.detalle && <span className="text-neutral-600"> · {i.detalle}</span>}</td>
                <td className="border border-neutral-300 px-2 py-0.5 text-right tabular-nums">{i.cantidad}</td>
                <td className="border border-neutral-300 px-2 py-0.5 text-right tabular-nums">{i.precioUsd.toFixed(2)}</td>
                <td className="border border-neutral-300 px-2 py-0.5 text-right tabular-nums">{(i.cantidad * i.precioUsd).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto w-72 space-y-0.5 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{usd(t.subtotal)}</span></div>
          {c.ivaPct > 0 && <div className="flex justify-between"><span>IVA {c.ivaPct} %</span><span>{usd(t.iva)}</span></div>}
          {c.igtfPct > 0 && <div className="flex justify-between"><span>IGTF {c.igtfPct} %</span><span>{usd(t.igtf)}</span></div>}
          <div className="flex justify-between border-t border-neutral-800 pt-1 text-base font-bold"><span>Total</span><span>{usd(t.total)}</span></div>
          {t.totalBs !== null && <div className="flex justify-between"><span>Equivalente a tasa BCV {c.tasaBcv}</span><span>{bs(t.totalBs)}</span></div>}
        </div>

        {c.observacion && <p className="mt-4"><b>Observación:</b> {c.observacion}</p>}
        <p className="mt-10 border-t pt-2 text-[10.5px] italic text-neutral-600">
          Documento sin validez fiscal. La factura correspondiente se emite según la normativa del SENIAT{c.numeroFacturaFiscal && ` (factura Nº ${c.numeroFacturaFiscal})`}.
        </p>
      </Hoja>
    </div>
  );
}
