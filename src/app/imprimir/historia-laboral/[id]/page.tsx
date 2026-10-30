import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AjustesDocumentos } from "@/lib/documentos";
import { CONDICIONES, type EmpleoAnterior } from "@/lib/historia-laboral";
import { CERTIFICACION_TRABAJADOR } from "@/lib/mensajes";
import { GRUPOS_RIESGO } from "@/lib/pacientes";
import { obtenerTrabajador } from "@/lib/pacientes-datos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { Bloque, fechaCorta, Ficha, Firmas, folio, Hoja, Membrete, Pie } from "../../componentes";
import { ahora } from "@/lib/fecha";

export const metadata: Metadata = { title: "Historia laboral" };
export const dynamic = "force-dynamic";

const Linea = ({ nombre, rol }: { nombre: string; rol: string }) => (
  <div className="w-56 text-center text-[10.5px]">
    <div className="mb-1 h-14 border-b border-[#15201e]" />
    <div className="text-[11.5px] font-bold">{nombre}</div>
    <div className="text-doc-tenue">{rol}</div>
  </div>
);

// Historia laboral del trabajador como documento aparte (en el SAME se imprime sola, con su firma):
// cargo actual y sus riesgos, y los empleos anteriores con condiciones, riesgos, EPP, accidentes y enfermedades.
export default async function HistoriaLaboral({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  // Lleva enfermedades y problemas de salud: solo personal de salud, como la historia clínica
  if (sesion.demo || !sesion.clinico || !sesion.orgId) notFound();
  const t = await obtenerTrabajador(id);
  if (!t) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: tr }, { data: empleos }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, ajustes, logo").eq("id", sesion.orgId).single(),
    supabase.from("trabajadores").select("ficha, profesion, nivel_educativo, empresas(razon_social, rif, logo)").eq("id", id).single(),
    supabase.from("historia_laboral").select("*").eq("trabajador_id", id).order("creado_en"),
    supabase.rpc("registrar_acceso", { p_trabajador: id }),
  ]);
  const emp = (tr as unknown as { empresas: { razon_social: string; rif: string; logo: string | null } | null } | null)?.empresas;
  const x = tr as { ficha: string | null; profesion: string | null; nivel_educativo: string | null } | null;
  const doc = {
    org: { ...(org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    empresa: { razon_social: emp?.razon_social ?? t.empresa, rif: emp?.rif ?? "", logo: emp?.logo ?? null },
    impreso: { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(ahora())) },
  };
  const lista = (empleos ?? []) as EmpleoAnterior[];
  const riesgos = GRUPOS_RIESGO.filter(([k]) => (t.riesgos[k] ?? []).length);
  const certificacion = doc.org.ajustes.certificacion_trabajador ?? CERTIFICACION_TRABAJADOR;
  const nombre = `${t.nombres} ${t.apellidos}`;

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/pacientes/${id}`} titulo={`Historia laboral · ${nombre}`} />
      <Hoja className="print:block">
        <Membrete d={doc} />
        <div className="mt-5 mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight">Historia laboral</h1>
            <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">
              {lista.length} empleo{lista.length === 1 ? "" : "s"} anterior{lista.length === 1 ? "" : "es"}
            </span>
          </div>
          <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
            <div>Folio <b className="font-medium text-[#15201e]">{folio("HL", id)}</b></div>
            <div>Historia <b className="font-medium text-[#15201e]">{String(t.historia).padStart(9, "0")}</b></div>
          </div>
        </div>
        <Ficha
          celdas={[
            { k: "Trabajador", v: nombre, ancho: 2, destacada: true },
            { k: "Cédula", v: t.cedula },
            { k: "Nacimiento", v: fechaCorta(t.fechaNacimiento) },
            { k: "Cargo actual · Dependencia", v: [t.cargo, t.dependencia].filter(Boolean).join(" · "), ancho: 2 },
            { k: "Ingreso · Turno", v: [t.fechaIngreso && fechaCorta(t.fechaIngreso), t.turno].filter(Boolean).join(" · ") },
            { k: "Ficha", v: x?.ficha },
            { k: "Profesión · Nivel educativo", v: [x?.profesion, x?.nivel_educativo].filter(Boolean).join(" · "), ancho: 4 },
          ]}
        />
        {riesgos.length > 0 && (
          <Bloque titulo="Riesgos del cargo actual">
            <div className="grid grid-cols-2 gap-x-6">{riesgos.map(([k, n]) => <div key={k}><b>{n}:</b> {t.riesgos[k]!.join(", ")}</div>)}</div>
          </Bloque>
        )}
        <Bloque titulo="Empleos anteriores">
          {lista.length === 0 ? (
            <p>No refiere empleos anteriores.</p>
          ) : (
            <div className="space-y-2.5">
              {lista.map((e, i) => {
                const condiciones = CONDICIONES.filter(([k]) => e.condiciones?.[k]).map(([k, n]) => `${n}: ${e.condiciones[k]}`);
                const rs = GRUPOS_RIESGO.filter(([k]) => (e.riesgos?.[k] ?? []).length).map(([k, n]) => `${n}: ${e.riesgos[k].join(", ")}`);
                return (
                  <div key={e.id} className="break-inside-avoid rounded-lg border border-doc-linea px-3 py-2">
                    <div className="flex flex-wrap justify-between gap-2">
                      <b>{i + 1}. {e.empresa}{e.cargo ? ` · ${e.cargo}` : ""}</b>
                      <span className="text-doc-tenue">{[e.industria, e.duracion, e.horario].filter(Boolean).join(" · ")}</span>
                    </div>
                    {e.descripcion && <div>{e.descripcion}</div>}
                    {condiciones.length > 0 && <div><span className="text-doc-tenue">Condiciones: </span>{condiciones.join(" · ")}</div>}
                    {rs.length > 0 && <div><span className="text-doc-tenue">Riesgos: </span>{rs.join(" · ")}</div>}
                    {e.epp && <div><span className="text-doc-tenue">EPP: </span>{e.epp}</div>}
                    {e.accidentes && <div><span className="text-doc-tenue">Accidentes: </span>{e.accidentes}</div>}
                    {e.enfermedades && <div><span className="text-doc-tenue">Enfermedades: </span>{e.enfermedades}</div>}
                    {e.problemas_salud && <div><span className="text-doc-tenue">Problemas de salud: </span>{e.problemas_salud}</div>}
                    {e.observaciones && <div><span className="text-doc-tenue">Observaciones: </span>{e.observaciones}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </Bloque>
        {certificacion && <p className="mt-1 border-l-[3px] border-doc-linea py-1 pl-2.5 text-[10px] text-doc-tenue"><b className="text-[#15201e]">Certificación del trabajador.</b> {certificacion}</p>}
        <Firmas>
          <Linea nombre={nombre} rol={`C.I. ${t.cedula} · Trabajador`} />
          <Linea nombre={sesion.nombre} rol="Firma y sello de quien registra" />
        </Firmas>
        <Pie d={doc} />
      </Hoja>
    </div>
  );
}
