import type { DatosDocumento } from "@/lib/documentos";
import { diasSolapados, ETIQUETA_ORIGEN, imc, resumenAntecedentes, type DatosConsulta, type Origen } from "@/lib/consultas-tipos";
import type { EmpleoAnterior } from "@/lib/historia-laboral";
import { textoLateralidad } from "@/lib/lateralidad";
import { CERTIFICACION_TRABAJADOR } from "@/lib/mensajes";
import { GRUPOS_RIESGO, type Aptitud } from "@/lib/pacientes";
import { sinCodigo } from "@/lib/diagnostico-texto";
import { Bloque, DatosPaciente, fechaCorta, Firmas, FirmaTrabajador, folio, Hoja, Membrete, Pie, Titulo } from "../componentes";
import { COLOR_APTITUD, CuerpoConsulta, etiquetasAptitud, Informe } from "../documentos";

export type ConsultaHistoria = { datos: DatosConsulta; motivo: string | null; medico: string | null };
export type FichaHistoria = {
  fechaNacimiento: string | null; grupoSanguineo: string | null; lateralidad: string | null; telefono: string | null;
  riesgos: Record<string, string[] | undefined>;
};

const TIPO: Record<DatosConsulta["tipo"], string> = { primera: "Primera", sucesiva: "Sucesiva", derivada: "Derivada" };

// Antecedentes y hábitos como texto, para no repetirlos en cada consulta si no cambiaron
const huellaAntecedentes = (c: DatosConsulta) =>
  JSON.stringify([resumenAntecedentes(c.antecedentes), c.habitos.filter((h) => h.valor.trim()).map((h) => [h.nombre, h.valor.trim()])]);

// Diagnósticos de toda la historia agrupados por CIE-10 (o por texto si no tiene código)
function agruparDiagnosticos(consultas: ConsultaHistoria[]) {
  const grupos = new Map<string, { cie10: string; descripcion: string; origenes: Set<Origen>; primera: string; ultima: string; veces: number }>();
  for (const { datos: c } of consultas) {
    const vistos = new Set<string>();
    for (const dx of c.diagnosticos) {
      const clave = sinCodigo(dx.cie10) ? `t:${dx.descripcion.trim().toLowerCase()}` : `c:${dx.cie10.trim().toUpperCase()}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const g = grupos.get(clave);
      if (g) {
        g.veces++;
        g.origenes.add(dx.origen);
        g.ultima = c.fecha;
        g.descripcion = dx.descripcion || g.descripcion; // la redacción más reciente
      } else grupos.set(clave, { cie10: sinCodigo(dx.cie10) ? "" : dx.cie10.trim(), descripcion: dx.descripcion, origenes: new Set([dx.origen]), primera: c.fecha, ultima: c.fecha, veces: 1 });
    }
  }
  return [...grupos.values()].sort((a, b) => b.veces - a.veces || b.ultima.localeCompare(a.ultima));
}

const Th = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => (
  <th className={`border-b border-doc-linea px-1.5 py-1 text-left font-bold ${className}`}>{children}</th>
);
const Td = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => <td className={`px-1.5 py-1 align-top ${className}`}>{children}</td>;
const Tabla = ({ cabecera, children }: { cabecera: React.ReactNode; children: React.ReactNode }) => (
  <table className="w-full border-collapse text-[11px]">
    <thead><tr className="text-[8.5px] uppercase tracking-[.1em] text-doc-tenue">{cabecera}</tr></thead>
    <tbody className="[&>tr]:break-inside-avoid [&>tr]:border-b [&>tr]:border-[#edf1f0]">{children}</tbody>
  </table>
);

// Historia clínica ocupacional: primero el resumen (evolución de la elegibilidad, diagnósticos, condiciones de salud)
// y después cada consulta completa, de la más antigua a la más reciente, seguidas sin saltar de hoja. Con una sola consulta es el informe.
// d: documento de la consulta más reciente (membrete, datos del trabajador, folio). consultas: en orden cronológico.
export function HistoriaClinica({ d, consultas, ficha, empleos, emite, total }: {
  d: DatosDocumento; consultas: ConsultaHistoria[]; ficha: FichaHistoria; empleos: EmpleoAnterior[]; emite: string; total: number;
}) {
  if (consultas.length === 1) return <Informe d={d} />;

  const ajustes = d.org.ajustes;
  const etiquetas = etiquetasAptitud(ajustes.palabra_aptitud);
  const corta = (a: Aptitud) => etiquetas[a].replace(" para el cargo propuesto", "");
  const palabra = ajustes.palabra_aptitud ?? "Elegible";
  const certificacion = ajustes.certificacion_trabajador ?? CERTIFICACION_TRABAJADOR;
  const riesgos = d.sin.includes("riesgos") ? [] : GRUPOS_RIESGO.filter(([k]) => (ficha.riesgos[k] ?? []).length);
  const primera = consultas[0].datos.fecha;
  const ultima = consultas.at(-1)!.datos;

  // Resumen
  const evaluadas = consultas.filter((x) => x.datos.aptitud.clasificacion);
  const vigente = evaluadas.at(-1)?.datos.aptitud;
  const diagnosticos = agruparDiagnosticos(consultas);
  const reposos = consultas.filter((x) => x.datos.reposo.activo && x.datos.reposo.desde && x.datos.reposo.hasta).map((x) => x.datos.reposo);
  const diasReposo = reposos.reduce((n, r) => n + diasSolapados(r, r), 0);
  const referencias = [...new Set(consultas.flatMap((x) => x.datos.interconsultas.map((i) => i.especialidad.trim()).filter(Boolean)))];
  const discapacidad = consultas.filter((x) => x.datos.potencialDiscapacidad);
  const conSignos = consultas.filter(({ datos: { signos: s } }) => s.ta || s.fc || s.peso);
  const antUltimos = resumenAntecedentes(ultima.antecedentes);
  const habitos = ultima.habitos.filter((h) => h.valor.trim());

  return (
    <Hoja className="print:block">
      <Membrete d={d} />
      <Titulo d={d} prefijo="HC" sub={`${consultas.length} consultas · ${fechaCorta(primera)} al ${fechaCorta(ultima.fecha)}${total > consultas.length ? ` · las ${consultas.length} más recientes de ${total}` : ""}`}>
        Historia clínica ocupacional
      </Titulo>
      <DatosPaciente d={d} />
      <Bloque titulo="Datos personales">
        <div className="grid grid-cols-4 gap-x-5 gap-y-1">
          <div><span className="text-doc-tenue">Nacimiento:</span> {fechaCorta(ficha.fechaNacimiento)}</div>
          <div><span className="text-doc-tenue">Grupo sanguíneo:</span> {ficha.grupoSanguineo ?? "—"}</div>
          <div><span className="text-doc-tenue">Lateralidad:</span> {textoLateralidad(ficha.lateralidad) ?? "—"}</div>
          <div><span className="text-doc-tenue">Teléfono:</span> {ficha.telefono ?? "—"}</div>
        </div>
      </Bloque>
      {riesgos.length > 0 && (
        <Bloque titulo="Riesgos del puesto actual">
          <div className="grid grid-cols-2 gap-x-6">{riesgos.map(([k, n]) => <div key={k}><b>{n}:</b> {ficha.riesgos[k]!.join(", ")}</div>)}</div>
        </Bloque>
      )}
      {empleos.length > 0 && (
        <Bloque titulo="Historia laboral">
          {empleos.map((e) => (
            <div key={e.id} className="mb-1">
              <b>{e.empresa}</b>{[e.cargo, e.duracion].filter(Boolean).map((x) => ` · ${x}`).join("")}
              {(e.accidentes || e.enfermedades) && <span className="text-doc-tenue"> · {[e.accidentes && `Accidentes: ${e.accidentes}`, e.enfermedades && `Enfermedades: ${e.enfermedades}`].filter(Boolean).join(" · ")}</span>}
            </div>
          ))}
        </Bloque>
      )}

      <section className="mt-2">
        <div className="mb-3 rounded-lg border-l-4 border-doc-acento bg-doc-suave px-3 py-2">
          <div className="text-[9px] font-extrabold uppercase tracking-[.14em] text-doc-acento">Resumen de la historia</div>
          <div className="text-[14px] font-extrabold leading-tight">{d.trabajador.nombre}</div>
          <div className="text-[10.5px] text-doc-tenue">{consultas.length} consultas del {fechaCorta(primera)} al {fechaCorta(ultima.fecha)}</div>
        </div>

        <Bloque titulo={`Evolución de la ${palabra === "Elegible" ? "elegibilidad" : "aptitud"}`}>
          {evaluadas.length ? (
            <Tabla cabecera={<><Th className="w-[70px]">Fecha</Th><Th>Motivo</Th><Th>{palabra === "Elegible" ? "Elegibilidad" : "Aptitud"}</Th><Th>Restricciones</Th><Th className="w-[70px]">Vigente hasta</Th></>}>
              {evaluadas.map(({ datos: c, motivo }) => {
                const k = c.aptitud.clasificacion as Aptitud;
                return (
                  <tr key={c.id}>
                    <Td className="font-cifra">{fechaCorta(c.fecha)}</Td>
                    <Td>{motivo ?? "Consulta"}</Td>
                    <Td><b className={COLOR_APTITUD[k]}>{corta(k)}</b></Td>
                    <Td>{d.sin.includes("limitaciones") ? "—" : c.aptitud.limitaciones.join("; ") || "—"}</Td>
                    <Td className="font-cifra">{c.aptitud.vigenteHasta ? fechaCorta(c.aptitud.vigenteHasta) : "—"}</Td>
                  </tr>
                );
              })}
            </Tabla>
          ) : "Ninguna consulta registró aptitud."}
        </Bloque>

        <Bloque titulo="Diagnósticos a lo largo de la historia">
          {diagnosticos.length ? (
            <Tabla cabecera={<><Th className="w-16">CIE-10</Th><Th>Diagnóstico</Th><Th>Origen</Th><Th className="w-[70px]">Primera vez</Th><Th className="w-[70px]">Última vez</Th><Th className="w-12 text-center">Veces</Th></>}>
              {diagnosticos.map((g) => (
                <tr key={g.cie10 + g.descripcion}>
                  <Td className="font-cifra">{g.cie10 || "sin CIE-10"}</Td>
                  <Td>{g.descripcion}</Td>
                  <Td className="text-doc-tenue">{[...g.origenes].map((o) => ETIQUETA_ORIGEN[o]).join(", ")}</Td>
                  <Td className="font-cifra">{fechaCorta(g.primera)}</Td>
                  <Td className="font-cifra">{fechaCorta(g.ultima)}</Td>
                  <Td className="text-center font-cifra">{g.veces}</Td>
                </tr>
              ))}
            </Tabla>
          ) : "Sin diagnósticos registrados: trabajador sano en todas sus evaluaciones."}
        </Bloque>

        <Bloque titulo="Condiciones de salud">
          <dl className="space-y-1 text-[11px] [&>div]:flex [&>div]:gap-3 [&_dt]:w-40 [&_dt]:shrink-0 [&_dt]:font-semibold [&_dt]:text-doc-tenue">
            <div><dt>Antecedentes personales</dt><dd>{antUltimos.personales}</dd></div>
            <div><dt>Antecedentes familiares</dt><dd>{antUltimos.familiares}</dd></div>
            {habitos.length > 0 && <div><dt>Hábitos</dt><dd>{habitos.map((h) => `${h.nombre}: ${h.valor}`).join(" · ")}</dd></div>}
            {vigente?.clasificacion && (
              <div><dt>{palabra === "Elegible" ? "Elegibilidad" : "Aptitud"} actual</dt><dd><b className={COLOR_APTITUD[vigente.clasificacion]}>{corta(vigente.clasificacion)}</b>{vigente.vigenteHasta && ` · vigente hasta el ${fechaCorta(vigente.vigenteHasta)}`}{vigente.limitaciones.length > 0 && !d.sin.includes("limitaciones") && ` · Restricciones: ${vigente.limitaciones.join("; ")}`}</dd></div>
            )}
            <div><dt>Reposos</dt><dd>{reposos.length ? `${reposos.length} (${diasReposo} días en total): ${reposos.map((r) => `${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}`).join("; ")}` : "Ninguno"}</dd></div>
            {referencias.length > 0 && <div><dt>Referido a</dt><dd>{referencias.join(", ")}</dd></div>}
            {discapacidad.length > 0 && <div><dt>Potencial discapacidad</dt><dd>{discapacidad.map((x) => [fechaCorta(x.datos.fecha), x.datos.discapacidadNota].filter(Boolean).join(": ")).join("; ")}</dd></div>}
          </dl>
        </Bloque>

        {conSignos.length > 1 && (
          <Bloque titulo="Evolución de signos y peso">
            <Tabla cabecera={<><Th className="w-[70px]">Fecha</Th><Th>TA (mmHg)</Th><Th>FC (lpm)</Th><Th>Peso (kg)</Th><Th>IMC</Th></>}>
              {conSignos.map(({ datos: c }) => {
                const v = imc(c.signos.peso, c.signos.talla);
                return (
                  <tr key={c.id} className="font-cifra">
                    <Td>{fechaCorta(c.fecha)}</Td><Td>{c.signos.ta || "—"}</Td><Td>{c.signos.fc || "—"}</Td><Td>{c.signos.peso || "—"}</Td><Td>{v !== null ? String(v).replace(".", ",") : "—"}</Td>
                  </tr>
                );
              })}
            </Tabla>
          </Bloque>
        )}
      </section>

      {consultas.map((x, i) => {
        const c = x.datos;
        const clase = c.aptitud.clasificacion || null;
        return (
          <section key={c.id} className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-4 rounded-lg border-l-4 border-doc-acento bg-doc-suave px-3 py-2 break-inside-avoid break-after-avoid">
              <div>
                <div className="text-[9px] font-extrabold uppercase tracking-[.14em] text-doc-acento">Consulta {i + 1} de {consultas.length}</div>
                <div className="text-[14px] font-extrabold leading-tight">{x.motivo ?? "Consulta"} <span className="text-[11px] font-semibold text-doc-tenue">· {TIPO[c.tipo]}</span></div>
                {clase && <div className={`text-[10.5px] font-bold ${COLOR_APTITUD[clase]}`}>{corta(clase)}</div>}
              </div>
              <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
                <div>Fecha <b className="font-medium text-[#15201e]">{fechaCorta(c.fecha)}</b></div>
                <div>Folio <b className="font-medium text-[#15201e]">{folio("CM", c.id)}</b></div>
                {x.medico && <div className="font-doc">{x.medico}</div>}
              </div>
            </div>
            <CuerpoConsulta c={c} sin={d.sin} ajustes={ajustes} antecedentes={i === 0 || huellaAntecedentes(c) !== huellaAntecedentes(consultas[i - 1].datos)} />
          </section>
        );
      })}

      {certificacion && <p className="mt-1 border-l-[3px] border-doc-linea py-1 pl-2.5 text-[10px] text-doc-tenue"><b className="text-[#15201e]">Certificación del trabajador.</b> {certificacion}</p>}
      <Firmas>
        {certificacion ? <FirmaTrabajador d={d} /> : <span />}
        {/* Firma a mano de quien emite la copia: no se estampa la firma escaneada de otro médico */}
        <div className="w-60 text-center text-[10.5px]">
          <div className="mb-1 h-14 border-b border-[#15201e]" />
          <div className="text-[11.5px] font-bold">{emite}</div>
          <div className="text-doc-tenue">Emite la copia · Firma y sello</div>
        </div>
      </Firmas>
      <Pie d={d} />
    </Hoja>
  );
}
