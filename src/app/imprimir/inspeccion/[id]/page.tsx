import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ETIQUETA_ESTADO_EVENTO, ETIQUETA_TIPO } from "@/lib/eventos-tipos";
import { datosInspeccion, periodoInspeccion } from "@/lib/inspeccion";
import { obtenerInvestigacion } from "@/lib/investigacion";
import type { Investigacion } from "@/lib/investigacion-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { documentoBase } from "../../base";
import { BarraImpresion } from "../../barra";
import { Bloque, fechaCorta, Ficha, Hoja, Membrete, Pie } from "../../componentes";
import { HojaDeclaracion } from "../../evento/hoja-declaracion";
import { HojaInvestigacion } from "../../investigacion/hoja-investigacion";
import { HojasNotificacion } from "../../notificacion-riesgos/hojas";

export const metadata: Metadata = { title: "Paquete de inspección" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = { ok: "Cumple", aviso: "Parcial", alerta: "No cumple", no_aplica: "No aplica" };
const TONO: Record<string, string> = { ok: "bg-[#e7f4ec] text-[#1d7a46]", aviso: "bg-[#fdf4dc] text-[#7a5300]", alerta: "bg-[#fdecea] text-[#b42318]", no_aplica: "bg-[#eef1f0] text-[#5b6b67]" };
const Th = ({ children }: { children?: React.ReactNode }) => <th className="py-1 pr-2 text-left font-medium text-doc-tenue">{children}</th>;
const Td = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => <td className={`py-1 pr-2 align-top ${className}`}>{children}</td>;

// Paquete para la inspección del INPSASEL: índice de cumplimiento, registros y, a continuación, las declaraciones,
// los informes de investigación (solo personal de salud) y las notificaciones de riesgo firmadas, en un solo documento.
export default async function PaqueteInspeccion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { desde, hasta } = periodoInspeccion(q.desde, q.hasta);
  const [d, base] = await Promise.all([datosInspeccion(sesion, id, desde, hasta), documentoBase(sesion)]);
  if (!d) notFound();
  const supabase = await crearClienteServidor();
  const { data: emp } = await supabase.from("empresas").select("logo").eq("id", id).single();
  const doc = { ...base, empresa: { razon_social: d.empresa.razonSocial, rif: d.empresa.rif, logo: (emp?.logo as string | null) ?? null } };
  const investigaciones = sesion.clinico
    ? (await Promise.all(d.eventos.filter((e) => d.investigaciones.has(e.id)).map(async (e) => ({ e, inv: await obtenerInvestigacion(e) }))))
        .filter((x): x is { e: typeof x.e; inv: Investigacion & { id: string } } => Boolean(x.inv?.id))
    : [];
  const firmadas = d.trabajadores.filter((t) => t.notificacionVigente && t.notificacionId).map((t) => t.notificacionId!);
  const notificaciones = firmadas.length ? await HojasNotificacion({ ids: firmadas, base }) : null;

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/inspeccion?empresa=${id}&desde=${desde}&hasta=${hasta}`} titulo={`Paquete de inspección · ${d.empresa.razonSocial}`} />
      <Hoja>
        <Membrete d={doc} />
        <div className="mt-5 mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-balance">Paquete para inspección del INPSASEL</h1>
            <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">
              Del {fechaCorta(desde)} al {fechaCorta(hasta)}
            </span>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-cifra text-3xl font-bold">{d.puntaje === null ? "—" : `${d.puntaje} %`}</div>
            <div className="text-[10.5px] text-doc-tenue">índice de cumplimiento</div>
          </div>
        </div>
        <Bloque titulo="Empresa">
          <Ficha celdas={[
            { k: "Razón social", v: d.empresa.razonSocial, ancho: 2 },
            { k: "RIF", v: d.empresa.rif },
            { k: "NIL", v: d.empresa.nil },
            { k: "Actividad económica", v: d.empresa.actividad, ancho: 2 },
            { k: "Servicio de SST", v: [d.empresa.servicioSst, d.empresa.servicioSstRegistro && `registro ${fechaCorta(d.empresa.servicioSstRegistro)}`].filter(Boolean).join(", ") },
            { k: "Programa de SST", v: d.empresa.psstRegistro ? `registro ${fechaCorta(d.empresa.psstRegistro)}` : "—" },
          ]} />
        </Bloque>
        <Bloque titulo="Índice de cumplimiento">
          <table className="w-full border-collapse text-[11px]">
            <thead><tr><Th>Requisito</Th><Th>Base legal</Th><Th>Cumple</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {d.criterios.map((c) => (
                <tr key={c.clave} className="border-t border-doc-linea">
                  <Td>{c.titulo}<div className="text-[10px] text-doc-tenue">{c.detalle}</div></Td>
                  <Td className="text-[10px]">{c.base}</Td>
                  <Td className="font-cifra">{c.estado === "no_aplica" ? "—" : `${c.cumplidos}/${c.total}`}</Td>
                  <Td><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TONO[c.estado]}`}>{ESTADO[c.estado]}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
        <Bloque titulo="Contenido">
          {[
            `Registro de accidentes, incidentes y enfermedades (${d.eventos.length})`,
            `Registro de trabajadores: evaluación médica y notificación de riesgos (${d.trabajadores.length})`,
            `Puestos de trabajo e informes trimestrales de vigilancia`,
            `Declaraciones (${d.eventos.length})`,
            sesion.clinico ? `Informes de investigación NT-02 (${investigaciones.length})` : "Informes de investigación NT-02: los imprime el personal de salud",
            `Notificaciones de riesgo firmadas y vigentes (${firmadas.length})`,
          ].map((x, i) => `${i + 1}. ${x}`).join("\n")}
        </Bloque>
        <Pie d={doc} />
      </Hoja>

      <Hoja>
        <Membrete d={doc} compacto />
        <Bloque titulo={`Accidentes, incidentes y enfermedades (${d.eventos.length})`}>
          {d.eventos.length === 0 ? "Sin eventos en el período." : (
            <table className="w-full border-collapse text-[10.5px]">
              <thead><tr><Th>Nº</Th><Th>Fecha</Th><Th>Tipo</Th><Th>Trabajador</Th><Th>Declarado</Th><Th>Nº INPSASEL</Th><Th>Días perd./carg.</Th><Th>Estado</Th></tr></thead>
              <tbody>
                {d.eventos.map((e) => (
                  <tr key={e.id} className="border-t border-doc-linea">
                    <Td className="font-cifra">{e.numero}</Td>
                    <Td>{fechaCorta(e.fechaHora)}</Td>
                    <Td>{ETIQUETA_TIPO[e.tipo]}</Td>
                    <Td>{e.trabajador ?? "—"}</Td>
                    <Td>{e.tipo === "incidente" ? "n/a" : fechaCorta(e.fechaDeclaracion)}</Td>
                    <Td>{e.numeroDeclaracion || "—"}</Td>
                    <Td className="font-cifra">{e.tipo === "accidente" ? `${e.diasPerdidos}/${e.diasCargados}` : "—"}</Td>
                    <Td>{ETIQUETA_ESTADO_EVENTO[e.estado]}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Bloque>
        <Bloque titulo={`Trabajadores activos (${d.trabajadores.length})`}>
          <table className="w-full border-collapse text-[10.5px]">
            <thead><tr><Th>Trabajador</Th><Th>Cédula</Th><Th>Puesto</Th><Th>Evaluación vigente hasta</Th><Th>Notificación de riesgos</Th></tr></thead>
            <tbody>
              {d.trabajadores.map((t) => (
                <tr key={t.id} className="border-t border-doc-linea">
                  <Td>{t.nombre}</Td>
                  <Td>{t.cedula}</Td>
                  <Td>{t.puesto ?? "—"}</Td>
                  <Td className={t.evaluacionVigente ? "" : "text-[#b42318]"}>{fechaCorta(t.aptitudHasta)}</Td>
                  <Td className={t.notificacionVigente ? "" : "text-[#b42318]"}>
                    {!t.notificadoEn ? "Sin notificar" : !t.firmadoEn ? `Entregada ${fechaCorta(t.notificadoEn)}, sin acuse` : `Firmada ${fechaCorta(t.firmadoEn)}${t.notificacionVigente ? "" : " (desactualizada)"}`}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
        <Bloque titulo="Puestos de trabajo">
          <table className="w-full border-collapse text-[10.5px]">
            <thead><tr><Th>Puesto</Th><Th>Trabajadores</Th><Th>Evaluado el</Th></tr></thead>
            <tbody>{d.puestos.map((p) => <tr key={p.id} className="border-t border-doc-linea"><Td>{p.nombre}</Td><Td className="font-cifra">{p.trabajadores}</Td><Td className={p.evaluadoEn || !p.trabajadores ? "" : "text-[#b42318]"}>{fechaCorta(p.evaluadoEn)}</Td></tr>)}</tbody>
          </table>
        </Bloque>
        <Bloque titulo="Informes trimestrales de vigilancia epidemiológica">
          {d.informes.length ? d.informes.map((i) => `Del ${fechaCorta(i.desde)} al ${fechaCorta(i.hasta)} (actualizado ${fechaCorta(i.actualizadoEn)})`).join("\n") : "Ninguno guardado para el período."}
        </Bloque>
        <Pie d={doc} />
      </Hoja>

      {d.eventos.map((e) => <HojaDeclaracion key={e.id} e={e} base={base} />)}
      {investigaciones.map(({ e, inv }) => <HojaInvestigacion key={inv.id} e={e} inv={inv} base={base} />)}
      {notificaciones}
    </div>
  );
}
