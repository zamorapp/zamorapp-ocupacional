import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import { BarrasH, Columnas, Dona, EjeMeses, Meta, nombreMes, Pareto, Piramide } from "@/components/graficos";
import { ETIQUETA_ORIGEN, type Origen } from "@/lib/consultas-tipos";
import { datosLegalesFaltantes } from "@/lib/empresas";
import { fechaCorta as corta, parametrosPeriodo, type ConsultaPeriodo } from "@/lib/periodos";
import { tasasEnfermedadOcupacional, type Causa, type Persona } from "@/lib/reportes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cargarVigilancia } from "@/lib/vigilancia";
import { totales, type SeccionAnalisis } from "@/lib/vigilancia-analisis";
import { CORTES, ETIQUETA_CLAVE } from "@/lib/vigilancia-textos";
import { BarraImpresion } from "../barra";
import { fechaCorta, Hoja, Membrete } from "../componentes";

export const metadata: Metadata = { title: "Informe de vigilancia epidemiológica" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<ConsultaPeriodo & { empresa?: string }> };
type Celda = string | number;

const num = (n: number | null | undefined, dec = 2) => (n === null || n === undefined ? "—" : n.toLocaleString("es-VE", { maximumFractionDigits: dec }));
const porc = (n: number, total: number) => (total ? num(Math.round((n * 1000) / total) / 10, 1) : "0");

// Cuadro compacto: total y % sobre la última columna numérica; sin filas, una sola línea
function Tabla({ columnas, filas, porcentaje = true, total = true, vacio = "Sin registros en el período." }: {
  columnas: string[]; filas: Celda[][]; porcentaje?: boolean; total?: boolean; vacio?: string;
}) {
  if (!filas.length) return <p className="text-[10.5px] italic text-doc-tenue">{vacio}</p>;
  const suma = filas.reduce((s, f) => s + (typeof f[f.length - 1] === "number" ? (f[f.length - 1] as number) : 0), 0);
  const th = "px-2 py-1 font-semibold";
  const td = "border-t border-doc-linea px-2 py-[3px]";
  return (
    <table className="w-full border-collapse text-[10.5px]">
      <thead>
        <tr className="bg-doc-suave text-left text-[9.5px] uppercase tracking-wide text-doc-acento">
          {columnas.map((c, i) => <th key={c} className={`${th} ${i > 0 ? "text-right" : ""}`}>{c}</th>)}
          {porcentaje && <th className={`${th} w-12 text-right`}>%</th>}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            {f.map((v, j) => <td key={j} className={`${td} ${j > 0 ? "text-right font-cifra tabular-nums" : ""}`}>{typeof v === "number" ? num(v) : v}</td>)}
            {porcentaje && <td className={`${td} text-right font-cifra tabular-nums text-doc-tenue`}>{porc(f[f.length - 1] as number, suma)}</td>}
          </tr>
        ))}
        {total && filas.length > 1 && (
          <tr className="font-semibold">
            <td className={`${td} border-t-doc-acento`} colSpan={columnas.length - 1}>Total</td>
            <td className={`${td} border-t-doc-acento text-right font-cifra tabular-nums`}>{num(suma)}</td>
            {porcentaje && <td className={`${td} border-t-doc-acento text-right font-cifra`}>100</td>}
          </tr>
        )}
      </tbody>
    </table>
  );
}

// Índices con su fórmula, como pide el formato del INPSASEL
function Indices({ filas }: { filas: [string, string, string][] }) {
  return (
    <table className="w-full border-collapse text-[10.5px]">
      <thead><tr className="bg-doc-suave text-left text-[9.5px] uppercase tracking-wide text-doc-acento"><th className="px-2 py-1">Indicador</th><th className="w-20 px-2 py-1 text-right">Valor</th><th className="px-2 py-1">Definición</th></tr></thead>
      <tbody>
        {filas.map(([n, v, d]) => (
          <tr key={n}><td className="border-t border-doc-linea px-2 py-[3px] font-semibold">{n}</td><td className="border-t border-doc-linea px-2 py-[3px] text-right font-cifra tabular-nums">{v}</td><td className="border-t border-doc-linea px-2 py-[3px] text-doc-tenue">{d}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Seccion({ n, titulo, children, salto }: { n: string; titulo: string; children: React.ReactNode; salto?: boolean }) {
  return (
    <section className={`mb-5 ${salto ? "break-before-page" : ""}`}>
      <h2 className="mb-2.5 flex items-center gap-2.5 border-b border-doc-linea pb-1.5 text-[13px] font-extrabold uppercase tracking-[.08em] text-[#15201e] break-after-avoid">
        <span className="grid size-6 place-items-center rounded-[7px] bg-doc-acento font-cifra text-[11px] text-white">{n}</span> {titulo}
      </h2>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

// Gráfico o cuadro con su título; "ancho" ocupa las dos columnas
function Panel({ titulo, nota, children, className = "" }: { titulo: string; nota?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`break-inside-avoid rounded-[10px] border border-doc-linea p-3 ${className}`}>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[.1em] text-doc-tenue">{titulo}</div>
      <div className="text-[10.5px]">{children}</div>
      {nota && <div className="mt-1.5 text-[9px] italic text-doc-tenue">{nota}</div>}
    </div>
  );
}

// Lectura inmediata del cuadro: redactada con los datos (editable en Reportes)
function Analisis({ texto }: { texto?: string }) {
  if (!texto) return null;
  return (
    <div className="break-inside-avoid rounded-r-[8px] border-l-[3px] border-doc-acento bg-doc-suave/70 px-3 py-2 text-[11.5px] leading-relaxed">
      <span className="mr-1.5 text-[9.5px] font-bold uppercase tracking-[.12em] text-doc-acento">Análisis</span>{texto}
    </div>
  );
}

function Kpi({ titulo, valor, detalle, delta }: { titulo: string; valor: string; detalle?: string; delta?: string | null }) {
  return (
    <div className="rounded-[10px] border border-doc-linea px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[.12em] text-doc-tenue">{titulo}</div>
      <div className="mt-0.5 font-cifra text-[22px] font-semibold leading-tight text-doc-acento">{valor}</div>
      {detalle && <div className="text-[10px] text-doc-tenue">{detalle}</div>}
      {delta && <div className="mt-0.5 font-cifra text-[9.5px] text-[#15201e]">{delta}</div>}
    </div>
  );
}

const Texto = ({ children }: { children: string }) => <div className="whitespace-pre-line text-[12px] leading-relaxed">{children}</div>;
const causasFilas = (c: Causa[], pob: number): Celda[][] => c.map((x) => [`${x.cie10} ${x.descripcion}`, porc(x.pacientes ?? 0, pob), x.n]);
const variacion = (actual: number, base: number | undefined, contra: string) => {
  if (base === undefined || (!base && !actual)) return null;
  if (!base) return `sin datos en ${contra}`;
  const v = Math.round(((actual - base) * 1000) / base) / 10;
  return `${v > 0 ? "▲" : v < 0 ? "▼" : "="} ${num(Math.abs(v), 1)} % vs ${contra}`;
};

export default async function Vigilancia({ searchParams }: Props) {
  const q = await searchParams;
  const sesion = await obtenerSesion();
  const empresaId = q.empresa || null;
  const s0 = supabaseConfigurado && !sesion.demo ? await crearClienteServidor() : null;
  const [v, org, logoEmpresa] = await Promise.all([
    cargarVigilancia(sesion, empresaId, q),
    s0 && sesion.orgId ? s0.from("organizaciones").select("nombre, rif, direccion, telefono, correo, logo, ajustes").eq("id", sesion.orgId).single().then(({ data }) => data) : null,
    s0 && empresaId ? s0.from("empresas").select("logo").eq("id", empresaId).maybeSingle().then(({ data }) => (data?.logo as string | null) ?? null) : null,
  ]);
  const { r, s, acc, ix, periodo, empresa, causas, entes, aptitudes, ausentismo } = v;
  if (!r) return <p className="p-10">No hay datos.</p>;

  const guardados = Object.fromEntries(Object.entries(v.informe ?? {}).filter(([k, x]) => typeof x === "string" && x && k !== "id" && k !== "actualizado_en"));
  const t = { ...v.sugeridos!, ...guardados };
  const a: Partial<Record<SeccionAnalisis, string>> = { ...v.analisis?.secciones, ...v.informe?.analisis };
  const firmantes = { ...v.firmantesBase, ...v.informe?.firmantes };
  const faltan = empresa ? datosLegalesFaltantes(empresa) : [];
  const pob = r.poblacion.total;
  const eo = acc ? tasasEnfermedadOcupacional(r, acc.hht) : { taeo: null, tieo: null };
  const cortes = r.morbilidad.cortes ?? {};
  const volver = `/reportes?${new URLSearchParams(parametrosPeriodo(periodo))}`;
  const actual = s ? totales(s) : null;
  const previo = v.sAnt ? totales(v.sAnt) : null;
  const contra = "período anterior";
  const meses = s?.por_mes ?? [];
  const membrete = {
    org: { nombre: org?.nombre ?? "", rif: org?.rif ?? null, direccion: org?.direccion ?? null, telefono: org?.telefono ?? null, correo: org?.correo ?? null, logo: org?.logo ?? null, ajustes: (org?.ajustes ?? {}) },
    empresa: { razon_social: empresa?.razonSocial ?? "Consolidado de empresas", rif: empresa?.rif ?? "", logo: logoEmpresa },
  } as unknown as Parameters<typeof Membrete>[0]["d"];
  const titulo = periodo.etiqueta.replace(/ \(.*\)$/, "");
  const subtitulo = periodo.etiqueta.match(/\((.*)\)$/)?.[1] ?? null;

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
  const cortesConDatos = CORTES.filter(([g]) => Object.keys(cortes[g] ?? {}).length);
  const detalleReposo = (["accidente_comun", "accidente_laboral", "enfermedad_comun", "enfermedad_ocupacional"] as const).filter((c) => (r.ausentismo.detalle ?? []).some((d) => d.causa === c));

  const filaFirma = (rol: string, p: Persona | undefined, k: string) => (
    <div key={k} className="break-inside-avoid">
      <div className="h-14 border-b border-[#15201e]" />
      <div className="mt-1 text-[11px] font-semibold">{p?.nombre || " "}</div>
      <div className="text-[10px] text-doc-tenue">{rol}{p?.cedula ? ` · C.I. ${p.cedula}` : ""}</div>
    </div>
  );

  return (
    <div className="papel min-h-dvh bg-neutral-100 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:bg-white">
      <BarraImpresion volver={volver} titulo={`Vigilancia epidemiológica · ${empresa?.razonSocial ?? "Todas las empresas"} · ${periodo.etiqueta}`} />

      {/* Portada ejecutiva */}
      <Hoja>
        <Membrete d={membrete} />
        <div className="mt-5 overflow-hidden rounded-[14px] bg-doc-acento text-white">
          <div className="grid grid-cols-[1fr_auto] items-end gap-6 px-6 pt-5 pb-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.2em] opacity-80">Informe trimestral · Reglamento Parcial de la LOPCYMAT, art. 34</div>
              <h1 className="mt-1.5 text-[26px] font-extrabold leading-[1.1] tracking-tight">Vigilancia epidemiológica<br />de la salud de los trabajadores</h1>
            </div>
            <div className="text-right">
              <div className="text-[18px] font-extrabold first-letter:uppercase">{titulo}</div>
              {subtitulo && <div className="text-[11px] opacity-90">{subtitulo}</div>}
              <div className="mt-1 font-cifra text-[11px] opacity-90">{corta(periodo.desde)} – {corta(periodo.hasta)}</div>
            </div>
          </div>
          <div className="flex justify-between gap-4 bg-black/15 px-6 py-2 text-[11px]">
            <span className="font-semibold">{empresa?.razonSocial ?? "Consolidado de todas las empresas clientes"}{empresa?.rif ? ` · RIF ${empresa.rif}` : ""}</span>
            <span className="opacity-90">{num(pob, 0)} trabajadores efectivos</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Kpi titulo="Consultas" valor={num(r.consultas.total, 0)} detalle={`${num(r.consultas.pacientes, 0)} pacientes · ${porc(r.consultas.pacientes, pob)} % de cobertura`} delta={actual && variacion(actual.consultas, previo?.consultas, contra)} />
          <Kpi titulo="Prevalencia de morbilidad" valor={`${porc(r.morbilidad.pacientes ?? 0, pob)} %`} detalle={`${num(r.morbilidad.total, 0)} diagnósticos`} delta={actual && variacion(actual.diagnosticos, previo?.diagnosticos, contra)} />
          <Kpi titulo="Ausentismo" valor={`${num(ausentismo.pct)} %`} detalle={`Meta < 2,5 % · ${ausentismo.pct < 2.5 ? "dentro de la meta" : "sobre la meta"}`} delta={actual && variacion(actual.dias, previo?.dias, contra)} />
          <Kpi titulo="Días perdidos" valor={num(r.ausentismo.dias_computables, 0)} detalle={`${num(r.ausentismo.reposos_iniciados ?? r.ausentismo.reposos, 0)} reposos · PAD ${num(ausentismo.pad)}`} />
          <Kpi titulo="Accidentes de trabajo" valor={num(acc?.accidentes ?? 0, 0)} detalle={ix?.ifn !== null && ix?.ifn !== undefined ? `IFN ${num(ix.ifn)} · IS ${num(ix.is)}` : "Sin horas hombre registradas"} />
          <Kpi titulo="Preventivas" valor={`${porc(r.consultas.preventivas, r.consultas.total)} %`} detalle={`${num(r.consultas.preventivas, 0)} evaluaciones y controles`} />
        </div>

        {v.analisis && (
          <div className="mt-4 grid grid-cols-[1fr_1.35fr] gap-4">
            <div className="rounded-[10px] bg-doc-suave px-4 py-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-doc-acento">Hallazgos clave</div>
              <ul className="space-y-1.5 text-[11px] leading-snug">
                {v.analisis.hallazgos.map((h) => <li key={h} className="flex gap-2"><span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-doc-acento" />{h}</li>)}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-doc-acento">Resumen ejecutivo</div>
              <Texto>{t.resumen}</Texto>
            </div>
          </div>
        )}

        {s && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Panel titulo="Consultas por mes"><Columnas alto={92} puntos={meses.map((m) => ({ etiqueta: nombreMes(m.mes), n: m.consultas }))} /><EjeMeses etiquetas={meses.map((m) => nombreMes(m.mes))} /></Panel>
            <Panel titulo="Días de reposo por mes"><Columnas alto={92} serie={2} sufijo="días" puntos={meses.map((m) => ({ etiqueta: nombreMes(m.mes), n: m.dias_reposo }))} /><EjeMeses etiquetas={meses.map((m) => nombreMes(m.mes))} /></Panel>
          </div>
        )}

        <div className="mt-4 rounded-[10px] border border-doc-linea px-4 py-3 text-[10.5px]">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-doc-tenue">Identificación de la empresa</div>
          {empresa ? (
            <div className="grid grid-cols-3 gap-x-5 gap-y-0.5">
              <div><b>NIL:</b> {empresa.nil ?? <span className="font-semibold text-red-700">Falta</span>}</div>
              <div><b>Sector:</b> {empresa.sector ?? "—"}</div>
              <div><b>Teléfono:</b> {empresa.telefono ?? "—"}</div>
              <div className="col-span-3"><b>Actividad económica:</b> {empresa.actividad ?? <span className="font-semibold text-red-700">Falta</span>}</div>
              <div><b>Municipio:</b> {empresa.municipio ?? "—"}</div>
              <div><b>Parroquia:</b> {empresa.parroquia ?? "—"}</div>
              <div><b>Servicio de SST:</b> {empresa.servicioSst ?? "—"}</div>
              <div><b>Registro Servicio SST:</b> {empresa.servicioSstRegistro ? fechaCorta(empresa.servicioSstRegistro) : <span className="font-semibold text-red-700">Falta</span>}</div>
              <div><b>Registro PSST:</b> {empresa.psstRegistro ? fechaCorta(empresa.psstRegistro) : <span className="font-semibold text-red-700">Falta</span>}</div>
              <div><b>Trabajadores:</b> {pob} ({r.poblacion.femenino} F · {r.poblacion.masculino} M)</div>
            </div>
          ) : (
            <div>Consolidado de todas las empresas clientes del servicio.</div>
          )}
          {faltan.length > 0 && <p className="mt-1 font-semibold text-red-700">Datos legales incompletos: {faltan.join(", ")}. Complétalos en Empresas antes de consignar el informe.</p>}
        </div>
      </Hoja>

      <Hoja>
        <Seccion n="1" titulo="Población trabajadora">
          <div className="grid grid-cols-[1.25fr_1fr] gap-3">
            {s && <Panel titulo="Pirámide por edad y sexo"><Piramide grupos={s.piramide} /></Panel>}
            <div className="space-y-3">
              <Panel titulo="Distribución por sexo"><Dona tam={84} partes={[{ nombre: "Hombres", n: r.poblacion.masculino }, { nombre: "Mujeres", n: r.poblacion.femenino }]} centro={num(pob, 0)} sub="trabajadores" /></Panel>
              <Panel titulo="Vigilancia clínica y discapacidad" nota="Vigilancia: sobre la población actual, sin depender del período.">
                <Tabla porcentaje={false} total={false} columnas={["Condición", "Trabajadores"]} filas={[
                  ["Vigilancia de origen ocupacional", r.poblacion.vigilancia_ocupacional ?? 0],
                  ["Vigilancia de origen no ocupacional", r.poblacion.vigilancia_no_ocupacional ?? 0],
                  ["Con discapacidad registrada", r.poblacion.discapacidad ?? 0],
                ]} />
              </Panel>
            </div>
          </div>
          <Analisis texto={a.poblacion} />
          {pob > 0 && pob < 10 && <p className="text-[10.5px] italic">Población menor a 10 trabajadores: índices de baja comparabilidad.</p>}
          <p className="text-[9px] italic text-doc-tenue">Trabajadores efectivos: activos o en reposo durante el período, y egresados después de su inicio.</p>
        </Seccion>

        <Seccion n="2" titulo="Actividad asistencial">
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel titulo="Tipo de atención"><Dona tam={92} partes={[{ nombre: "Preventivas", n: r.consultas.preventivas }, { nombre: "Asistenciales", n: r.consultas.no_preventivas }]} centro={num(r.consultas.total, 0)} sub="consultas" /></Panel>
            <Panel titulo="Condición clínica"><Dona tam={92} partes={[{ nombre: "Sanos", n: r.consultas.sanos }, { nombre: "Patológicos", n: r.consultas.patologicos ?? 0 }]} centro={num(r.consultas.pacientes, 0)} sub="pacientes" /></Panel>
            <Panel titulo="Consultas por motivo" className="col-span-2"><BarrasH filas={r.consultas.por_motivo} max={10} /></Panel>
          </div>
          <Analisis texto={a.uso} />
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel titulo="Por tipo de paciente"><Tabla columnas={["Tipo de paciente", "Casos"]} filas={(r.consultas.por_tipo_paciente ?? []).map((x) => [x.nombre, x.n])} /></Panel>
            <Panel titulo="Por sexo y grupo etario">
              <Tabla columnas={["Grupo", "Casos"]} filas={[["Masculino", r.consultas.por_sexo.M], ["Femenino", r.consultas.por_sexo.F]]} />
              <div className="mt-2" />
              <Tabla columnas={["Grupo etario", "Casos"]} filas={r.consultas.por_edad.map((e) => [e.grupo, e.n])} />
            </Panel>
          </div>
          <Panel titulo="Frecuencia de uso del servicio médico por dependencia">
            <Tabla columnas={["Dependencia", "Personal efectivo", "Consultas"]} porcentaje={false} filas={(r.consultas.por_dependencia ?? []).map((d) => [d.nombre, d.personal, d.n])} />
          </Panel>
        </Seccion>

        <Seccion n="3" titulo="Morbilidad">
          {s && <Panel titulo="Morbilidad por capítulo CIE-10 · diagrama de Pareto" nota="Barras: diagnósticos de cada grupo · línea: % acumulado · referencia: 80 %."><Pareto filas={s.capitulos} max={9} /></Panel>}
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel titulo="Por aparatos y sistemas"><BarrasH filas={r.morbilidad.por_sistema} max={8} /></Panel>
            <Panel titulo="Por origen"><Dona tam={92} partes={Object.entries(r.morbilidad.por_origen).map(([k, n]) => ({ nombre: ETIQUETA_ORIGEN[k as Origen] ?? k, n }))} centro={num(r.morbilidad.total, 0)} sub="diagnósticos" /></Panel>
          </div>
          <Analisis texto={a.morbilidad} />
          <div className="grid grid-cols-[1.6fr_1fr] items-start gap-3">
            <Panel titulo="Diez primeras causas de morbilidad general" nota={`Prev.: pacientes sobre la población (${pob}) · Fcia.: diagnósticos.`}>
              <Tabla columnas={["Diagnóstico (CIE-10)", "Prev. %", "Fcia."]} filas={causasFilas(r.morbilidad.primeras_causas, pob)} />
            </Panel>
            <Panel titulo="Frecuencia y prevalencia por tipo de consulta">
              <Tabla columnas={["Consulta", "Pac.", "Prev. %", "Fcia."]} porcentaje={false} total={false}
                filas={(["primera", "sucesiva", "derivada"] as const).map((k) => { const x = r.morbilidad.por_tipo_consulta?.[k]; return [ETIQUETA_CLAVE[k], x?.pacientes ?? 0, porc(x?.pacientes ?? 0, pob), x?.n ?? 0]; })} />
            </Panel>
          </div>
          {cortesConDatos.length > 0 && <p className="text-[9.5px] italic text-doc-tenue">Las diez primeras causas por tipo de consulta, origen, sexo, edad, actividad, sistema, motivo y dependencia van en el anexo estadístico.</p>}
        </Seccion>

        <Seccion n="4" titulo="Ausentismo laboral">
          <div className="grid grid-cols-[1fr_1.3fr] gap-3">
            <Panel titulo="Porcentaje de ausentismo">
              <div className="mb-2 font-cifra text-[26px] font-semibold leading-none text-doc-acento">{num(ausentismo.pct)} %</div>
              <Meta valor={ausentismo.pct} meta={2.5} />
              <div className="mt-2 text-[10px] text-doc-tenue">{num(r.ausentismo.dias_computables, 0)} días perdidos · {num(r.ausentismo.trabajadores_ausentes ?? 0, 0)} trabajadores ausentes · PAD {num(ausentismo.pad)}</div>
            </Panel>
            <Panel titulo="Días perdidos por causa"><BarrasH filas={r.ausentismo.por_causa.map((c) => ({ nombre: causas[c.nombre] ?? c.nombre, n: c.dias }))} sufijo="d" serie={2} /></Panel>
          </div>
          <Analisis texto={a.ausentismo} />
          <Indices filas={[
            ["Nro. de trabajadores", num(pob), "Trabajadores efectivos de la empresa en el período."],
            ["Nro. de reposos", num(r.ausentismo.reposos_iniciados ?? r.ausentismo.reposos), "Reposos iniciados en el período (los que vienen de antes cuentan sus días, no el caso)."],
            ["Trabajadores ausentes", num(r.ausentismo.trabajadores_ausentes ?? 0), "Trabajadores con algún día de reposo médico en el período."],
            ["Días cargados", num(r.ausentismo.dias_perdidos), "Días de reposo dentro del período, de todas las causas."],
            ["Días perdidos", num(r.ausentismo.dias_computables), "Días de reposo por causa médica; excluye pre y postnatal."],
            ["Promedio de ausentismo diario (PAD)", num(ausentismo.pad), `PAD = días perdidos / días del lapso (${r.ausentismo.dias_periodo}).`],
            ["Porcentaje de ausentismo", `${num(ausentismo.pct)} %`, "%A = PAD × 100 / trabajadores. Meta internacional: menor a 2,5 %."],
          ]} />
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel titulo="Reposos por causa"><Tabla columnas={["Causa", "Casos", "Días"]} filas={r.ausentismo.por_causa.map((c) => [causas[c.nombre] ?? c.nombre, c.n, c.dias])} /></Panel>
            <Panel titulo="Reposos por ente emisor"><Tabla columnas={["Ente emisor", "Casos", "Días"]} filas={r.ausentismo.por_ente.map((c) => [entes[c.nombre] ?? c.nombre, c.n, c.dias ?? 0])} /></Panel>
          </div>
          <Panel titulo="Diez primeras causas de reposo">
            <Tabla columnas={["Diagnóstico (CIE-10)", "Días", "Casos"]} filas={(r.ausentismo.primeras_causas ?? []).map((c) => [`${c.cie10} ${c.descripcion}`, c.dias, c.n])} />
          </Panel>
        </Seccion>

        <Seccion n="5" titulo="Accidentes y enfermedades ocupacionales">
          {acc && ix && (
            <div className="grid grid-cols-4 gap-2.5">
              <Kpi titulo="IFN" valor={num(ix.ifn)} detalle="Frecuencia neta" />
              <Kpi titulo="IFB" valor={num(ix.ifb)} detalle="Frecuencia bruta" />
              <Kpi titulo="IS" valor={num(ix.is)} detalle="Severidad" />
              <Kpi titulo="Declaradas a tiempo" valor={ix.aTiempo === null ? "—" : `${ix.aTiempo} %`} detalle={`${acc.por_declarar} por declarar`} />
            </div>
          )}
          <Analisis texto={a.accidentes} />
          <Panel titulo="Accidentes e incidentes laborales">
            <Tabla columnas={["Fecha", "Tipo", "Lugar", "Lesión", "Estado", "Días perdidos"]} porcentaje={false} total={false} vacio="Sin accidentes ni incidentes en el período."
              filas={(r.accidentes ?? []).map((x) => [new Date(x.fecha).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" }), x.tipo, x.lugar ?? "—", [x.lesion, x.parte].filter(Boolean).join(" · ") || "—", x.estado, x.dias])} />
          </Panel>
          {acc && ix && (
            <Indices filas={[
              ["Horas hombre trabajadas (HHT)", num(acc.hht, 0), acc.hay_estimado ? "Estimadas: trabajadores × 8 h × días hábiles (COVENIN 474, 5.2)." : "Según nómina."],
              ["Índice de frecuencia neta (IFN)", num(ix.ifn), `IFN = lesiones con tiempo perdido (${acc.con_tiempo_perdido}) × 1.000.000 / HHT.`],
              ["Índice de frecuencia bruta (IFB)", num(ix.ifb), `IFB = lesiones totales (${acc.accidentes}) × 1.000.000 / HHT.`],
              ["Índice de severidad (IS)", num(ix.is), `IS = (días perdidos ${acc.dias_perdidos} + días cargados ${acc.dias_cargados}) × 1.000.000 / HHT.`],
              ["Casos de enfermedad ocupacional", num(r.enfermedad_ocupacional?.casos ?? 0), `Diagnosticadas en el período · ${num(r.enfermedad_ocupacional?.casos_anteriores ?? 0)} de años anteriores.`],
              ["Días perdidos por EO", num(r.enfermedad_ocupacional?.dias ?? 0), `Del período · ${num(r.enfermedad_ocupacional?.dias_anteriores ?? 0)} por casos anteriores.`],
              ["Tasa de ausentismo por EO (TAEO)", num(eo.taeo, 4), "TAEO = días perdidos por EO × 100 / HHT."],
              ["Tasa de incidencia de EO (TIEO)", num(eo.tieo), "TIEO = casos de EO × 1.000.000 / HHT."],
            ]} />
          )}
        </Seccion>

        <Seccion n="6" titulo="Referencias y exámenes de salud">
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel titulo="Referencias a especialidades"><BarrasH filas={r.referencias?.por_especialidad ?? []} max={8} /></Panel>
            <Panel titulo="Aptitud emitida"><Dona tam={92} partes={Object.entries(r.aptitud).map(([k, n]) => ({ nombre: aptitudes[k] ?? k, n }))} centro={num(Object.values(r.aptitud).reduce((x, y) => x + y, 0), 0)} sub="evaluaciones" /></Panel>
          </div>
          <Analisis texto={[a.referencias, a.aptitud].filter(Boolean).join(" ")} />
        </Seccion>

        <Seccion n="7" titulo="Resumen del artículo 34 del Reglamento Parcial de la LOPCYMAT">
          <Tabla columnas={["Concepto", "Total"]} porcentaje={false} total={false} filas={art34} />
        </Seccion>

        <Seccion n="8" titulo="Factores de riesgo, procesos peligrosos y efectos en la salud"><Texto>{t.factores_riesgo}</Texto></Seccion>
        <Seccion n="9" titulo="Medidas de control en la fuente, el ambiente y los trabajadores"><Texto>{t.medidas_control}</Texto></Seccion>

        <section className="mb-5 break-inside-avoid rounded-[12px] bg-doc-acento px-5 py-4 text-white">
          <h2 className="mb-1.5 text-[12px] font-extrabold uppercase tracking-[.12em]">10 · Conclusión médico-ocupacional</h2>
          <div className="whitespace-pre-line text-[12px] leading-relaxed">{t.conclusiones}</div>
        </section>
        <Seccion n="11" titulo="Recomendaciones de seguridad y salud laboral"><Texto>{t.recomendaciones}</Texto></Seccion>

        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-1 border-b border-doc-linea pb-1.5 text-[13px] font-extrabold uppercase tracking-[.08em]">Firmantes</h2>
          <div className="grid grid-cols-2 gap-x-10 gap-y-3">
            {filaFirma("Médico ocupacional", firmantes.medico, "m")}
            {filaFirma("Servicio de Seguridad y Salud en el Trabajo", firmantes.sst, "s")}
            {(firmantes.delegados?.filter((d) => d.nombre).length ? firmantes.delegados.filter((d) => d.nombre) : [undefined]).map((d, i) => filaFirma("Delegado de prevención", d, `d${i}`))}
            {filaFirma("Representante del empleador", firmantes.empleador, "e")}
          </div>
        </section>
      </Hoja>

      {(cortesConDatos.length > 0 || detalleReposo.length > 0 || (r.ausentismo.por_dependencia ?? []).length > 0) && (
        <Hoja>
          <Seccion n="A" titulo="Anexo estadístico">
            {cortesConDatos.map(([g, nombre]) => (
              <div key={g} className="space-y-2">
                <div className="text-[11px] font-bold text-doc-acento">Diez primeras causas de morbilidad por {nombre.toLowerCase()}</div>
                <div className="grid grid-cols-2 items-start gap-3">
                  {Object.keys(cortes[g]).sort().map((k) => (
                    <Panel key={k} titulo={ETIQUETA_CLAVE[k] ?? k}><Tabla columnas={["Diagnóstico", "Prev. %", "Fcia."]} filas={causasFilas(cortes[g][k], pob)} /></Panel>
                  ))}
                </div>
              </div>
            ))}
            {detalleReposo.map((c) => (
              <Panel key={c} titulo={`Causas de reposo por ${(causas[c] ?? c).toLowerCase()}`}>
                <Tabla columnas={["Ente emisor", "Diagnóstico", "Días", "Casos"]} porcentaje={false} filas={(r.ausentismo.detalle ?? []).filter((d) => d.causa === c).map((d) => [entes[d.ente] ?? d.ente, d.cie10 ? `${d.cie10} ${d.descripcion}` : "—", d.dias, d.n])} />
              </Panel>
            ))}
            <Panel titulo="Causas de reposo por dependencia">
              <Tabla columnas={["Dependencia", "Casos", "Días"]} filas={(r.ausentismo.por_dependencia ?? []).map((d) => [d.nombre, d.n, d.dias])} />
            </Panel>
            <p className="text-[9.5px] italic text-doc-tenue">Solo se imprimen los cortes con casos en el período. Ningún cuadro identifica a trabajadores.</p>
          </Seccion>
        </Hoja>
      )}
    </div>
  );
}
