import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerConsulta, listarConsultas } from "@/lib/consultas";
import { ETIQUETA_ORIGEN, resumenAntecedentes } from "@/lib/consultas-tipos";
import { obtenerDocumento } from "@/lib/documentos";
import type { EmpleoAnterior } from "@/lib/historia-laboral";
import { ETIQUETA_APTITUD, GRUPOS_RIESGO } from "@/lib/pacientes";
import { obtenerTrabajador } from "@/lib/pacientes-datos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { CERTIFICACION_TRABAJADOR } from "@/lib/mensajes";
import { Bloque, DatosPaciente, fechaCorta, Firmas, FirmaTrabajador, Hoja, Membrete, Pie, Titulo } from "../../componentes";
import { textoDiagnostico } from "@/lib/diagnostico-texto";

export const metadata: Metadata = { title: "Historia clínica" };
export const dynamic = "force-dynamic";

const MAX_CONSULTAS = 30;

// Historia clínica ocupacional completa del trabajador: datos, historia laboral, riesgos y todas sus consultas (la más reciente primero)
export default async function HistoriaClinica({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  // Solo personal de salud: la historia contiene datos clínicos
  if (sesion.demo || !sesion.clinico) notFound();
  const t = await obtenerTrabajador(id);
  if (!t) notFound();
  const lista = await listarConsultas({ trabajadorId: id, limite: MAX_CONSULTAS });
  const supabase = await crearClienteServidor();
  const [base, consultas, { data: empleos }] = await Promise.all([
    lista[0] ? obtenerDocumento(lista[0].id) : null,
    Promise.all(lista.map((c) => obtenerConsulta(c.id))),
    supabase.from("historia_laboral").select("*").eq("trabajador_id", id).order("creado_en"),
    supabase.rpc("registrar_acceso", { p_trabajador: id }),
  ]);
  const volver = `/pacientes/${id}`;

  if (!base) {
    return (
      <div className="min-h-dvh bg-neutral-100 print:bg-white">
        <BarraImpresion volver={volver} titulo={`Historia clínica · ${t.nombres} ${t.apellidos}`} bloqueado />
        <p className="mx-auto max-w-2xl rounded-lg bg-white p-6 text-center text-sm">Este trabajador aún no tiene consultas registradas.</p>
      </div>
    );
  }
  const ant = resumenAntecedentes(base.datos.antecedentes);
  const riesgos = GRUPOS_RIESGO.filter(([k]) => (t.riesgos[k] ?? []).length);
  const certificacion = base.org.ajustes.certificacion_trabajador ?? CERTIFICACION_TRABAJADOR;

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={volver} titulo={`Historia clínica · ${t.nombres} ${t.apellidos}`} />
      <Hoja className="print:block">
        <Membrete d={base} />
        <Titulo d={base} prefijo="HC" sub={`${lista.length} consulta${lista.length === 1 ? "" : "s"}${lista.length === MAX_CONSULTAS ? " (las más recientes)" : ""}`}>Historia clínica ocupacional</Titulo>
        <DatosPaciente d={base} />
        <Bloque titulo="Datos personales">
          <div className="grid grid-cols-3 gap-x-5 gap-y-1">
            <div><span className="text-doc-tenue">Nacimiento:</span> {fechaCorta(t.fechaNacimiento)}</div>
            <div><span className="text-doc-tenue">Grupo sanguíneo:</span> {t.grupoSanguineo ?? "—"}</div>
            <div><span className="text-doc-tenue">Lateralidad:</span> {t.lateralidad ?? "—"}</div>
            <div><span className="text-doc-tenue">Teléfono:</span> {t.telefono ?? "—"}</div>
            <div className="col-span-2"><span className="text-doc-tenue">Aptitud vigente:</span> {t.aptitud ? `${ETIQUETA_APTITUD[t.aptitud]} desde ${fechaCorta(t.aptitudFecha)}` : "Sin evaluar"}</div>
          </div>
        </Bloque>
        <Bloque titulo="Antecedentes">{`Personales: ${ant.personales}\nFamiliares: ${ant.familiares}`}</Bloque>
        {riesgos.length > 0 && (
          <Bloque titulo="Riesgos del puesto actual">
            <div className="grid grid-cols-2 gap-x-6">{riesgos.map(([k, n]) => <div key={k}><b>{n}:</b> {t.riesgos[k]!.join(", ")}</div>)}</div>
          </Bloque>
        )}
        {(empleos as EmpleoAnterior[] | null)?.length ? (
          <Bloque titulo="Historia laboral">
            {(empleos as EmpleoAnterior[]).map((e) => (
              <div key={e.id} className="mb-1">
                <b>{e.empresa}</b>{[e.cargo, e.duracion].filter(Boolean).map((x) => ` · ${x}`).join("")}
                {(e.accidentes || e.enfermedades) && <span className="text-doc-tenue"> · {[e.accidentes && `Accidentes: ${e.accidentes}`, e.enfermedades && `Enfermedades: ${e.enfermedades}`].filter(Boolean).join(" · ")}</span>}
              </div>
            ))}
          </Bloque>
        ) : null}
        <Bloque titulo="Consultas">
          <div className="space-y-2.5">
            {consultas.map((c, i) => {
              if (!c) return null;
              const x = c.datos;
              return (
                <div key={x.id} className="break-inside-avoid rounded-lg border border-doc-linea px-3 py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <b>{fechaCorta(x.fecha)} · {lista[i].motivo ?? "Consulta"} <span className="font-normal capitalize text-doc-tenue">({x.tipo})</span></b>
                    <span className="text-doc-tenue">{c.medico ?? ""}</span>
                  </div>
                  {(x.motivoTexto || x.enfermedadActual) && <div>{[x.motivoTexto, x.enfermedadActual].filter(Boolean).join(". ")}</div>}
                  <div>
                    <span className="text-doc-tenue">Diagnóstico: </span>
                    {x.sano ? "Sano" : x.diagnosticos.map((dx) => `${textoDiagnostico(dx.cie10, dx.descripcion)} (${ETIQUETA_ORIGEN[dx.origen].toLowerCase()})`).join("; ") || "—"}
                  </div>
                  {x.aptitud.clasificacion && <div><span className="text-doc-tenue">Aptitud: </span>{ETIQUETA_APTITUD[x.aptitud.clasificacion]}</div>}
                  {x.reposo.activo && <div><span className="text-doc-tenue">Reposo: </span>del {fechaCorta(x.reposo.desde)} al {fechaCorta(x.reposo.hasta)}</div>}
                  {x.conclusiones && <div className="whitespace-pre-line"><span className="text-doc-tenue">Conclusiones: </span>{x.conclusiones}</div>}
                </div>
              );
            })}
          </div>
        </Bloque>
        {certificacion && <p className="mt-1 border-l-[3px] border-doc-linea py-1 pl-2.5 text-[10px] text-doc-tenue"><b className="text-[#15201e]">Certificación del trabajador.</b> {certificacion}</p>}
        <Firmas>
          {certificacion ? <FirmaTrabajador d={base} /> : <span />}
          {/* Firma a mano de quien emite la copia: no se estampa la firma escaneada de otro médico */}
          <div className="w-60 text-center text-[10.5px]">
            <div className="mb-1 h-14 border-b border-[#15201e]" />
            <div className="text-[11.5px] font-bold">{sesion.nombre}</div>
            <div className="text-doc-tenue">Emite la copia · Firma y sello</div>
          </div>
        </Firmas>
        <Pie d={base} />
      </Hoja>
    </div>
  );
}
