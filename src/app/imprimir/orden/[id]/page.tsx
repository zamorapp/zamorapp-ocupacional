import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { obtenerOrden } from "@/lib/ordenes";
import { obtenerSesion } from "@/lib/sesion";
import { BarraImpresion } from "../../barra";
import { fechaCorta, Ficha, Firmas, Hoja, hora12, Membrete, Pie } from "../../componentes";
import { docEmpresa } from "../doc-empresa";

export const metadata: Metadata = { title: "Orden de evaluación" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = {
  solicitada: "Por confirmar", citado: "Confirmada", en_espera: "En el servicio", en_consulta: "En consulta",
  atendido: "Atendido", no_asistio: "No asistió", cancelada: "Cancelada",
};
const momento = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(iso));

// Orden de evaluación que RR. HH. pide desde el portal: la presenta el trabajador (o la lleva RR. HH.) y el servicio
// la recibe. Solo datos administrativos: quién, qué evaluación y cuándo. Nunca datos médicos.
export default async function ImprimirOrden({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  const o = await obtenerOrden(id);
  if (!o) notFound();
  const d = await docEmpresa(sesion, o.empresaId);
  const fechas = [...new Set(o.citas.map((c) => c.fecha))].sort();
  const motivos = [...new Set(o.citas.map((c) => c.motivo ?? "La define el médico"))];
  const notas = [...new Set(o.citas.map((c) => c.nota).filter(Boolean))];
  const numero = String(o.numero).padStart(5, "0");

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={esRolEmpresa(sesion.rol) || sesion.demo ? "/portal/ordenes" : "/atencion"} titulo={`Orden de evaluación ${numero}`} />
      <Hoja>
        <Membrete d={d} />
        <div className="mt-5 mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight">Orden de evaluación médica</h1>
            <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">Salud ocupacional</span>
          </div>
          <div className="shrink-0 rounded-lg border-2 border-doc-acento px-3 py-1.5 text-right">
            <div className="text-[8.5px] font-semibold uppercase tracking-[.12em] text-doc-tenue">Orden Nº</div>
            <div className="font-cifra text-xl font-medium leading-none text-doc-acento" data-prueba="orden-numero">{numero}</div>
          </div>
        </div>

        <Ficha celdas={[
          { k: "Empresa", v: o.empresa, ancho: 2 },
          { k: "RIF", v: o.rif },
          { k: "Emitida", v: momento(o.creadoEn) },
          { k: "Solicitada por (RR. HH.)", v: o.solicitante, ancho: 2 },
          { k: fechas.length > 1 ? "Fechas de la cita" : "Fecha de la cita", v: fechas.map(fechaCorta).join(" · ") },
          { k: "Trabajadores", v: String(o.citas.length) },
          { k: "Evaluación", v: motivos.join(" · "), ancho: 4, destacada: true },
        ]} />

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-doc-suave text-left text-[9px] uppercase tracking-[.08em] text-doc-tenue">
              {["Nº", "Trabajador", "Cédula", "Cargo", "Día y hora", "Estado"].map((h) => <th key={h} className="border-b border-doc-linea px-2 py-1.5 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {o.citas.map((c, i) => (
              <tr key={c.id} className="break-inside-avoid border-b border-doc-linea">
                <td className="px-2 py-1.5 font-cifra text-doc-tenue">{i + 1}</td>
                <td className="px-2 py-1.5 font-semibold">{c.paciente}{motivos.length > 1 && c.motivo && <span className="block text-[10px] font-normal text-doc-tenue">{c.motivo}</span>}</td>
                <td className="px-2 py-1.5 font-cifra">{c.cedula}</td>
                <td className="px-2 py-1.5">{c.cargo ?? "—"}</td>
                <td className="px-2 py-1.5 font-cifra">{fechaCorta(c.fecha)}{c.hora && ` · ${hora12(c.hora)}`}</td>
                <td className="px-2 py-1.5">{ESTADO[c.estado] ?? c.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {notas.length > 0 && <p className="mt-3 rounded-md border border-doc-linea px-3 py-2 text-[11px]"><b>Nota de RR. HH.:</b> {notas.join(" · ")}</p>}
        <p className="mt-3 text-[11px] text-doc-tenue">
          El trabajador se presenta con su cédula de identidad el día y la hora indicados. Si la cita aún dice «Por confirmar»,
          el servicio médico avisa a RR. HH. al confirmarla o al proponer otra hora.
        </p>

        <Firmas>
          <div className="w-[46%] text-center text-[10.5px]">
            <div className="h-[22mm]" />
            <div className="border-t border-[#15201e] pt-1 font-semibold">{o.solicitante}</div>
            <div className="text-doc-tenue">Recursos Humanos · firma y sello de la empresa</div>
          </div>
          <div className="w-[46%] text-center text-[10.5px]">
            <div className="h-[22mm]" />
            <div className="border-t border-[#15201e] pt-1 font-semibold">Recibido por el servicio médico</div>
            <div className="text-doc-tenue">Nombre, firma y fecha</div>
          </div>
        </Firmas>
        <p className="mt-3 text-center text-[9.5px] italic text-doc-tenue">Documento administrativo: no contiene datos médicos del trabajador.</p>
        <Pie d={d} derecha={`Orden ${numero}`} />
      </Hoja>
    </div>
  );
}
