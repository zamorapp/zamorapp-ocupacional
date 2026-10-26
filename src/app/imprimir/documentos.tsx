import type { DatosDocumento } from "@/lib/documentos";
import { faltantesRecipe } from "@/lib/documentos";
import { clasificarImc, ETIQUETA_ORIGEN, imc, resumenAntecedentes } from "@/lib/consultas-tipos";
import { CERTIFICACION_TRABAJADOR } from "@/lib/mensajes";
import { GRUPOS_RIESGO, type Aptitud } from "@/lib/pacientes";
import {
  Bloque, CasillaSello, DatosPaciente, Ficha, fechaCorta, fechaLarga, FirmaMedico, Firmas, FirmaTrabajador, folio, Hoja, imagenesMedico, Lista, Membrete, Pie, Titulo, Veredicto,
} from "./componentes";

// "Elegible" / "Apto" / "Recomendable" según Configuración › Organización
function etiquetasAptitud(palabra = "Elegible"): Record<Aptitud, string> {
  const neg = palabra === "Elegible" ? "No elegible" : `No ${palabra.toLowerCase()}`;
  return {
    elegible: `${palabra} para el cargo propuesto`,
    elegible_con_restricciones: `${palabra} con restricciones`,
    no_elegible: neg,
    espera_resultados: "Espera resultados de exámenes",
    diferido: "Diferido",
  };
}
const TONO_APTITUD: Record<Aptitud, "ok" | "aviso" | "alerta" | "neutro"> = {
  elegible: "ok", elegible_con_restricciones: "aviso", no_elegible: "alerta", espera_resultados: "neutro", diferido: "neutro",
};
const COLOR_APTITUD: Record<Aptitud, string> = {
  elegible: "text-[#1d7a46]", elegible_con_restricciones: "text-[#7a5300]", no_elegible: "text-[#b42318]", espera_resultados: "text-doc-acento", diferido: "text-doc-acento",
};

const alteradosDe = (d: DatosDocumento) => [...d.datos.examenFuncional, ...d.datos.examenFisico].filter((x) => x.valor.trim() && x.valor.trim() !== x.normal.trim());

export function Constancia({ d }: { d: DatosDocumento }) {
  const a = d.org.ajustes;
  const etiquetas = etiquetasAptitud(a.palabra_aptitud);
  const apt = d.datos.aptitud;
  const clase = apt.clasificacion || null;
  const riesgos = GRUPOS_RIESGO.filter(([k]) => (d.trabajador.riesgos[k] ?? []).length);
  return (
    <Hoja>
      <Membrete d={d} />
      <Titulo d={d} prefijo="CA" sub={d.motivo?.nombre ? `Evaluación ${d.motivo.nombre.toLowerCase()}` : null}>{a.titulo_constancia || "Constancia de aptitud"}</Titulo>
      <DatosPaciente d={d} />
      <Bloque titulo="Resultado de la evaluación">
        {clase ? (
          <Veredicto
            tono={TONO_APTITUD[clase]}
            texto={etiquetas[clase]}
            detalle={[apt.vigenteHasta && `Vigente hasta el ${fechaCorta(apt.vigenteHasta)}`, "Según el protocolo de evaluación clínica ocupacional"].filter(Boolean).join(" · ")}
          />
        ) : (
          <p>Sin clasificación de aptitud.</p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[10.5px] text-doc-tenue">
          {(Object.keys(etiquetas) as Aptitud[]).filter((k) => k !== clase).map((k) => (
            <span key={k} className="before:mr-1.5 before:inline-block before:size-2.5 before:rounded-[2px] before:border before:border-[#9aa7a4] before:align-[-1px]">{etiquetas[k]}</span>
          ))}
        </div>
      </Bloque>
      {apt.limitaciones.length > 0 && <Bloque titulo="Restricciones">{apt.limitaciones.join(" · ")}</Bloque>}
      {riesgos.length > 0 && (
        <Bloque titulo="Riesgos del puesto">
          <div className="grid grid-cols-2 gap-x-6">
            {riesgos.map(([k, n]) => <div key={k}><b>{n}:</b> {d.trabajador.riesgos[k].join(", ")}</div>)}
          </div>
        </Bloque>
      )}
      {apt.observacion && <Bloque titulo="Recomendaciones al trabajador"><Lista texto={apt.observacion} /></Bloque>}
      {d.datos.recomendacionesEmpresa && <Bloque titulo="Recomendaciones a la empresa"><Lista texto={d.datos.recomendacionesEmpresa} /></Bloque>}
      {a.observacion_idoneidad && <p className="mt-1 border-l-[3px] border-doc-linea py-1 pl-2.5 text-[10px] text-doc-tenue">{a.observacion_idoneidad}</p>}
      <Firmas>
        {a.firma_paciente_constancia ? <FirmaTrabajador d={d} /> : <span />}
        {a.firma_medico_ocupacional !== false && <FirmaMedico d={d} etiqueta="Médico ocupacional" />}
      </Firmas>
      <Pie d={d} />
    </Hoja>
  );
}

function CuerpoReposo({ d, copia }: { d: DatosDocumento; copia: string }) {
  const r = d.datos.reposo;
  const dias = Math.round((Date.parse(r.hasta) - Date.parse(r.desde)) / 864e5) + 1;
  const reintegro = new Date(Date.parse(r.hasta) + 864e5).toISOString().slice(0, 10);
  const diag = d.datos.diagnosticos.find((x) => x.cie10 === r.cie10) ?? d.datos.diagnosticos[0];
  const t = d.trabajador;
  return (
    <Hoja media corte={false}>
      <Membrete d={d} compacto />
      <Titulo d={d} prefijo="RP" compacto copia={copia} sub={r.causa.replace(/_/g, " ")}>Reposo médico</Titulo>
      <Ficha celdas={[{ k: "Trabajador", v: t.nombre, ancho: 2, destacada: true }, { k: "Cédula", v: t.cedula }, { k: "Cargo", v: t.cargo }]} />
      <div className="mb-3 grid grid-cols-4 gap-2.5">
        {[["Desde", fechaCorta(r.desde)], ["Hasta", fechaCorta(r.hasta)], ["Días", String(dias)], ["Reintegro", fechaCorta(reintegro)]].map(([k, v]) => (
          <div key={k} className={`rounded-lg px-3 py-2 ${k === "Días" ? "border-2 border-doc-acento bg-doc-suave" : "border border-doc-linea"}`}>
            <div className="text-[8.5px] font-bold uppercase tracking-[.1em] text-doc-tenue">{k}</div>
            <div className="font-cifra text-[17px] font-medium">{v}</div>
          </div>
        ))}
      </div>
      {diag && <p><b>Diagnóstico:</b> {diag.cie10} {diag.descripcion}</p>}
      <p className="text-[10.5px] text-doc-tenue">Emitido por: {r.ente.replace(/_/g, " ")}</p>
      <Firmas>
        <span />
        <FirmaMedico d={d} compacto />
      </Firmas>
      <Pie d={d} derecha={`Folio ${folio("RP", d.datos.id)}`} />
    </Hoja>
  );
}

export function Reposo({ d }: { d: DatosDocumento }) {
  if (!d.datos.reposo.activo) return <Hoja media><p>Esta consulta no tiene reposo indicado.</p></Hoja>;
  const a = d.org.ajustes;
  // Original y copia en la misma hoja carta, con línea de corte
  return (
    <div className="hoja print:break-after-page">
      <CuerpoReposo d={d} copia={a.reposo_pie_original ?? "Original · RR. HH."} />
      <div className="mx-auto -mt-4 mb-4 flex max-w-[216mm] items-center gap-2 text-[10px] text-neutral-400 before:flex-1 before:border-t before:border-dashed before:border-neutral-400 after:flex-1 after:border-t after:border-dashed after:border-neutral-400 print:my-[3mm]">
        cortar aquí
      </div>
      <CuerpoReposo d={d} copia={a.reposo_pie_copia ?? "Copia · Servicio médico"} />
    </div>
  );
}

// Informe de la consulta (equivale a la «Consulta médica» del SAME)
export function Informe({ d }: { d: DatosDocumento }) {
  const c = d.datos;
  const sv = c.signos;
  const valImc = imc(sv.peso, sv.talla);
  const alterados = alteradosDe(d);
  const ant = resumenAntecedentes(c.antecedentes);
  const habitos = c.habitos.filter((h) => h.valor.trim());
  const etiquetas = etiquetasAptitud(d.org.ajustes.palabra_aptitud);
  const clase = c.aptitud.clasificacion || null;
  const certificacion = d.org.ajustes.certificacion_trabajador ?? CERTIFICACION_TRABAJADOR;
  const signos = [
    ["TA", sv.ta, "mmHg"], ["FC", sv.fc, "lpm"], ["FR", sv.fr, "rpm"], ["Temp.", sv.temp, "°C"], ["SatO₂", sv.sat, "%"],
    ["Peso · Talla", sv.peso || sv.talla ? `${sv.peso ?? "—"} kg · ${sv.talla ?? "—"} cm` : "", ""],
    ["IMC", valImc !== null ? String(valImc).replace(".", ",") : "", clasificarImc(valImc)?.texto.toLowerCase() ?? ""],
  ].filter(([, v]) => v) as [string, string, string][];
  // Flujo normal al imprimir: el informe suele ocupar dos hojas y así no deja huecos al pasar de página
  return (
    <Hoja className="print:block">
      <Membrete d={d} />
      <Titulo d={d} prefijo="CM" sub={[d.motivo?.nombre, c.tipo].filter(Boolean).join(" · ")}>Consulta médica</Titulo>
      <DatosPaciente d={d} />
      {(c.motivoTexto || c.enfermedadActual) && (
        <Bloque titulo="Motivo y enfermedad actual">{[c.motivoTexto, c.enfermedadActual].filter(Boolean).join("\n")}</Bloque>
      )}
      {signos.length > 0 && (
        <Bloque titulo="Signos vitales y antropometría">
          <div className="flex overflow-hidden rounded-lg border border-doc-linea">
            {signos.map(([k, v, u]) => (
              <div key={k} className="flex-1 border-r border-doc-linea px-2 py-1.5 text-center last:border-r-0">
                <div className="text-[8.5px] font-semibold uppercase tracking-[.1em] text-doc-tenue">{k}</div>
                <span className="font-cifra text-[13px] font-medium">{v}</span> <span className="text-[9px] text-doc-tenue">{u}</span>
              </div>
            ))}
          </div>
        </Bloque>
      )}
      <Bloque titulo="Antecedentes">
        <div className="grid grid-cols-3 gap-x-5 gap-y-1">
          <div><div className="text-[10.5px] text-doc-tenue">Personales</div><b className="font-semibold">{ant.personales}</b></div>
          <div><div className="text-[10.5px] text-doc-tenue">Familiares</div><b className="font-semibold">{ant.familiares}</b></div>
          {habitos.length > 0 && <div><div className="text-[10.5px] text-doc-tenue">Hábitos</div><b className="font-semibold">{habitos.map((h) => `${h.nombre}: ${h.valor}`).join(" · ")}</b></div>}
        </div>
      </Bloque>
      <Bloque titulo="Examen físico y funcional">
        {alterados.length ? <>Dentro de límites normales, excepto:{"\n"}{alterados.map((x) => `• ${x.nombre}: ${x.valor}`).join("\n")}</> : "Dentro de límites normales."}
      </Bloque>
      {c.paraclinicos.length > 0 && (
        <Bloque titulo="Exámenes paraclínicos">
          <div className="grid grid-cols-2 gap-x-6">{c.paraclinicos.map((p) => <div key={p.nombre}><b className="font-semibold">{p.nombre}:</b> {p.resultado || "pendiente"}</div>)}</div>
        </Bloque>
      )}
      <Bloque titulo="Diagnósticos">
        {c.sano ? (
          "Trabajador sano de acuerdo con los protocolos de evaluación clínica ocupacional."
        ) : c.diagnosticos.length ? (
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="text-left text-[8.5px] uppercase tracking-[.1em] text-doc-tenue">
                <th className="w-20 border-b border-doc-linea px-1.5 py-1 font-bold">CIE-10</th><th className="border-b border-doc-linea px-1.5 py-1 font-bold">Diagnóstico</th><th className="border-b border-doc-linea px-1.5 py-1 font-bold">Origen</th>
              </tr>
            </thead>
            <tbody>
              {c.diagnosticos.map((x, i) => (
                <tr key={i} className="border-b border-[#edf1f0]">
                  <td className="px-1.5 py-1 font-cifra">{x.cie10}</td><td className="px-1.5 py-1">{x.descripcion}</td>
                  <td className="px-1.5 py-1"><span className="rounded-full border border-doc-linea px-2 text-[9.5px] text-doc-tenue">{ETIQUETA_ORIGEN[x.origen]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : "—"}
      </Bloque>
      {clase && (
        <Bloque titulo="Aptitud">
          <b className={COLOR_APTITUD[clase]}>{etiquetas[clase]}.</b>
          {c.aptitud.vigenteHasta && ` Vigente hasta el ${fechaCorta(c.aptitud.vigenteHasta)}.`}
          {c.aptitud.limitaciones.length > 0 && ` Restricciones: ${c.aptitud.limitaciones.join(", ")}.`}
        </Bloque>
      )}
      {c.tratamiento.some((m) => m.medicina) && (
        <Bloque titulo="Tratamiento">
          <Lista columnas={1} texto={c.tratamiento.filter((m) => m.medicina).map((m) => [m.medicina, m.concentracion, m.presentacion, m.dosis, m.via, m.frecuencia, m.duracion, m.observacion].filter(Boolean).join(" · ")).join("\n")} />
          {c.indicaciones && <p className="mt-1">{c.indicaciones}</p>}
        </Bloque>
      )}
      {c.reposo.activo && <Bloque titulo="Reposo">Del {fechaCorta(c.reposo.desde)} al {fechaCorta(c.reposo.hasta)}.</Bloque>}
      {c.interconsultas.length > 0 && <Bloque titulo="Referencias">{c.interconsultas.map((x) => `${x.especialidad}: ${x.motivo}`).join("\n")}</Bloque>}
      {c.conclusiones && <Bloque titulo="Conclusiones"><Lista texto={c.conclusiones} /></Bloque>}
      {(c.recomendacionesTrabajador || c.aptitud.observacion) && <Bloque titulo="Recomendaciones al trabajador"><Lista texto={c.recomendacionesTrabajador || c.aptitud.observacion} /></Bloque>}
      {c.recomendacionesEmpresa && <Bloque titulo="Recomendaciones a la empresa"><Lista texto={c.recomendacionesEmpresa} /></Bloque>}
      {certificacion && <p className="mt-1 border-l-[3px] border-doc-linea py-1 pl-2.5 text-[10px] text-doc-tenue"><b className="text-[#15201e]">Certificación del trabajador.</b> {certificacion}</p>}
      <Firmas>
        {certificacion ? <FirmaTrabajador d={d} /> : <span />}
        <FirmaMedico d={d} />
      </Firmas>
      <Pie d={d} />
    </Hoja>
  );
}

function MitadRecipe({ d, titulo, children }: { d: DatosDocumento; titulo: string; children: React.ReactNode }) {
  const m = d.medicoDatos;
  const vence = new Date(Date.parse(d.datos.fecha) + 30 * 864e5).toISOString().slice(0, 10);
  const img = imagenesMedico(d);
  return (
    <div className="flex flex-col rounded-lg border border-doc-linea p-4">
      <div className="mb-2 border-b border-doc-linea pb-2 text-[10.5px]">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13px] font-extrabold uppercase text-doc-acento">{d.org.nombre}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {d.org.logo && <img src={d.org.logo} alt="" className="h-8 max-w-20 object-contain" />}
        </div>
        <div className="text-doc-tenue">{d.org.direccion} · RIF {d.org.rif}</div>
        <div className="mt-1 font-semibold">{m?.nombre_completo} · C.I. {m?.cedula} · MPPS {m?.mpps}</div>
      </div>
      <div className="mb-2 text-center text-[11px] font-extrabold uppercase tracking-[.14em] text-doc-acento">{titulo}</div>
      <div className="mb-2 text-[10.5px]">
        <b>Paciente:</b> {d.trabajador.nombre} · <b>C.I.</b> {d.trabajador.cedula} · <b>Año de nac.:</b> {d.extra.fecha_nacimiento?.slice(0, 4)}
      </div>
      <div className="flex-1 whitespace-pre-line">{children}</div>
      <div className="mt-5 flex items-end justify-between text-[10.5px]">
        <div className="font-cifra text-doc-tenue">
          <div>Emisión {fechaCorta(d.datos.fecha)}</div>
          <div>Vence {fechaCorta(vence)}</div>
        </div>
        {d.org.ajustes.firma_sello_separados !== false ? (
          <div className="flex items-end gap-2">
            <div className="w-32 text-center">
              <div className="relative mb-1 h-10 border-b border-[#15201e]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img.firma && <img src={img.firma} alt="" className="absolute inset-x-0 bottom-0 mx-auto max-h-12 max-w-full object-contain" />}
              </div>
              Firma
            </div>
            <CasillaSello className="h-[68px] w-[120px]" imagen={img.sello} />
          </div>
        ) : (
          <div className="w-44 text-center"><div className="mb-1 h-10 border-b border-[#15201e]" />Firma y sello</div>
        )}
      </div>
    </div>
  );
}

export function Recipe({ d }: { d: DatosDocumento }) {
  const meds = d.datos.tratamiento.filter((x) => x.medicina);
  if (faltantesRecipe(d).length) return null;
  return (
    <Hoja media>
      <div className="grid flex-1 grid-cols-2 gap-4">
        <MitadRecipe d={d} titulo="Récipe">
          {meds.map((x, i) => `${i + 1}. ${x.medicina} ${x.concentracion} · ${x.presentacion}`).join("\n")}
        </MitadRecipe>
        <MitadRecipe d={d} titulo="Indicaciones">
          {meds.map((x, i) => `${i + 1}. ${x.medicina}: ${x.dosis} vía ${x.via.toLowerCase()} ${x.frecuencia.toLowerCase()} por ${x.duracion.toLowerCase()}${x.observacion ? `. ${x.observacion}` : ""}`).join("\n")}
          {d.datos.indicaciones && `\n\n${d.datos.indicaciones}`}
        </MitadRecipe>
      </div>
      <Pie d={d} derecha={`Folio ${folio("RC", d.datos.id)}`} />
    </Hoja>
  );
}

export function Orden({ d }: { d: DatosDocumento }) {
  const examenes = d.datos.paraclinicos;
  const grupos = new Map<string, string[]>();
  for (const p of examenes) grupos.set(p.grupo ?? "Otros", [...(grupos.get(p.grupo ?? "Otros") ?? []), p.nombre]);
  return (
    <Hoja>
      <Membrete d={d} />
      <Titulo d={d} prefijo="OE" sub={d.motivo?.nombre ?? null}>Orden de exámenes paraclínicos</Titulo>
      <DatosPaciente d={d} completo={false} />
      {examenes.length === 0 ? (
        <p>Esta consulta no tiene exámenes solicitados.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {[...grupos].map(([grupo, nombres]) => (
            <div key={grupo} className="break-inside-avoid">
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.13em] text-doc-acento after:h-px after:flex-1 after:bg-doc-linea">{grupo}</div>
              {nombres.map((n) => <div key={n} className="flex items-center gap-2 py-0.5"><span className="size-3 rounded-[2px] border border-[#15201e]" />{n}</div>)}
            </div>
          ))}
        </div>
      )}
      {d.org.ajustes.orden_nota && <p className="mt-6 border-l-[3px] border-doc-linea py-1 pl-2.5 text-[11px] text-doc-tenue">{d.org.ajustes.orden_nota}</p>}
      <Firmas>
        <span />
        <FirmaMedico d={d} etiqueta="Médico solicitante" />
      </Firmas>
      <Pie d={d} />
    </Hoja>
  );
}

export function Certificado({ d }: { d: DatosDocumento }) {
  const c = d.datos;
  const a = d.org.ajustes;
  const alterados = alteradosDe(d);
  const clase = c.aptitud.clasificacion || null;
  return (
    <Hoja>
      <Membrete d={d} />
      <Titulo d={d} prefijo="CS" sub={d.motivo?.nombre ?? null}>{a.certificado_titulo ?? "Certificado de salud"}</Titulo>
      <p className="my-3 text-[13px] leading-relaxed">
        Quien suscribe, médico del servicio de salud ocupacional, certifica que evaluó a <b>{d.trabajador.nombre}</b>, C.I. <b>{d.trabajador.cedula}</b>,
        {d.trabajador.cargo && <> {d.trabajador.cargo.toLowerCase()} de <b>{d.empresa.razon_social}</b>,</>} el día {fechaLarga(c.fecha)}
        {d.motivo?.nombre ? `, con motivo de evaluación ${d.motivo.nombre.toLowerCase()}` : ""}, encontrando:
      </p>
      <Bloque titulo="Examen funcional y físico">
        {alterados.length ? alterados.map((x) => `• ${x.nombre}: ${x.valor}`).join("\n") : "Dentro de límites normales."}
      </Bloque>
      {c.paraclinicos.length > 0 && (
        <Bloque titulo="Exámenes paraclínicos">{c.paraclinicos.map((p) => `• ${p.nombre}: ${p.resultado || "pendiente"}`).join("\n")}</Bloque>
      )}
      <Bloque titulo="Conclusión">
        {c.sano ? "Trabajador sano de acuerdo con los protocolos de evaluación clínica ocupacional." : c.conclusiones || "Ver informe médico."}
      </Bloque>
      {clase && <div className="mb-3"><Veredicto tono={TONO_APTITUD[clase]} texto={etiquetasAptitud(a.palabra_aptitud)[clase]} /></div>}
      {a.certificado_nota && <p className="mt-2 text-[11.5px]">{a.certificado_nota}</p>}
      <p className="mt-2 text-[11.5px] text-doc-tenue">Certificado que se expide a solicitud de la parte interesada.</p>
      <Firmas>
        <span />
        <FirmaMedico d={d} />
      </Firmas>
      <Pie d={d} />
    </Hoja>
  );
}
