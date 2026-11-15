import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseConfigurado } from "@/lib/config";
import { ahora } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { Hoja, Membrete, Pie } from "../../componentes";

export const metadata: Metadata = { title: "Control de tensión arterial" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const th = "border border-doc-linea bg-doc-suave px-1.5 py-1 text-left text-[8.5px] font-extrabold uppercase tracking-[.08em] text-doc-acento";
const td = "border border-doc-linea";

// Hoja en blanco para anotar a mano los controles de tensión (la otra opción es registrarlos y luego imprimir el
// reporte «Control de tensión arterial»). Con trabajador: su control personal; sin él, el registro del día de la empresa.
export default async function HojaControlTa({ searchParams }: { searchParams: Promise<{ empresa?: string; trabajador?: string; hojas?: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion.clinico) notFound();
  const q = await searchParams;
  const hojas = Math.min(Math.max(Number(q.hojas) || 1, 1), 5);
  const supabase = supabaseConfigurado && !sesion.demo ? await crearClienteServidor() : null;
  const trabajadorId = q.trabajador && UUID.test(q.trabajador) ? q.trabajador : null;
  const { data: t } = supabase && trabajadorId
    ? await supabase.from("trabajadores").select("nombres, apellidos, cedula, empresa_id").eq("id", trabajadorId).maybeSingle()
    : { data: null };
  const empresaId = t?.empresa_id ?? (q.empresa && UUID.test(q.empresa) ? q.empresa : null);
  const [{ data: org }, { data: emp }] = await Promise.all([
    supabase && sesion.orgId ? supabase.from("organizaciones").select("nombre, rif, direccion, telefono, logo, ajustes").eq("id", sesion.orgId).maybeSingle() : Promise.resolve({ data: null }),
    supabase && empresaId ? supabase.from("empresas").select("razon_social, logo").eq("id", empresaId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const membrete = {
    org: { nombre: org?.nombre ?? sesion.organizacion, rif: org?.rif ?? null, direccion: org?.direccion ?? null, telefono: org?.telefono ?? null, logo: org?.logo ?? null, ajustes: org?.ajustes ?? {} },
    empresa: { razon_social: emp?.razon_social ?? "", logo: emp?.logo ?? null },
  } as Parameters<typeof Membrete>[0]["d"];
  const impreso = { impreso: { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(ahora())) } };
  const personal = Boolean(t);
  const filas = personal ? 18 : 20;
  const columnas = personal
    ? [["Fecha", "w-[13%]"], ["Hora", "w-[9%]"], ["Tensión", "w-[15%]"], ["Pulso", "w-[8%]"], ["Síntomas, tratamiento u observación", ""], ["Firma", "w-[15%]"]]
    : [["Fecha", "w-[10%]"], ["Hora", "w-[7%]"], ["Cédula", "w-[11%]"], ["Trabajador", "w-[22%]"], ["Tensión", "w-[12%]"], ["Pulso", "w-[7%]"], ["Observación", ""], ["Firma", "w-[10%]"]];

  return (
    <div className="min-h-dvh bg-neutral-100 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:bg-white">
      <BarraImpresion volver="/enfermeria" titulo="Control de tensión arterial (para llenar a mano)" />
      {Array.from({ length: hojas }, (_, h) => (
        <Hoja key={h} horizontal={!personal} className="!min-h-0">
          <Membrete d={membrete} compacto sinEmpresa={!emp} />
          <div className="mt-3 mb-2 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold leading-tight tracking-tight">Control de tensión arterial</h1>
              <span className="mt-1 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">
                Enfermería · {personal ? "control personal" : "registro de tomas"}{hojas > 1 ? ` · hoja ${h + 1} de ${hojas}` : ""}
              </span>
            </div>
            <div className="shrink-0 text-right text-[10.5px] leading-relaxed">
              {emp?.razon_social && <div><b>Empresa:</b> {emp.razon_social}</div>}
              {t && <div><b>Trabajador:</b> {t.nombres} {t.apellidos} · C.I. {t.cedula}</div>}
              {!t && <div><b>Enfermera(o):</b> <span className="inline-block w-48 border-b border-[#15201e]" /></div>}
            </div>
          </div>
          <table className="w-full border-collapse text-[10.5px]">
            <thead><tr>{columnas.map(([c, w]) => <th key={c} className={`${th} ${w}`}>{c}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: filas }, (_, i) => (
                <tr key={i} className={personal ? "h-[9.5mm]" : "h-[6.6mm]"}>
                  {columnas.map(([c]) => (
                    <td key={c} className={`${td} ${c === "Fecha" ? "text-center font-cifra text-[#c3ccca]" : c.startsWith("Tensión") ? "text-center font-cifra text-[#c3ccca]" : ""}`}>
                      {c === "Fecha" ? "/ /" : c.startsWith("Tensión") ? "/" : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 rounded-lg border border-doc-linea px-3 py-1.5 text-[10px] leading-snug">
            <b>Referencia (adultos, mmHg):</b> normal menos de 130/85 · normal alta 130–139 / 85–89 · <b>alta 140/90 o más</b> · <b className="text-[#b42318] underline">180/110 o más: REFERIR AL MÉDICO DE INMEDIATO</b>.
            Tome la tensión sentado, tras 5 minutos de reposo, con el brazo a la altura del corazón.
          </p>
          <Pie d={impreso} compacto derecha={`Hoja ${h + 1} de ${hojas}`} />
        </Hoja>
      ))}
    </div>
  );
}
