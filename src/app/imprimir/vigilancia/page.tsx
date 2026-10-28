import type { Metadata } from "next";
import { ETIQUETA_ORIGEN, type Origen } from "@/lib/consultas-tipos";
import { datosLegalesFaltantes } from "@/lib/empresas";
import { fechaCorta as corta, parametrosPeriodo, type ConsultaPeriodo } from "@/lib/periodos";
import { indicesCovenin, tasasEnfermedadOcupacional, type Causa, type Persona } from "@/lib/reportes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cargarVigilancia } from "@/lib/vigilancia";
import { CORTES, ETIQUETA_CLAVE } from "@/lib/vigilancia-textos";
import { BarraImpresion } from "../barra";
import { fechaCorta, Hoja } from "../componentes";

export const metadata: Metadata = { title: "Informe de vigilancia epidemiológica" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<ConsultaPeriodo & { empresa?: string }> };
type Celda = string | number;

const num = (n: number | null | undefined, dec = 2) => (n === null || n === undefined ? "—" : n.toLocaleString("es-VE", { maximumFractionDigits: dec }));
const porc = (n: number, total: number) => (total ? num(Math.round((n * 1000) / total) / 10, 1) : "0");

// Cuadro con total y porcentaje sobre la última columna numérica
function Tabla({ columnas, filas, porcentaje = true, total = true, vacio = "Sin registros en el período." }: {
  columnas: string[]; filas: Celda[][]; porcentaje?: boolean; total?: boolean; vacio?: string;
}) {
  if (!filas.length) return <p className="text-neutral-500">{vacio}</p>;
  const suma = filas.reduce((s, f) => s + (typeof f[f.length - 1] === "number" ? (f[f.length - 1] as number) : 0), 0);
  const th = "border border-neutral-300 px-2 py-1 font-semibold";
  const td = "border border-neutral-300 px-2 py-0.5";
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="bg-teal-50 text-left">
          {columnas.map((c, i) => <th key={c} className={`${th} ${i > 0 && i === columnas.length - 1 ? "text-right" : ""}`}>{c}</th>)}
          {porcentaje && <th className={`${th} w-14 text-right`}>%</th>}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            {f.map((v, j) => <td key={j} className={`${td} ${typeof v === "number" ? "text-right tabular-nums" : ""}`}>{typeof v === "number" ? num(v) : v}</td>)}
            {porcentaje && <td className={`${td} text-right tabular-nums`}>{porc(f[f.length - 1] as number, suma)}</td>}
          </tr>
        ))}
        {total && filas.length > 1 && (
          <tr className="bg-neutral-50 font-semibold">
            <td className={td} colSpan={columnas.length - 1}>Total</td>
            <td className={`${td} text-right tabular-nums`}>{num(suma)}</td>
            {porcentaje && <td className={`${td} text-right`}>100</td>}
          </tr>
        )}
      </tbody>
    </table>
  );
}

// Cuadro de índices con su fórmula, como pide el formato del INPSASEL
function Indices({ filas }: { filas: [string, string, string][] }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead><tr className="bg-teal-50 text-left"><th className="border border-neutral-300 px-2 py-1">Índice</th><th className="w-20 border border-neutral-300 px-2 py-1 text-right">Valor</th><th className="border border-neutral-300 px-2 py-1">Definición</th></tr></thead>
      <tbody>
        {filas.map(([n, v, d]) => (
          <tr key={n}><td className="border border-neutral-300 px-2 py-0.5 font-semibold">{n}</td><td className="border border-neutral-300 px-2 py-0.5 text-right tabular-nums">{v}</td><td className="border border-neutral-300 px-2 py-0.5 text-neutral-600">{d}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Seccion({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="mb-1.5 flex items-baseline gap-2 border-b-2 border-teal-700 pb-0.5 text-[13px] font-bold uppercase tracking-wide text-teal-800">
        <span className="rounded bg-teal-700 px-1.5 text-white">{n}</span> {titulo}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Sub({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <div className="mb-0.5 text-[11.5px] font-semibold text-neutral-800">{titulo}</div>
      {children}
      {nota && <div className="mt-0.5 text-[10px] italic text-neutral-500">{nota}</div>}
    </div>
  );
}

const Texto = ({ children }: { children: string }) => <div className="whitespace-pre-line text-[12px] leading-relaxed">{children}</div>;
const causasFilas = (c: Causa[], pob: number): Celda[][] => c.map((x) => [`${x.cie10} ${x.descripcion}`, porc(x.pacientes ?? 0, pob), x.n]);

export default async function Vigilancia({ searchParams }: Props) {
  const q = await searchParams;
  const sesion = await obtenerSesion();
  const empresaId = q.empresa || null;
  const [v, org] = await Promise.all([
    cargarVigilancia(sesion, empresaId, q),
    (async () => {
      if (!sesion.orgId) return null;
      const s = await crearClienteServidor();
      return (await s.from("organizaciones").select("nombre, rif, direccion, telefono").eq("id", sesion.orgId).single()).data;
    })(),
  ]);
  const { r, acc, periodo, empresa, causas, entes, aptitudes, ausentismo } = v;
  if (!r) return <p className="p-10">No hay datos.</p>;

  const t = { ...v.sugeridos!, ...Object.fromEntries(Object.entries(v.informe ?? {}).filter(([k, x]) => typeof x === "string" && x && k !== "id" && k !== "actualizado_en")) };
  const firmantes = { ...v.firmantesBase, ...v.informe?.firmantes };
  const faltan = empresa ? datosLegalesFaltantes(empresa) : [];
  const pob = r.poblacion.total;
  const ix = acc ? indicesCovenin(acc) : null;
  const eo = acc ? tasasEnfermedadOcupacional(r, acc.hht) : { taeo: null, tieo: null };
  const cortes = r.morbilidad.cortes ?? {};
  const volver = `/reportes?${new URLSearchParams(parametrosPeriodo(periodo))}`;

  const art34: [string, number][] = [
    ["Accidentes comunes", r.morbilidad.por_origen.accidente_comun ?? 0],
    ["Accidentes laborales", acc?.accidentes ?? r.morbilidad.por_origen.accidente_laboral ?? 0],
    ["Enfermedades comunes", r.morbilidad.por_origen.comun ?? 0],
    ["Enfermedades ocupacionales", (r.morbilidad.por_origen.ocupacional ?? 0)],
    ["Referencias a especialidades", r.referencias?.total ?? 0],
    ...(["enfermedad_comun", "accidente_comun", "accidente_laboral", "enfermedad_ocupacional"] as const).map(
      (c) => [`Reposos por ${(causas[c] ?? c.replace("_", " ")).toLowerCase()}`, r.ausentismo.por_causa.find((x) => x.nombre === c)?.n ?? 0] as [string, number],
    ),
  ];

  const filaFirma = (rol: string, p: Persona | undefined, k: string) => (
    <tr key={k}>
      <td className="border border-neutral-300 px-2 py-3 text-[10px] uppercase text-neutral-500">{rol}</td>
      <td className="border border-neutral-300 px-2 py-3">{p?.nombre}</td>
      <td className="border border-neutral-300 px-2 py-3">{p?.cedula}</td>
      <td className="w-40 border border-neutral-300 px-2 py-3" />
    </tr>
  );

  return (
    <div className="min-h-dvh bg-neutral-100 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:bg-white">
      <BarraImpresion volver={volver} titulo={`Vigilancia epidemiológica · ${empresa?.razonSocial ?? "Todas las empresas"} · ${periodo.etiqueta}`} />
      <Hoja>
        <header className="mb-4 flex items-start justify-between border-b-2 border-teal-700 pb-3">
          <div>
            <div className="text-lg font-bold uppercase text-teal-800">{org?.nombre}</div>
            <div className="text-[11px] text-neutral-600">{[org?.rif && `RIF ${org.rif}`, org?.direccion, org?.telefono].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="text-right text-[11px] text-neutral-600">Reglamento Parcial de la LOPCYMAT, art. 34</div>
        </header>

        <div className="mb-4 rounded-lg bg-teal-700 px-4 py-3 text-center text-white">
          <h1 className="text-base font-bold uppercase tracking-wider">Informe trimestral de vigilancia epidemiológica</h1>
          <div className="text-[12px] font-semibold">Del {corta(periodo.desde)} al {corta(periodo.hasta)}</div>
          <div className="text-[11px] uppercase opacity-90">{periodo.etiqueta}</div>
        </div>

        <Seccion n="1" titulo="Identificación de la empresa">
          {empresa ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 rounded border border-neutral-300 p-3 text-[11.5px]">
              <div><b>Razón social:</b> {empresa.razonSocial}</div>
              <div><b>RIF:</b> {empresa.rif}</div>
              <div><b>NIL:</b> {empresa.nil ?? <span className="font-semibold text-red-600">Falta</span>}</div>
              <div><b>Sector económico:</b> {empresa.sector ?? "—"}</div>
              <div className="col-span-2"><b>Actividad económica:</b> {empresa.actividad ?? <span className="font-semibold text-red-600">Falta</span>}</div>
              <div><b>Municipio:</b> {empresa.municipio ?? "—"}</div>
              <div><b>Parroquia:</b> {empresa.parroquia ?? "—"}</div>
              <div><b>Teléfono:</b> {empresa.telefono ?? "—"}</div>
              <div><b>Servicio de SST:</b> {empresa.servicioSst ?? "—"}</div>
              <div><b>Registro Servicio SST:</b> {empresa.servicioSstRegistro ? fechaCorta(empresa.servicioSstRegistro) : <span className="font-semibold text-red-600">Falta</span>}</div>
              <div><b>Registro PSST:</b> {empresa.psstRegistro ? fechaCorta(empresa.psstRegistro) : <span className="font-semibold text-red-600">Falta</span>}</div>
              <div className="col-span-2"><b>Trabajadores efectivos:</b> {pob} ({r.poblacion.femenino} F · {r.poblacion.masculino} M)</div>
            </div>
          ) : (
            <div>Consolidado de todas las empresas clientes · {pob} trabajadores efectivos.</div>
          )}
          {faltan.length > 0 && <p className="font-semibold text-red-600 print:text-red-700">Datos legales incompletos: {faltan.join(", ")}. Complétalos en Empresas antes de consignar el informe.</p>}
          {pob > 0 && pob < 10 && <p className="italic">Población menor a 10 trabajadores: índices de baja comparabilidad.</p>}
          <p className="text-[10px] italic text-neutral-500">Trabajadores efectivos: activos o en reposo durante el período, y egresados después de su inicio.</p>
        </Seccion>

        <Seccion n="2" titulo="Resumen ejecutivo"><Texto>{t.resumen}</Texto></Seccion>

        <Seccion n="3" titulo="Actividad asistencial">
          <Sub titulo="Consultas por motivo de consulta">
            <Tabla columnas={["Motivo", "Tipo", "Casos"]} filas={r.consultas.por_motivo.map((m) => [m.nombre, m.grupo === "preventivo" ? "Preventivo" : "No preventivo", m.n])} />
          </Sub>
          <div className="grid grid-cols-2 gap-4">
            <Sub titulo="Consultas por tipo de paciente"><Tabla columnas={["Tipo de paciente", "Casos"]} filas={(r.consultas.por_tipo_paciente ?? []).map((x) => [x.nombre, x.n])} /></Sub>
            <Sub titulo="Consultas por condición clínica"><Tabla columnas={["Condición", "Casos"]} filas={[["Sanos", r.consultas.sanos], ["Patológicos", r.consultas.patologicos ?? 0]]} /></Sub>
            <Sub titulo="Consultas por sexo"><Tabla columnas={["Sexo", "Casos"]} filas={[["Masculino", r.consultas.por_sexo.M], ["Femenino", r.consultas.por_sexo.F]]} /></Sub>
            <Sub titulo="Consultas por grupo etario"><Tabla columnas={["Grupo etario", "Casos"]} filas={r.consultas.por_edad.map((e) => [e.grupo, e.n])} /></Sub>
            <Sub titulo="Trabajadores bajo vigilancia clínica" nota="Sobre la población actual, sin depender del período.">
              <Tabla columnas={["Vigilancia clínica", "Trabajadores"]} filas={[["De origen ocupacional", r.poblacion.vigilancia_ocupacional ?? 0], ["De origen no ocupacional", r.poblacion.vigilancia_no_ocupacional ?? 0]]} />
            </Sub>
            <Sub titulo="Trabajadores con potencial discapacidad">
              <Tabla columnas={["Condición", "Trabajadores"]} porcentaje={false} total={false} filas={[["Trabajadores efectivos", pob], ["Con discapacidad registrada", r.poblacion.discapacidad ?? 0], ["% de la población", porc(r.poblacion.discapacidad ?? 0, pob)]]} />
            </Sub>
          </div>
          <Sub titulo="Frecuencia de uso del servicio médico por dependencia">
            <Tabla columnas={["Dependencia", "Personal efectivo", "Consultas"]} porcentaje={false} filas={(r.consultas.por_dependencia ?? []).map((d) => [d.nombre, d.personal, d.n])} />
          </Sub>
        </Seccion>

        <Seccion n="4" titulo="Morbilidad">
          <div className="grid grid-cols-2 gap-4">
            <Sub titulo="Morbilidad por aparatos y sistemas"><Tabla columnas={["Aparato o sistema", "Casos"]} filas={r.morbilidad.por_sistema.map((s) => [s.nombre, s.n])} /></Sub>
            <div className="space-y-3">
              <Sub titulo="Morbilidad por origen"><Tabla columnas={["Origen", "Casos"]} filas={Object.entries(r.morbilidad.por_origen).map(([k, n]) => [ETIQUETA_ORIGEN[k as Origen] ?? k, n])} /></Sub>
              <Sub titulo="Frecuencia y prevalencia general" nota={`Fcia.: diagnósticos · Pac.: pacientes afectados · Prev.: pacientes sobre la población total (${pob}).`}>
                <Tabla columnas={["Consulta", "Pac.", "Prev. %", "Fcia."]} porcentaje={false} total={false}
                  filas={(["primera", "sucesiva", "derivada"] as const).map((k) => { const x = r.morbilidad.por_tipo_consulta?.[k]; return [ETIQUETA_CLAVE[k], x?.pacientes ?? 0, porc(x?.pacientes ?? 0, pob), x?.n ?? 0]; })} />
              </Sub>
            </div>
          </div>
          <Sub titulo="Diez primeras causas de morbilidad general">
            <Tabla columnas={["Diagnóstico (CIE-10)", "Prev. %", "Fcia."]} filas={causasFilas(r.morbilidad.primeras_causas, pob)} />
          </Sub>
          {CORTES.map(([g, nombre]) => {
            const claves = Object.keys(cortes[g] ?? {}).sort();
            if (!claves.length) return null;
            return (
              <Sub key={g} titulo={`Diez primeras causas de morbilidad por ${nombre.toLowerCase()}`}>
                <div className="grid grid-cols-2 gap-3">
                  {claves.map((k) => (
                    <div key={k} className="break-inside-avoid">
                      <div className="text-[10.5px] font-semibold text-teal-800">{ETIQUETA_CLAVE[k] ?? k}</div>
                      <Tabla columnas={["Diagnóstico", "Prev. %", "Fcia."]} filas={causasFilas(cortes[g][k], pob)} />
                    </div>
                  ))}
                </div>
              </Sub>
            );
          })}
          <p className="text-[10px] italic text-neutral-500">Solo se imprimen los cortes con casos en el período.</p>
          <Sub titulo="Diez primeras referencias a especialidades médicas">
            <Tabla columnas={["Especialidad", "Referencias"]} filas={(r.referencias?.por_especialidad ?? []).map((x) => [x.nombre, x.n])} />
          </Sub>
        </Seccion>

        <Seccion n="5" titulo="Ausentismo laboral">
          <Indices filas={[
            ["Nro. de trabajadores", num(pob), "Trabajadores efectivos de la empresa en el período."],
            ["Nro. de reposos", num(r.ausentismo.reposos_iniciados ?? r.ausentismo.reposos), "Reposos iniciados en el período (los que vienen de antes cuentan sus días, no el caso)."],
            ["Trabajadores ausentes", num(r.ausentismo.trabajadores_ausentes ?? 0), "Trabajadores con algún día de reposo médico en el período."],
            ["Días cargados", num(r.ausentismo.dias_perdidos), "Días de reposo dentro del período, de todas las causas."],
            ["Días perdidos", num(r.ausentismo.dias_computables), "Días de reposo por causa médica; excluye pre y postnatal."],
            ["Promedio de ausentismo diario (PAD)", num(ausentismo.pad), `PAD = días perdidos / días del lapso (${r.ausentismo.dias_periodo}).`],
            ["Porcentaje de ausentismo", `${num(ausentismo.pct)} %`, "%A = PAD × 100 / trabajadores. Meta internacional: menor a 2,5 %."],
          ]} />
          <div className="grid grid-cols-2 gap-4">
            <Sub titulo="Reposos por causa"><Tabla columnas={["Causa", "Casos", "Días"]} filas={r.ausentismo.por_causa.map((c) => [causas[c.nombre] ?? c.nombre, c.n, c.dias])} /></Sub>
            <Sub titulo="Reposos por ente emisor"><Tabla columnas={["Ente emisor", "Casos", "Días"]} filas={r.ausentismo.por_ente.map((c) => [entes[c.nombre] ?? c.nombre, c.n, c.dias ?? 0])} /></Sub>
          </div>
          <Sub titulo="Diez primeras causas de reposo (por número de casos)">
            <Tabla columnas={["Diagnóstico (CIE-10)", "Días", "Casos"]} filas={(r.ausentismo.primeras_causas ?? []).map((c) => [`${c.cie10} ${c.descripcion}`, c.dias, c.n])} />
          </Sub>
          {(["accidente_comun", "accidente_laboral", "enfermedad_comun", "enfermedad_ocupacional"] as const).map((c) => {
            const filas = (r.ausentismo.detalle ?? []).filter((d) => d.causa === c);
            if (!filas.length) return null;
            return (
              <Sub key={c} titulo={`Causas de reposo por ${(causas[c] ?? c).toLowerCase()}`}>
                <Tabla columnas={["Ente emisor", "Diagnóstico", "Días", "Casos"]} porcentaje={false} filas={filas.map((d) => [entes[d.ente] ?? d.ente, d.cie10 ? `${d.cie10} ${d.descripcion}` : "—", d.dias, d.n])} />
              </Sub>
            );
          })}
          <Sub titulo="Causas de reposo por dependencia">
            <Tabla columnas={["Dependencia", "Casos", "Días"]} filas={(r.ausentismo.por_dependencia ?? []).map((d) => [d.nombre, d.n, d.dias])} />
          </Sub>
        </Seccion>

        <Seccion n="6" titulo="Accidentes y enfermedades ocupacionales">
          <Sub titulo="Accidentes e incidentes laborales">
            <Tabla columnas={["Fecha", "Tipo", "Lugar", "Lesión", "Estado", "Días perdidos"]} porcentaje={false} total={false}
              filas={(r.accidentes ?? []).map((a) => [new Date(a.fecha).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" }), a.tipo, a.lugar ?? "—", [a.lesion, a.parte].filter(Boolean).join(" · ") || "—", a.estado, a.dias])} />
          </Sub>
          {acc && ix && (
            <Sub titulo="Indicadores de lesiones incapacitantes (COVENIN 474)" nota={acc.hay_estimado ? "HHT estimadas: trabajadores × 8 h × días hábiles (COVENIN 474, 5.2)." : "HHT según nómina."}>
              <Indices filas={[
                ["Horas hombre trabajadas (HHT)", num(acc.hht, 0), "Horas trabajadas por todos los trabajadores en el período."],
                ["Índice de frecuencia neta (IFN)", num(ix.ifn), `IFN = lesiones con tiempo perdido (${acc.con_tiempo_perdido}) × 1.000.000 / HHT.`],
                ["Índice de frecuencia bruta (IFB)", num(ix.ifb), `IFB = lesiones totales (${acc.accidentes}) × 1.000.000 / HHT.`],
                ["Índice de severidad (IS)", num(ix.is), `IS = (días perdidos ${acc.dias_perdidos} + días cargados ${acc.dias_cargados}) × 1.000.000 / HHT.`],
                ["Declaraciones en 24 h", ix.aTiempo === null ? "—" : `${ix.aTiempo} %`, `Accidentes y enfermedades declarados a tiempo ante el INPSASEL (${acc.por_declarar} por declarar).`],
              ]} />
            </Sub>
          )}
          <Sub titulo="Indicadores de enfermedad ocupacional">
            <Indices filas={[
              ["Casos de enfermedad ocupacional", num(r.enfermedad_ocupacional?.casos ?? 0), "Diagnosticadas en el período (registradas en Accidentes y EO)."],
              ["Días perdidos por enfermedad ocupacional", num(r.enfermedad_ocupacional?.dias ?? 0), "Días de reposo por enfermedad ocupacional en el período."],
              ["Casos de años anteriores", num(r.enfermedad_ocupacional?.casos_anteriores ?? 0), "Enfermedades ocupacionales diagnosticadas antes del período."],
              ["Días perdidos (casos anteriores)", num(r.enfermedad_ocupacional?.dias_anteriores ?? 0), "Días de reposo del período por casos de años anteriores."],
              ["Tasa de ausentismo por EO (TAEO)", num(eo.taeo, 4), "TAEO = días perdidos por EO × 100 / HHT."],
              ["Tasa de incidencia de EO (TIEO)", num(eo.tieo), "TIEO = casos de EO × 1.000.000 / HHT."],
            ]} />
          </Sub>
        </Seccion>

        <Seccion n="7" titulo="Resultados de los exámenes de salud">
          <Tabla columnas={["Clasificación de aptitud", "Casos"]} filas={Object.entries(r.aptitud).map(([k, n]) => [aptitudes[k] ?? k, n])} />
        </Seccion>

        <Seccion n="8" titulo="Resumen del artículo 34 del Reglamento Parcial de la LOPCYMAT">
          <Tabla columnas={["Concepto", "Total"]} porcentaje={false} total={false} filas={art34} />
        </Seccion>

        <Seccion n="9" titulo="Factores de riesgo, procesos peligrosos y principales efectos en la salud"><Texto>{t.factores_riesgo}</Texto></Seccion>
        <Seccion n="10" titulo="Medidas de control en la fuente, en el ambiente y en los trabajadores"><Texto>{t.medidas_control}</Texto></Seccion>
        <Seccion n="11" titulo="Análisis y conclusiones médico-ocupacionales"><Texto>{t.conclusiones}</Texto></Seccion>
        <Seccion n="12" titulo="Recomendaciones de seguridad y salud laboral"><Texto>{t.recomendaciones}</Texto></Seccion>

        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-1.5 border-b-2 border-teal-700 pb-0.5 text-[13px] font-bold uppercase tracking-wide text-teal-800">Firmantes</h2>
          <table className="w-full border-collapse text-[11px]">
            <thead><tr className="bg-teal-50 text-left"><th className="border border-neutral-300 px-2 py-1">Cargo</th><th className="border border-neutral-300 px-2 py-1">Nombre y apellido</th><th className="border border-neutral-300 px-2 py-1">Cédula</th><th className="border border-neutral-300 px-2 py-1">Firma</th></tr></thead>
            <tbody>
              {filaFirma("Médico ocupacional", firmantes.medico, "m")}
              {filaFirma("Servicio de SST", firmantes.sst, "s")}
              {(firmantes.delegados?.filter((d) => d.nombre).length ? firmantes.delegados.filter((d) => d.nombre) : [undefined]).map((d, i) => filaFirma("Delegado de prevención", d, `d${i}`))}
              {filaFirma("Representante del empleador", firmantes.empleador, "e")}
            </tbody>
          </table>
        </section>
      </Hoja>
    </div>
  );
}
