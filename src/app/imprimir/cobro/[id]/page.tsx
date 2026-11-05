import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerCobro } from "@/lib/facturacion";
import { bs, totales, usd } from "@/lib/facturacion-tipos";
import { CONDICION_PAGO_BCV } from "@/lib/mensajes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { fechaCorta, Hoja, Marca, Titular } from "../../componentes";

export const metadata: Metadata = { title: "Nota de cobro" };

// ?doc=entrega → nota de entrega / recibo de evaluaciones (con membrete, sin montos, con «Recibido por»).
// Si la nota ya está pagada sale como «Recibo de pago». La factura del talonario va aparte: /imprimir/factura/[id].
export default async function ImprimirCobro({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const [{ id }, { doc }] = await Promise.all([params, searchParams]);
  const [c, sesion] = await Promise.all([obtenerCobro(id), obtenerSesion()]);
  if (!c || !sesion.orgId) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: emp }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, logo, ajustes").eq("id", sesion.orgId).single(),
    supabase.from("empresas").select("direccion, telefono").eq("id", c.empresaId).single(),
  ]);
  const t = totales(c);
  const entrega = doc === "entrega";
  const nombre = entrega ? "Nota de entrega" : c.tipo === "presupuesto" ? "Presupuesto" : c.estado === "pagada" ? "Recibo de pago" : "Nota de cobro";

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/facturacion/${id}`} titulo={`${nombre} #${c.numero}`} />
      <Hoja>
        <header className="mb-5 flex items-start justify-between border-b-2 border-teal-700 pb-3">
          <div className="flex items-center gap-3">
            <Marca logo={org?.logo as string | null | undefined} nombre={org?.nombre ?? ""} />
            <div>
              <div className="text-lg font-bold uppercase text-teal-800">{org?.nombre}</div>
              <Titular ajustes={org?.ajustes} />
              <div className="text-[11px] text-neutral-600">{[org?.rif && `RIF ${org.rif}`, org?.direccion, org?.telefono, org?.correo].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-bold uppercase">{nombre}</div>
            {entrega && <div className="text-[11px] font-medium uppercase text-neutral-600">Recibo de evaluaciones</div>}
            <div className="text-sm">Nº {String(c.numero).padStart(5, "0")}</div>
            <div className="text-[11px] text-neutral-600">Fecha: {fechaCorta(c.fecha)}</div>
            {!entrega && c.estado === "pagada" && c.fechaPago && <div className="text-[11px] text-neutral-600">Pagado el {fechaCorta(c.fechaPago)}</div>}
            {c.numeroFacturaFiscal && <div className="text-[11px] text-neutral-600">Factura Nº {c.numeroFacturaFiscal}</div>}
          </div>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-x-6 rounded border border-neutral-300 p-3">
          <div><b>Cliente:</b> {c.empresa}</div>
          <div><b>RIF:</b> {c.rif}</div>
          {emp?.direccion && <div className="col-span-2"><b>Dirección:</b> {emp.direccion}</div>}
          {c.desde && <div className="col-span-2"><b>Periodo:</b> del {fechaCorta(c.desde)} al {fechaCorta(c.hasta)}</div>}
          {c.vence && <div className="col-span-2"><b>Válido hasta:</b> {fechaCorta(c.vence)}</div>}
        </div>

        {entrega ? (
          <>
            <table className="mb-4 w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="bg-teal-50">
                  <th className="w-10 border border-neutral-300 px-2 py-1 text-right">Nº</th>
                  <th className="border border-neutral-300 px-2 py-1 text-left">Servicio o evaluación</th>
                  <th className="border border-neutral-300 px-2 py-1 text-left">Trabajador · cédula · fecha</th>
                  <th className="w-14 border border-neutral-300 px-2 py-1 text-right">Cant.</th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((i, k) => (
                  <tr key={k} className="break-inside-avoid">
                    <td className="border border-neutral-300 px-2 py-0.5 text-right tabular-nums">{k + 1}</td>
                    <td className="border border-neutral-300 px-2 py-0.5">{i.descripcion}</td>
                    <td className="border border-neutral-300 px-2 py-0.5 text-neutral-700">{i.detalle || "—"}</td>
                    <td className="border border-neutral-300 px-2 py-0.5 text-right tabular-nums">{i.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm">Total entregado: <b>{c.items.reduce((s, i) => s + i.cantidad, 0)}</b>.</p>
            <div className="mt-16 grid grid-cols-2 gap-12 text-center text-[11px] break-inside-avoid">
              <div className="border-t border-neutral-700 pt-1">Entregado por</div>
              <div className="border-t border-neutral-700 pt-1">Recibido por (nombre, C.I., firma y fecha)</div>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}

        {c.observacion && <p className="mt-4"><b>Observación:</b> {c.observacion}</p>}
        {/* Condiciones y datos para el pago (Configuración › Organización › Documentos); la nota de entrega no lleva montos */}
        {!entrega && (() => {
          const aj = (org?.ajustes ?? {}) as { cobro_condiciones?: string | null; cobro_datos_pago?: string | null };
          const condiciones = (aj.cobro_condiciones ?? CONDICION_PAGO_BCV).trim();
          const datosPago = (aj.cobro_datos_pago ?? "").trim();
          if (!condiciones && !datosPago) return null;
          return (
            <div data-prueba="cobro-pago" className="mt-4 break-inside-avoid rounded-md border border-neutral-300 px-3 py-2 text-[11.5px]">
              {condiciones && <p><b>Condiciones de pago:</b> {condiciones}</p>}
              {datosPago && <div className={condiciones ? "mt-1.5" : ""}><b>Datos para el pago</b><p className="whitespace-pre-line">{datosPago}</p></div>}
            </div>
          );
        })()}
        <p className="mt-10 border-t pt-2 text-[10.5px] italic text-neutral-600">
          {entrega ? "Constancia de los servicios entregados. No sustituye la factura." : <>Documento sin validez fiscal. La factura correspondiente se emite según la normativa del SENIAT{c.numeroFacturaFiscal && ` (factura Nº ${c.numeroFacturaFiscal})`}.</>}
        </p>
      </Hoja>
    </div>
  );
}
