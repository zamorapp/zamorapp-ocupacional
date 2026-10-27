import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AjustesDocumentos } from "@/lib/documentos";
import { obtenerEvento } from "@/lib/eventos";
import { fechaHoraVE } from "@/lib/eventos-tipos";
import { obtenerInvestigacion } from "@/lib/investigacion";
import { ETIQUETA_INSTANCIA, SECCIONES } from "@/lib/investigacion-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { Bloque, fechaCorta, Ficha, Firmas, folio, Hoja, Lista, Membrete, Pie } from "../../componentes";

export const metadata: Metadata = { title: "Informe de investigación" };
export const dynamic = "force-dynamic";

// Informe de investigación de enfermedad ocupacional (NT-02-2008, Título IV, cap. II, punto 2 y 6.3)
export default async function ImprimirInvestigacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  const e = await obtenerEvento(id);
  if (!e || !sesion.orgId || !sesion.clinico) notFound();
  const inv = await obtenerInvestigacion(e);
  if (!inv?.id) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: emp }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, ajustes, logo").eq("id", sesion.orgId).single(),
    supabase.from("empresas").select("razon_social, rif, nil, direccion, actividad_economica, logo").eq("id", e.empresaId).single(),
  ]);
  const doc = {
    org: { ...(org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    empresa: { razon_social: emp?.razon_social ?? e.empresa, rif: emp?.rif ?? "", logo: (emp?.logo as string | null) ?? null },
    impreso: { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date()) },
  };

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/accidentes/${id}/investigacion`} titulo={`Informe de investigación · evento Nº ${e.numero}`} />
      <Hoja className="print:block">
        <Membrete d={doc} />
        <div className="mt-5 mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-balance">Informe de investigación de enfermedad ocupacional</h1>
            <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">
              NT-02-2008 · {inv.estado === "terminado" ? `terminado el ${fechaCorta(inv.terminadoEn)}` : "borrador"}
            </span>
          </div>
          <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
            <div>Evento Nº <b className="font-medium text-[#15201e]">{String(e.numero).padStart(5, "0")}</b></div>
            <div>Folio <b className="font-medium text-[#15201e]">{folio("II", inv.id)}</b></div>
            {e.fechaDiagnostico && <div>Diagnóstico <b className="font-medium text-[#15201e]">{fechaHoraVE(e.fechaDiagnostico)}</b></div>}
          </div>
        </div>
        <Bloque titulo="Empresa">
          <Ficha celdas={[
            { k: "Razón social", v: doc.empresa.razon_social, ancho: 2 },
            { k: "RIF", v: emp?.rif },
            { k: "NIL", v: emp?.nil },
            { k: "Actividad económica", v: emp?.actividad_economica, ancho: 2 },
            { k: "Dirección", v: emp?.direccion, ancho: 2 },
          ]} />
        </Bloque>
        <Bloque titulo="Caso">
          <Ficha celdas={[
            { k: "Trabajador", v: e.trabajador, ancho: 2, destacada: true },
            { k: "Cédula", v: e.cedula },
            { k: "Anexo 1", v: e.enAnexo1 ? "Sí (15 días)" : "No (30 días)" },
            { k: "Diagnóstico", v: [e.cie10, e.diagnostico].filter(Boolean).join(" "), ancho: 4 },
          ]} />
        </Bloque>
        {inv.participantes.length > 0 && (
          <Bloque titulo="Participantes del estudio">
            <table className="w-full text-[11px]">
              <thead className="text-left text-doc-tenue"><tr><th className="font-medium">Nombre</th><th className="font-medium">Cédula</th><th className="font-medium">Cargo</th><th className="font-medium">Instancia</th></tr></thead>
              <tbody>{inv.participantes.map((p, i) => <tr key={i} className="border-t border-doc-linea"><td>{p.nombre}</td><td>{p.cedula}</td><td>{p.cargo}</td><td>{ETIQUETA_INSTANCIA[p.instancia]}</td></tr>)}</tbody>
            </table>
          </Bloque>
        )}
        {SECCIONES.map(({ clave, titulo }) => (
          <Bloque key={clave} titulo={titulo}>{inv.secciones[clave]?.trim() || "—"}</Bloque>
        ))}
        {e.acciones.length > 0 && (
          <Bloque titulo="Plan de acción">
            <Lista columnas={1} texto={e.acciones.map((a) => [a.descripcion, a.responsable && `Responsable: ${a.responsable}`, a.fecha && `Fecha: ${fechaCorta(a.fecha)}`, a.estado.replace(/_/g, " ")].filter(Boolean).join(" · ")).join("\n")} />
          </Bloque>
        )}
        <Firmas>
          {(inv.participantes.length ? inv.participantes : [{ nombre: "", instancia: "servicio" as const }, { nombre: "", instancia: "delegado" as const }]).map((p, i) => (
            <div key={i} className="w-52 text-center text-[10.5px]">
              <div className="mb-1 h-14 border-b border-[#15201e]" />
              {p.nombre && <div className="text-[11.5px] font-bold">{p.nombre}</div>}
              <div className="text-doc-tenue">{ETIQUETA_INSTANCIA[p.instancia]}</div>
            </div>
          ))}
        </Firmas>
        <Pie d={doc} />
      </Hoja>
    </div>
  );
}
