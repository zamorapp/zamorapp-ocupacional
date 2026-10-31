import type { Metadata } from "next";
import { listarEmpresas } from "@/lib/empresas";
import { listarAtenciones } from "@/lib/facturacion";
import { ETIQUETA_APTITUD, type Aptitud } from "@/lib/pacientes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../barra";
import { fechaCorta, Hoja, Marca } from "../componentes";
import { hoyCaracas } from "@/lib/fecha";

export const metadata: Metadata = { title: "Pacientes atendidos" };
export const dynamic = "force-dynamic";
// «Enviar a la empresa» genera el PDF de esta página en el servidor
export const maxDuration = 60;

type Props = { searchParams: Promise<{ empresa?: string; desde?: string; hasta?: string }> };

export default async function Atendidos({ searchParams }: Props) {
  const q = await searchParams;
  const hoy = hoyCaracas();
  const desde = q.desde ?? hoy.slice(0, 8) + "01";
  const hasta = q.hasta ?? hoy;
  const sesion = await obtenerSesion();
  const [atenciones, empresas] = await Promise.all([listarAtenciones(q.empresa ?? null, desde, hasta), listarEmpresas(true)]);
  const empresa = empresas.find((e) => e.id === q.empresa);
  const supabase = await crearClienteServidor();
  const { data: org } = sesion.orgId ? await supabase.from("organizaciones").select("nombre, rif, logo").eq("id", sesion.orgId).single() : { data: null };

  // Resumen por motivo
  const porMotivo = new Map<string, number>();
  for (const a of atenciones) porMotivo.set(a.motivo ?? "Sin motivo", (porMotivo.get(a.motivo ?? "Sin motivo") ?? 0) + 1);

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver="/facturacion?vista=atendidos" titulo="Reporte de pacientes atendidos" envio={empresa && (sesion.clinico || sesion.rol === "administrador") ? { documento: "atendidos", empresaId: empresa.id, empresa: empresa.razonSocial } : null} />
      <Hoja>
        <header className="mb-4 flex items-start justify-between border-b-2 border-teal-700 pb-3">
          <div className="flex items-center gap-3">
            <Marca logo={org?.logo as string | null | undefined} nombre={org?.nombre ?? ""} />
            <div>
              <div className="text-lg font-bold uppercase text-teal-800">{org?.nombre}</div>
              <div className="text-[11px] text-neutral-600">{org?.rif && `RIF ${org.rif}`}</div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-bold uppercase">Pacientes atendidos</div>
            <div>{empresa?.razonSocial ?? "Todas las empresas"}</div>
            <div className="text-[11px] text-neutral-600">Del {fechaCorta(desde)} al {fechaCorta(hasta)}</div>
          </div>
        </header>

        <p className="mb-3">
          <b>{atenciones.length}</b> atenciones · {[...porMotivo.entries()].map(([m, n]) => `${m}: ${n}`).join(" · ")}
        </p>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-teal-50">
              {["Nº", "Fecha", "Paciente", "Cédula", "Cargo", "Motivo", "Aptitud"].map((h) => <th key={h} className="border border-neutral-300 px-1.5 py-1 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {atenciones.map((a, i) => (
              <tr key={a.id} className="break-inside-avoid">
                <td className="border border-neutral-300 px-1.5 py-0.5 text-right">{i + 1}</td>
                <td className="border border-neutral-300 px-1.5 py-0.5">{fechaCorta(a.fecha)}</td>
                <td className="border border-neutral-300 px-1.5 py-0.5">{a.paciente}</td>
                <td className="border border-neutral-300 px-1.5 py-0.5">{a.cedula}</td>
                <td className="border border-neutral-300 px-1.5 py-0.5">{a.cargo ?? ""}</td>
                <td className="border border-neutral-300 px-1.5 py-0.5">{a.motivo ?? ""}</td>
                <td className="border border-neutral-300 px-1.5 py-0.5">{a.aptitud ? ETIQUETA_APTITUD[a.aptitud as Aptitud] : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-6 text-[10.5px] italic text-neutral-600">Sin datos clínicos: solo motivo de la atención y clasificación de aptitud.</p>
      </Hoja>
    </div>
  );
}
