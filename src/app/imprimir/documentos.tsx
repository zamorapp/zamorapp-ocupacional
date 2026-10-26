import type { DatosDocumento } from "@/lib/documentos";
import { faltantesRecipe } from "@/lib/documentos";
import { ETIQUETA_ORIGEN, resumenAntecedentes } from "@/lib/consultas-tipos";
import { GRUPOS_RIESGO, type Aptitud } from "@/lib/pacientes";
import { Bloque, Datos, DatosPaciente, fechaCorta, fechaLarga, FirmaMedico, FirmaTrabajador, Hoja, Membrete, Titulo } from "./componentes";

// "Elegible" / "Apto" / "Recomendable" según Configuración › Organización
function etiquetasAptitud(palabra = "Elegible"): Record<Aptitud, string> {
  const neg = palabra === "Elegible" ? "No elegible" : `No ${palabra.toLowerCase()}`;
  return {
    elegible: `${palabra} para el cargo`,
    elegible_con_restricciones: `${palabra} con restricciones`,
    no_elegible: neg,
    espera_resultados: "Espera resultados de exámenes",
    diferido: "Diferido",
  };
}

const Casilla = ({ marcada, texto }: { marcada: boolean; texto: string }) => (
  <div className="flex items-center gap-2">
    <span className={`grid size-4 place-items-center border border-neutral-800 text-[11px] font-bold ${marcada ? "bg-neutral-900 text-white" : ""}`}>{marcada ? "X" : ""}</span>
    <span className={marcada ? "font-semibold" : ""}>{texto}</span>
  </div>
);

export function Constancia({ d }: { d: DatosDocumento }) {
  const a = d.org.ajustes;
  const etiquetas = etiquetasAptitud(a.palabra_aptitud);
  const apt = d.datos.aptitud;
  return (
    <Hoja>
      <Membrete d={d} />
      <Titulo sub={d.motivo?.nombre ?? null}>{a.titulo_constancia || "Constancia de Aptitud"}</Titulo>
      <DatosPaciente d={d} />
      <Bloque titulo="Riesgos del puesto">
        <div className="grid grid-cols-2 gap-x-6">
          {GRUPOS_RIESGO.map(([k, n]) => (
            <div key={k}><b>{n}:</b> {(d.trabajador.riesgos[k] ?? []).join(", ") || "No identificados"}</div>
          ))}
        </div>
      </Bloque>
      <Bloque titulo="Clasificación">
        <div className="grid grid-cols-2 gap-1.5 py-1">
          {(Object.keys(etiquetas) as Aptitud[]).map((k) => <Casilla key={k} marcada={apt.clasificacion === k} texto={etiquetas[k]} />)}
        </div>
      </Bloque>
      {apt.limitaciones.length > 0 && <Bloque titulo="Restricciones">{apt.limitaciones.join(" · ")}</Bloque>}
      {apt.observacion && <Bloque titulo="Observaciones y recomendaciones">{apt.observacion}</Bloque>}
      {apt.vigenteHasta && <p className="mb-3">Vigencia de la evaluación hasta el <b>{fechaCorta(apt.vigenteHasta)}</b>.</p>}
      <p className="mb-8">Se expide en la fecha {fechaLarga(d.datos.fecha)}.</p>
      <div className="flex justify-around">
        {a.firma_medico_ocupacional !== false && <FirmaMedico d={d} etiqueta="Médico ocupacional" />}
        {a.firma_paciente_constancia && <FirmaTrabajador d={d} />}
      </div>
      {a.observacion_idoneidad && <p className="mt-8 border-t pt-2 text-[10.5px] italic text-neutral-600">{a.observacion_idoneidad}</p>}
    </Hoja>
  );
}

function CuerpoReposo({ d, pie }: { d: DatosDocumento; pie?: string | null }) {
  const r = d.datos.reposo;
  const dias = Math.round((Date.parse(r.hasta) - Date.parse(r.desde)) / 864e5) + 1;
  const reintegro = new Date(Date.parse(r.hasta) + 864e5).toISOString().slice(0, 10);
  const diag = d.datos.diagnosticos[0];
  return (
    <div className="flex min-h-[125mm] flex-col">
      <Membrete d={d} />
      <Titulo>Reposo médico</Titulo>
      <DatosPaciente d={d} />
      <Datos
        columnas={3}
        filas={[
          ["Desde", fechaCorta(r.desde)],
          ["Hasta", fechaCorta(r.hasta)],
          ["Días", String(dias)],
          ["Reintegro", fechaCorta(reintegro)],
          ["Causa", r.causa.replace(/_/g, " ")],
          ["Emitido por", r.ente.replace(/_/g, " ")],
        ]}
      />
      {diag && <Bloque titulo="Diagnóstico">{diag.cie10} {diag.descripcion}</Bloque>}
      <div className="mt-auto flex items-end justify-between pt-6">
        <span className="text-[11px] text-neutral-500">Fecha de emisión: {fechaCorta(d.datos.fecha)}</span>
        <FirmaMedico d={d} />
      </div>
      {pie && <div className="mt-3 text-center text-[11px] font-bold uppercase tracking-wider">{pie}</div>}
    </div>
  );
}

export function Reposo({ d }: { d: DatosDocumento }) {
  if (!d.datos.reposo.activo) return <Hoja><p>Esta consulta no tiene reposo indicado.</p></Hoja>;
  const a = d.org.ajustes;
  return (
    <Hoja>
      <CuerpoReposo d={d} pie={a.reposo_pie_original ?? "ORIGINAL RECURSOS HUMANOS"} />
      <div className="my-6 border-t-2 border-dashed border-neutral-400 print:break-before-page print:border-0" />
      <CuerpoReposo d={d} pie={a.reposo_pie_copia ?? "COPIA SERVICIO MÉDICO"} />
    </Hoja>
  );
}

export function Informe({ d }: { d: DatosDocumento }) {
  const c = d.datos;
  const sv = c.signos;
  const alterados = [...c.examenFuncional, ...c.examenFisico].filter((x) => x.valor.trim() !== x.normal.trim());
  return (
    <Hoja>
      <Membrete d={d} />
      <Titulo sub={`${d.motivo?.nombre ?? ""} · ${fechaLarga(c.fecha)}`}>Informe médico</Titulo>
      <DatosPaciente d={d} />
      {(c.motivoTexto || c.enfermedadActual) && (
        <Bloque titulo="Motivo y enfermedad actual">{[c.motivoTexto, c.enfermedadActual].filter(Boolean).join("\n")}</Bloque>
      )}
      <Bloque titulo="Antecedentes">
        {`Personales: ${resumenAntecedentes(c.antecedentes).personales}
Familiares: ${resumenAntecedentes(c.antecedentes).familiares}`}
      </Bloque>
      {Object.values(sv).some(Boolean) && (
        <Bloque titulo="Signos vitales">
          {[sv.ta && `TA ${sv.ta} mmHg`, sv.fc && `FC ${sv.fc} lpm`, sv.fr && `FR ${sv.fr} rpm`, sv.temp && `T ${sv.temp} °C`, sv.sat && `SatO₂ ${sv.sat} %`, sv.peso && `Peso ${sv.peso} kg`, sv.talla && `Talla ${sv.talla} cm`].filter(Boolean).join(" · ")}
        </Bloque>
      )}
      <Bloque titulo="Examen físico y funcional">
        {alterados.length ? alterados.map((x) => `${x.nombre}: ${x.valor}`).join("\n") : "Dentro de límites normales."}
      </Bloque>
      {c.paraclinicos.length > 0 && (
        <Bloque titulo="Exámenes paraclínicos">{c.paraclinicos.map((p) => `${p.nombre}: ${p.resultado || "pendiente"}`).join("\n")}</Bloque>
      )}
      <Bloque titulo="Diagnóstico">
        {c.sano
          ? "Trabajador sano de acuerdo con los protocolos de evaluación clínica ocupacional."
          : c.diagnosticos.map((x) => `${x.cie10} ${x.descripcion} (${ETIQUETA_ORIGEN[x.origen]})`).join("\n") || "—"}
      </Bloque>
      {c.tratamiento.length > 0 && (
        <Bloque titulo="Tratamiento">
          {c.tratamiento.map((m) => [m.medicina, m.concentracion, m.presentacion, m.dosis, m.via, m.frecuencia, m.duracion, m.observacion].filter(Boolean).join(" · ")).join("\n")}
          {c.indicaciones && `\n${c.indicaciones}`}
        </Bloque>
      )}
      {c.reposo.activo && <Bloque titulo="Reposo">Del {fechaCorta(c.reposo.desde)} al {fechaCorta(c.reposo.hasta)}.</Bloque>}
      {c.conclusiones && <Bloque titulo="Conclusiones">{c.conclusiones}</Bloque>}
      {c.recomendacionesTrabajador && <Bloque titulo="Recomendaciones">{c.recomendacionesTrabajador}</Bloque>}
      <div className="mt-10 flex justify-end"><FirmaMedico d={d} /></div>
    </Hoja>
  );
}

function MitadRecipe({ d, titulo, children }: { d: DatosDocumento; titulo: string; children: React.ReactNode }) {
  const m = d.medicoDatos;
  const vence = new Date(Date.parse(d.datos.fecha) + 30 * 864e5).toISOString().slice(0, 10);
  return (
    <div className="flex flex-col border border-neutral-400 p-4">
      <div className="mb-2 border-b pb-2 text-[11px]">
        <div className="text-sm font-bold uppercase text-teal-800">{d.org.nombre}</div>
        <div>{d.org.direccion} · RIF {d.org.rif}</div>
        <div className="mt-1 font-semibold">{m?.nombre_completo} · C.I. {m?.cedula} · MPPS {m?.mpps}</div>
      </div>
      <div className="mb-2 text-center text-xs font-bold uppercase tracking-wider">{titulo}</div>
      <div className="mb-2 text-[11px]">
        <b>Paciente:</b> {d.trabajador.nombre} · <b>C.I.</b> {d.trabajador.cedula} · <b>Año de nac.:</b> {d.extra.fecha_nacimiento?.slice(0, 4)}
      </div>
      <div className="flex-1 whitespace-pre-line">{children}</div>
      <div className="mt-6 flex items-end justify-between text-[11px]">
        <div>
          <div>Emisión: {fechaCorta(d.datos.fecha)}</div>
          <div>Vence: {fechaCorta(vence)}</div>
        </div>
        <div className="w-44 text-center"><div className="mb-1 h-10 border-b border-neutral-800" />Firma y sello</div>
      </div>
    </div>
  );
}

export function Recipe({ d }: { d: DatosDocumento }) {
  const meds = d.datos.tratamiento.filter((x) => x.medicina);
  if (faltantesRecipe(d).length) return null;
  return (
    <Hoja>
      <div className="grid min-h-[120mm] grid-cols-2 gap-4">
        <MitadRecipe d={d} titulo="Récipe">
          {meds.map((x, i) => `${i + 1}. ${x.medicina} ${x.concentracion} · ${x.presentacion}`).join("\n")}
        </MitadRecipe>
        <MitadRecipe d={d} titulo="Indicaciones">
          {meds.map((x, i) => `${i + 1}. ${x.medicina}: ${x.dosis} vía ${x.via.toLowerCase()} ${x.frecuencia.toLowerCase()} por ${x.duracion.toLowerCase()}${x.observacion ? `. ${x.observacion}` : ""}`).join("\n")}
          {d.datos.indicaciones && `\n\n${d.datos.indicaciones}`}
        </MitadRecipe>
      </div>
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
      <Titulo sub={`${d.motivo?.nombre ?? ""} · ${fechaLarga(d.datos.fecha)}`}>Orden de exámenes paraclínicos</Titulo>
      <DatosPaciente d={d} />
      {examenes.length === 0 ? (
        <p>Esta consulta no tiene exámenes solicitados.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
          {[...grupos].map(([grupo, nombres]) => (
            <div key={grupo}>
              <div className="mb-1 border-b border-neutral-400 text-xs font-bold uppercase tracking-wide">{grupo}</div>
              {nombres.map((n) => <div key={n} className="flex items-center gap-2 py-0.5"><span className="size-3 border border-neutral-800" />{n}</div>)}
            </div>
          ))}
        </div>
      )}
      {d.org.ajustes.orden_nota && <p className="mt-6 text-sm">{d.org.ajustes.orden_nota}</p>}
      <div className="mt-12 flex justify-end"><FirmaMedico d={d} etiqueta="Médico solicitante" /></div>
    </Hoja>
  );
}

export function Certificado({ d }: { d: DatosDocumento }) {
  const c = d.datos;
  const a = d.org.ajustes;
  const alterados = [...c.examenFuncional, ...c.examenFisico].filter((x) => x.valor.trim() && x.valor.trim() !== x.normal.trim());
  const apt = c.aptitud.clasificacion ? etiquetasAptitud(a.palabra_aptitud)[c.aptitud.clasificacion as Aptitud] : null;
  return (
    <Hoja>
      <Membrete d={d} />
      <Titulo sub={fechaLarga(c.fecha)}>{a.certificado_titulo ?? "Certificado de salud"}</Titulo>
      <p className="my-4 leading-relaxed">
        Quien suscribe, médico del servicio de salud ocupacional, certifica que evaluó a <b>{d.trabajador.nombre}</b>, C.I. <b>{d.trabajador.cedula}</b>,
        el día {fechaLarga(c.fecha)}{d.motivo?.nombre ? `, con motivo de evaluación ${d.motivo.nombre.toLowerCase()}` : ""}, encontrando:
      </p>
      <Bloque titulo="Examen funcional y físico">
        {alterados.length ? alterados.map((x) => `${x.nombre}: ${x.valor}`).join("\n") : "Dentro de límites normales."}
      </Bloque>
      {c.paraclinicos.length > 0 && (
        <Bloque titulo="Exámenes paraclínicos">{c.paraclinicos.map((p) => `${p.nombre}: ${p.resultado || "pendiente"}`).join("\n")}</Bloque>
      )}
      <Bloque titulo="Conclusión">
        {c.sano ? "Trabajador sano de acuerdo con los protocolos de evaluación clínica ocupacional." : c.conclusiones || "Ver informe médico."}
        {apt && `\n${apt}.`}
      </Bloque>
      {a.certificado_nota && <p className="mt-4 text-sm">{a.certificado_nota}</p>}
      <p className="mt-4 text-sm">Certificado que se expide a solicitud de la parte interesada.</p>
      <div className="mt-12 flex justify-end"><FirmaMedico d={d} /></div>
    </Hoja>
  );
}
