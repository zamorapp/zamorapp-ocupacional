import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listarEmpresas } from "@/lib/empresas";
import { rangoMes, relacionMensual, resumenRelacion } from "@/lib/ordenes";
import { obtenerSesion } from "@/lib/sesion";
import { BarraImpresion } from "../barra";
import { fechaCorta, Ficha, Firmas, Hoja, Membrete, Pie } from "../componentes";
import { docEmpresa } from "../orden/doc-empresa";

export const metadata: Metadata = { title: "Relación mensual de evaluaciones" };
export const dynamic = "force-dynamic";

const MES = (m: string) => new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));

// Relación de lo realizado en el mes para una empresa, para cotejar con la nota de cobro y la factura.
// Solo datos administrativos (la función de la base no entrega otra cosa).
export default async function ImprimirRelacion({ searchParams }: { searchParams: Promise<{ empresa?: string; mes?: string }> }) {
  const q = await searchParams;
  const sesion = await obtenerSesion();
  const empresas = await listarEmpresas(true);
  const empresaId = q.empresa ?? (empresas.length === 1 ? empresas[0].id : null) ?? (sesion.demo ? "demo" : null);
  if (!empresaId) notFound();
  const { mes, desde, hasta } = rangoMes(q.mes);
  const [filas, d] = await Promise.all([relacionMensual(empresaId, desde, hasta), docEmpresa(sesion, empresaId)]);
  const r = resumenRelacion(filas);

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/portal/ordenes?empresa=${empresaId}&mes=${mes}`} titulo={`Relación ${mes} · ${d.empresa.razon_social}`} />
      <Hoja>
        <Membrete d={d} />
        <div className="mt-5 mb-4">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight">Relación de evaluaciones realizadas</h1>
          <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">{MES(mes)}</span>
        </div>
        <Ficha celdas={[
          { k: "Realizadas", v: String(r.total) },
          { k: "Con orden de RR. HH.", v: String(r.conOrden) },
          { k: "Sin orden", v: String(r.total - r.conOrden) },
          { k: "En nota de cobro", v: `${r.facturadas} de ${r.total}` },
          { k: "Por tipo de evaluación", v: r.porTipo.map(([t, n]) => `${t}: ${n}`).join(" · ") || "—", ancho: 4 },
        ]} />

        {filas.length === 0 ? <p className="py-6 text-center text-doc-tenue">No hay evaluaciones realizadas en {MES(mes)}.</p> : (
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr className="bg-doc-suave text-left text-[8.5px] uppercase tracking-[.08em] text-doc-tenue">
                {["Nº", "Fecha", "Trabajador", "Cédula", "Evaluación", "Orden", "Nota de cobro", "Factura"].map((h) => <th key={h} className="border-b border-doc-linea px-1.5 py-1.5 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.consultaId} className="break-inside-avoid border-b border-doc-linea">
                  <td className="px-1.5 py-1 font-cifra text-doc-tenue">{i + 1}</td>
                  <td className="px-1.5 py-1 font-cifra">{fechaCorta(f.fecha)}</td>
                  <td className="px-1.5 py-1 font-semibold">{f.trabajador}{f.cargo && <span className="block text-[9.5px] font-normal text-doc-tenue">{f.cargo}</span>}</td>
                  <td className="px-1.5 py-1 font-cifra">{f.cedula}</td>
                  <td className="px-1.5 py-1">{f.evaluacion ?? "—"}</td>
                  <td className="px-1.5 py-1 font-cifra">{f.orden ? String(f.orden).padStart(5, "0") : <span className="font-doc italic text-doc-tenue">sin orden</span>}</td>
                  <td className="px-1.5 py-1 font-cifra">{f.notaCobro ? `${f.notaCobro}${f.estadoCobro === "pagada" ? " · pagada" : ""}` : <span className="font-doc italic text-doc-tenue">pendiente</span>}</td>
                  <td className="px-1.5 py-1 font-cifra">{f.factura ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[10.5px] text-doc-tenue">
          «Sin orden»: la atención no vino de una solicitud del portal (por ejemplo, una consulta de morbilidad o un trabajador que llegó sin cita).
          «Pendiente»: aún no está en una nota de cobro emitida.
        </p>
        <Firmas>
          <div className="w-[46%] text-center text-[10.5px]"><div className="h-[18mm]" /><div className="border-t border-[#15201e] pt-1 font-semibold">Revisado por RR. HH.</div><div className="text-doc-tenue">Nombre, firma y fecha</div></div>
          <div className="w-[46%] text-center text-[10.5px]"><div className="h-[18mm]" /><div className="border-t border-[#15201e] pt-1 font-semibold">Servicio médico</div><div className="text-doc-tenue">Nombre, firma y fecha</div></div>
        </Firmas>
        <p className="mt-3 text-center text-[9.5px] italic text-doc-tenue">Documento administrativo: no contiene diagnósticos ni datos médicos.</p>
        <Pie d={d} derecha={`Relación ${mes}`} />
      </Hoja>
    </div>
  );
}
