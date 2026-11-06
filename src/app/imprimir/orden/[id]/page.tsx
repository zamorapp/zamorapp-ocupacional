import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { obtenerOrdenes, type Orden, type OrdenCita } from "@/lib/ordenes";
import { obtenerSesion } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha";
import { BarraImpresion } from "../../barra";
import { fechaCorta, Ficha, Firmas, Hoja, hora12, Membrete, Pie } from "../../componentes";
import { docEmpresa } from "../doc-empresa";

export const metadata: Metadata = { title: "Orden de evaluación" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = {
  solicitada: "Por confirmar", citado: "Confirmada", en_espera: "En el servicio", en_consulta: "En consulta",
  atendido: "Atendido", no_asistio: "No asistió", cancelada: "Cancelada",
};
// «06/11/2026 · 1:20 p. m.» (hora de Caracas)
const momento = (iso: string) => `${fechaCorta(hoyCaracas(iso))} · ${hora12(iso)}`;

// Orden de evaluación que RR. HH. pide desde el portal: la presenta el trabajador (o la lleva RR. HH.) y el servicio
// la recibe. Solo datos administrativos: quién, qué evaluación y cuándo. Nunca datos médicos.
// Varias órdenes a la vez: /imprimir/orden/<id>,<id>… (las de «una por trabajador»). ?por=trabajador: una hoja por
// trabajador de una orden de varios (mismo Nº, «hoja 1 de 3»).
export default async function ImprimirOrden({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ por?: string }> }) {
  const [{ id }, { por }] = await Promise.all([params, searchParams]);
  const sesion = await obtenerSesion();
  const ids = [...new Set(decodeURIComponent(id).split(","))].slice(0, 200);
  const ordenes = await obtenerOrdenes(ids);
  if (!ordenes.length) notFound();
  // Membrete por empresa: un lote puede traer órdenes de varias empresas (Analizar)
  const empresasDoc = [...new Set(ordenes.map((o) => o.empresaId))];
  const docs = new Map(await Promise.all(empresasDoc.map(async (e) => [e, await docEmpresa(sesion, e)] as const)));
  const porTrabajador = por === "trabajador";
  // Cada hoja: una orden completa o, con ?por=trabajador, un trabajador de la orden
  const hojas = ordenes.flatMap((o): { o: Orden; citas: OrdenCita[]; parte: string | null }[] => (porTrabajador && o.citas.length > 1 ? o.citas.map((c, i) => ({ o, citas: [c], parte: `${i + 1} de ${o.citas.length}` })) : [{ o, citas: o.citas, parte: null }]));
  const titulo = ordenes.length === 1 ? `Orden de evaluación ${String(ordenes[0].numero).padStart(5, "0")}` : `${ordenes.length} órdenes de evaluación`;
  const unica = ordenes.length === 1 && ordenes[0].citas.length > 1 ? ordenes[0] : null;

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={esRolEmpresa(sesion.rol) || sesion.demo ? "/portal/ordenes" : "/atencion"} titulo={titulo}
        siguiente={unica && <a href={porTrabajador ? `/imprimir/orden/${unica.id}` : `/imprimir/orden/${unica.id}?por=trabajador`} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">{porTrabajador ? "Una sola hoja" : "Una hoja por trabajador"}</a>} />
      {hojas.map((h, k) => <HojaOrden key={k} o={h.o} citas={h.citas} parte={h.parte} d={docs.get(h.o.empresaId)!} />)}
    </div>
  );
}

function HojaOrden({ o, citas, parte, d }: { o: Orden; citas: OrdenCita[]; parte: string | null; d: Awaited<ReturnType<typeof docEmpresa>> }) {
  const fechas = [...new Set(citas.map((c) => c.fecha))].sort();
  const motivos = [...new Set(citas.map((c) => c.motivo ?? "La define el médico"))];
  const notas = [...new Set(citas.map((c) => c.nota).filter(Boolean))];
  const numero = String(o.numero).padStart(5, "0");
  return (
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
          { k: "Trabajadores", v: parte ? `Hoja ${parte}` : String(citas.length) },
          { k: "Evaluación", v: motivos.join(" · "), ancho: 4, destacada: true },
        ]} />

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-doc-suave text-left text-[9px] uppercase tracking-[.08em] text-doc-tenue">
              {["Nº", "Trabajador", "Cédula", "Cargo", "Día y hora", "Estado"].map((h) => <th key={h} className="border-b border-doc-linea px-2 py-1.5 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {citas.map((c, i) => (
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
        <Pie d={d} derecha={`Orden ${numero}${parte ? ` · hoja ${parte}` : ""}`} />
      </Hoja>
  );
}
