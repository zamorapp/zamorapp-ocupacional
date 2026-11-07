import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { URL_PUBLICA } from "@/lib/invitaciones";
import {
  APARTADOS, METODO_PSICOSOCIAL, NIVELES, ROLES_PSICOSOCIAL, codigoLegible, ordenarPorRojo, porcentaje, prioridadDimension, rango, type Dimension,
} from "@/lib/psicosocial";
import { codigosPsicosociales, obtenerPsicosocial, obtenerPsicosocialEmpresa, resultadosPsicosociales } from "@/lib/psicosocial-datos";
import { puedePortal } from "@/lib/permisos-portal";
import { obtenerSesion } from "@/lib/sesion";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { documentoBase } from "../../base";
import { BarraImpresion } from "../../barra";
import type { DatosDocumento } from "@/lib/documentos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Bloque, fechaCorta, Ficha, FirmaMedico, Firmas, folio, Hoja, Membrete, Pie } from "../../componentes";

export const metadata: Metadata = { title: "Riesgos psicosociales" };
export const dynamic = "force-dynamic";

// Colores de papel (legibles también en blanco y negro por el número y el texto)
const PAPEL = [
  "bg-[#e7f4ec] text-[#1d7a46] border border-[#1d7a46]",
  "bg-[#fdf4dc] text-[#7a5300] border border-[#7a5300]",
  "bg-[#fdecea] text-[#b42318] border border-[#b42318]",
];
const BARRA = ["bg-[#2f9e5b]", "bg-[#e0b100]", "bg-[#d4413b]"];

function BarraPapel({ d, n }: { d: Dimension; n: number }) {
  return (
    <div className="flex h-[16px] w-full overflow-hidden rounded-sm border border-doc-linea text-[8.5px] font-bold [print-color-adjust:exact]">
      {[d.verde, d.amarillo, d.rojo].map((x, i) => x > 0 && (
        <div key={i} className={`grid place-items-center ${BARRA[i]} ${i === 1 ? "text-[#3d2c00]" : "text-white"}`} style={{ width: `${(x * 100) / n}%` }}>
          {porcentaje(x, n) >= 8 && `${porcentaje(x, n)} %`}
        </div>
      ))}
    </div>
  );
}

type Medico = NonNullable<DatosDocumento["medicoDatos"]>;
async function datosMedico(usuario: string | null, conImagenes: boolean): Promise<Medico | null> {
  if (!usuario) return null;
  const supabase = await crearClienteServidor();
  const [{ data: p }, img] = await Promise.all([
    supabase.from("perfiles").select("nombre_completo, cedula, especialidad, mpps, colegio_medicos, registro_inpsasel, correo, mostrar_firma, mostrar_sello").eq("id", usuario).maybeSingle(),
    conImagenes ? supabase.rpc("firma_sello", { p_usuario: usuario }).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!p) return null;
  return { ...(p as Omit<Medico, "firma_url" | "sello_url">), ...((img.data as { firma_url: string | null; sello_url: string | null } | null) ?? { firma_url: null, sello_url: null }) };
}

// Informe de la evaluación psicosocial: solo resultados agregados (la base no entrega otra cosa). Lo mismo para el
// servicio y para la empresa; la empresa solo puede abrir las cerradas. ?hoja=codigos: papelitos con QR (servicio).
export default async function ImprimirPsicosocial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hoja?: string }> }) {
  const [{ id }, { hoja }] = await Promise.all([params, searchParams]);
  const sesion = await obtenerSesion();
  const empresaRol = esRolEmpresa(sesion.rol);
  const ev = empresaRol ? await obtenerPsicosocialEmpresa(id) : await obtenerPsicosocial(id);
  if (!ev || (!sesion.orgId && !sesion.demo)) notFound();
  // RR. HH. sin el permiso «Descargar documentos» no abre informes (Usuarios y roles)
  if (!puedePortal(sesion, "descargas")) notFound();
  const servicio = sesion.demo || (!!sesion.rol && ROLES_PSICOSOCIAL.includes(sesion.rol));

  if (hoja === "codigos") {
    if (!servicio || empresaRol) notFound();
    const { libres } = await codigosPsicosociales(id);
    const qrs = await Promise.all(libres.map((c) => QRCode.toString(`${URL_PUBLICA}/c/${c}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" })));
    const dominio = URL_PUBLICA.replace(/^https?:\/\//, "");
    // 10 papelitos por hoja carta (2 × 5), con línea de corte
    const hojas: string[][] = [];
    for (let i = 0; i < libres.length; i += 10) hojas.push(libres.slice(i, i + 10));
    return (
      <div className="min-h-dvh bg-neutral-100 print:bg-white">
        <BarraImpresion volver={`/psicosocial/${ev.id}`} titulo={`Códigos · ${ev.titulo}`} />
        {hojas.length === 0 && <Hoja><p>No hay códigos sin usar. Genera más en la evaluación.</p></Hoja>}
        {hojas.map((h, k) => (
          <Hoja key={k} className="!px-[8mm] !pt-[8mm]">
            <div className="grid flex-1 grid-cols-2 grid-rows-5 border-l border-t border-dashed border-[#999]">
              {h.map((c) => (
                <div key={c} className="flex items-center gap-3 border-r border-b border-dashed border-[#999] p-3">
                  <div className="size-[30mm] shrink-0 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qrs[libres.indexOf(c)] }} />
                  <div className="min-w-0 text-[10px] leading-snug">
                    <div className="text-[11px] font-bold">Cuestionario anónimo de condiciones de trabajo</div>
                    <div className="text-doc-tenue">{ev.empresa}</div>
                    <div className="mt-1">Escanea el código o entra a</div>
                    <div className="font-bold whitespace-nowrap">{dominio}/c</div>
                    <div>y escribe:</div>
                    <div className="mt-0.5 font-cifra text-[17px] font-bold tracking-[.12em]">{codigoLegible(c)}</div>
                    <div className="mt-1 text-[9pt] leading-tight text-doc-tenue">Sin nombre ni cédula. Sirve una sola vez. Unos 10 minutos. No hay respuestas buenas ni malas.</div>
                  </div>
                </div>
              ))}
            </div>
          </Hoja>
        ))}
      </div>
    );
  }

  const [res, base, medico] = await Promise.all([
    resultadosPsicosociales(id),
    sesion.demo ? Promise.resolve(null) : documentoBase(sesion),
    datosMedico(ev.creadoPor, !empresaRol && !sesion.demo),
  ]);
  const doc = {
    org: base?.org ?? { nombre: sesion.organizacion || "Servicio de salud ocupacional", rif: null, direccion: null, telefono: null, correo: null, logo: null, ajustes: {} },
    // La empresa va una sola vez, en la ficha (el membrete la repetía)
    empresa: { razon_social: "", rif: "", logo: null },
    impreso: base?.impreso ?? { por: sesion.nombre, el: "" },
  };
  // Firma y sello de quien hizo la evaluación; la empresa no lee las imágenes de firma: su copia sale con el nombre
  const firma = {
    org: doc.org, medicoDatos: medico, medico: medico?.nombre_completo ?? null, firmadaEnSame: null,
    sin: empresaRol || sesion.demo ? ["firma"] : [],
  } as unknown as DatosDocumento;
  const n = res?.total ?? 0;
  const borrador = ev.estado !== "cerrada";
  const orden = res?.dimensiones ? ordenarPorRojo(res.dimensiones) : [];

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={empresaRol ? "/portal" : `/psicosocial/${ev.id}`} titulo={`Informe · ${ev.titulo}`} />
      <Hoja className="relative print:block">
        {borrador && <div className="pointer-events-none absolute top-[40%] left-1/2 -translate-x-1/2 -rotate-12 text-[64px] font-extrabold tracking-widest text-[#b42318]/10">BORRADOR</div>}
        <Membrete d={doc} sinEmpresa />
        <div className="mt-5 mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-balance">Evaluación de riesgos psicosociales</h1>
            <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold tracking-[.08em] text-doc-acento uppercase">
              {METODO_PSICOSOCIAL.nombre} · LOPCYMAT art. 56 · NT-04-2023
            </span>
          </div>
          <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
            <div>Folio <b className="font-medium text-[#15201e]">{folio("PS", ev.id)}</b></div>
            <div>{ev.cerradaEn ? <>Cerrada <b className="font-medium text-[#15201e]">{fechaCorta(ev.cerradaEn)}</b></> : "En curso"}</div>
          </div>
        </div>

        <Ficha celdas={[
          { k: "Empresa", v: ev.empresa, ancho: 2, destacada: true },
          { k: "Evaluación", v: ev.titulo, ancho: 2 },
          { k: "Inicio", v: fechaCorta(ev.inicio) },
          { k: "Acuerdo del Comité SSL", v: ev.acuerdoFecha ? fechaCorta(ev.acuerdoFecha) : "—" },
          { k: "Respuestas", v: res ? `${n}${ev.trabajadores ? ` de ${ev.trabajadores} (${porcentaje(n, ev.trabajadores)} %)` : ""}` : "—", ancho: 2 },
        ]} />

        <Bloque titulo="Cómo se hizo">
          Cuestionario CoPsoQ-istas21 en su versión corta (38 preguntas, 6 apartados), respondido de forma voluntaria y anónima, desde el celular con un código de un solo uso o en papel.
          Cada apartado se compara con la población trabajadora de referencia dividida en tercios: verde (situación más favorable para la salud), amarillo (intermedia) y rojo (más desfavorable).
          No se guardó el nombre, la cédula, el código ni la hora de ninguna respuesta; los grupos con menos de {ev.minimo} respuestas se presentan juntos.
        </Bloque>

        {!res?.suficiente ? (
          <Bloque titulo="Resultados">Todavía no hay {ev.minimo} respuestas: no se presentan resultados para proteger el anonimato.</Bloque>
        ) : (
          <>
            <Bloque titulo="Resultados de toda la empresa · % de trabajadores en cada nivel">
              <table className="w-full border-collapse text-[10.5px]">
                <thead>
                  <tr className="text-left text-[9px] tracking-wide text-doc-tenue uppercase">
                    <th className="py-1 pr-2 font-bold">Apartado</th>
                    <th className="w-[36%] py-1 pr-2 font-bold">Verde · amarillo · rojo</th>
                    <th className="py-1 pr-2 text-right font-bold">Media</th>
                    <th className="py-1 text-right font-bold">Situación</th>
                  </tr>
                </thead>
                <tbody>
                  {res.dimensiones!.map((d) => {
                    const pr = prioridadDimension(d);
                    const a = APARTADOS[d.apartado - 1];
                    return (
                      <tr key={d.apartado} className="border-t border-doc-linea align-middle">
                        <td className="py-1 pr-2"><b>{a.nombre}</b><div className="text-[9pt] leading-tight text-doc-tenue">{a.que}</div></td>
                        <td className="py-1 pr-2"><BarraPapel d={d} n={n} /></td>
                        <td className="py-1 pr-2 text-right font-cifra">{String(d.media).replace(".", ",")}/{a.maximo}</td>
                        <td className="py-1 text-right"><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold [print-color-adjust:exact] ${PAPEL[pr.orden]}`}>{pr.texto}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-1 text-[9pt] text-doc-tenue">Prioritario: la mitad o más de los trabajadores en rojo. A vigilar: más de un tercio (en la población de referencia es un tercio).</div>
            </Bloque>

            {(res.grupos ?? []).length > 0 && (
              <Bloque titulo="Por puesto o área · % de trabajadores en rojo">
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="text-[8.5px] tracking-wide text-doc-tenue uppercase">
                      <th className="py-1 pr-2 text-left font-bold">Grupo</th>
                      {APARTADOS.map((a) => <th key={a.n} className="px-1 py-1 text-center font-bold">{a.corto}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {res.grupos!.map((g) => (
                      <tr key={g.id} className="border-t border-doc-linea">
                        <td className="py-1 pr-2"><b>{g.nombre}</b> <span className="text-doc-tenue">({g.n})</span></td>
                        {APARTADOS.map((a) => {
                          const d = g.dimensiones.find((x) => x.apartado === a.n);
                          if (!d) return <td key={a.n} className="text-center">—</td>;
                          const pr = prioridadDimension(d);
                          return <td key={a.n} className="px-0.5 py-0.5 text-center"><span className={`block rounded px-1 py-0.5 font-cifra [print-color-adjust:exact] ${PAPEL[pr.orden]} ${pr.orden === 2 ? "border-2 font-extrabold underline" : pr.orden === 1 ? "font-bold" : "font-normal"}`}>{pr.orden === 2 ? "▲ " : ""}{porcentaje(d.rojo, g.n)} %</span></td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-1 text-[9pt] text-doc-tenue">▲ y subrayado: la mitad o más del grupo en rojo (prioritario). En negrita: más de un tercio (a vigilar).</div>
              </Bloque>
            )}
            {(res.grupos ?? []).length === 0 && !!res.sin_grupo && (
              <div className="mt-1 text-[9pt] text-doc-tenue">Los puestos tuvieron pocas respuestas: para que nadie pueda ser reconocido, los resultados se presentan solo para toda la empresa.</div>
            )}
          </>
        )}

        {ev.conclusiones && <Bloque titulo="Conclusiones">{ev.conclusiones}</Bloque>}

        <Bloque titulo="Plan de medidas preventivas">
          {ev.medidas.length === 0 ? (
            <p>Pendiente de acordar con el Comité de Seguridad y Salud Laboral.</p>
          ) : (
            <table className="w-full border-collapse text-[10.5px]">
              <thead>
                <tr className="text-left text-[9px] tracking-wide text-doc-tenue uppercase">
                  <th className="py-1 pr-2 font-bold">Apartado</th><th className="py-1 pr-2 font-bold">Medida</th><th className="py-1 pr-2 font-bold">Responsable</th><th className="py-1 font-bold">Plazo</th>
                </tr>
              </thead>
              <tbody>
                {[...ev.medidas].sort((a, b) => orden.findIndex((d) => d.apartado === a.apartado) - orden.findIndex((d) => d.apartado === b.apartado)).map((m) => (
                  <tr key={m.id} className="border-t border-doc-linea align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{APARTADOS[m.apartado - 1]?.corto}</td>
                    <td className="py-1 pr-2">{m.medida}</td>
                    <td className="py-1 pr-2">{m.responsable || "—"}</td>
                    <td className="py-1">{m.plazo || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Bloque>

        <Bloque titulo="Intervalos de referencia (puntos por apartado)">
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[9pt] leading-tight">
            {APARTADOS.map((a) => (
              <div key={a.n}><b>{a.corto}</b><br />{NIVELES[0].nombre} {rango(a.verde)} · {NIVELES[1].nombre} {rango(a.amarillo)} · {NIVELES[2].nombre} {rango(a.rojo)}</div>
            ))}
          </div>
        </Bloque>

        <Firmas compacto><FirmaMedico d={firma} etiqueta="Médico ocupacional" compacto /></Firmas>
        <div className="pt-2 text-[7pt] leading-snug text-doc-tenue">{METODO_PSICOSOCIAL.cita} {METODO_PSICOSOCIAL.licencia}</div>
        <Pie d={doc} derecha="Sin datos personales: solo resultados agregados" />
      </Hoja>
    </div>
  );
}
