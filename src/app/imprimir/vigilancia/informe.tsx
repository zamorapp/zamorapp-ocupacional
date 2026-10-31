import { notFound } from "next/navigation";
import { BarrasH, Columnas, Dona, EjeMeses, Meta, nombreMes, Pareto, Piramide } from "@/components/graficos";
import { ETIQUETA_ORIGEN, type Origen } from "@/lib/consultas-tipos";
import { datosLegalesFaltantes } from "@/lib/empresas";
import { hoyCaracas } from "@/lib/fecha";
import { fechaEmisionDe } from "@/lib/firmantes";
import { fechaCorta as corta, parametrosPeriodo } from "@/lib/periodos";
import { tasasEnfermedadOcupacional, textoMetodoHoras, type Causa } from "@/lib/reportes";
import type { cargarVigilancia } from "@/lib/vigilancia";
import { mencionaDiscapacidad, totales, type SeccionAnalisis } from "@/lib/vigilancia-analisis";
import { CAUSAS_REPOSO, filasArt34 } from "@/lib/vigilancia-integral";
import { nombrable } from "@/lib/vigilancia-redaccion";
import { CORTES, ETIQUETA_CLAVE } from "@/lib/vigilancia-textos";
import { BarraImpresion } from "../barra";
import { fechaCorta, Hoja, Membrete } from "../componentes";
import { textoCausa, textoDiagnostico } from "@/lib/diagnostico-texto";
import { Portada } from "./portada";
import { Cartelera } from "./cartelera";
import { IndiceInforme } from "./indice";

// Datos de la organización para el membrete (los lee page.tsx; la prueba de impresión trae unos de ejemplo)
export type OrgInforme = { nombre: string; rif: string | null; direccion: string | null; telefono: string | null; correo: string | null; logo: string | null; ajustes: unknown } | null;
type Celda = string | number;

const num = (n: number | null | undefined, dec = 2) => (n === null || n === undefined ? "—" : n.toLocaleString("es-VE", { maximumFractionDigits: dec }));
const porc = (n: number, total: number) => (total ? num(Math.round((n * 1000) / total) / 10, 1) : "0");

// Cuadro compacto: total y % sobre la última columna numérica; sin filas, una sola línea
// minimo: en lo que va a la empresa, las cifras de 1 a minimo-1 salen como «<minimo» (sin su % ni el total que las delata)
// texto: columnas (además de la primera) que llevan palabras: a la izquierda y en letra normal
function Tabla({ columnas, filas, porcentaje = true, total = true, vacio = "Sin registros en el período.", minimo = 0, texto = [] }: {
  columnas: string[]; filas: Celda[][]; porcentaje?: boolean; total?: boolean; vacio?: string; minimo?: number; texto?: number[];
}) {
  const cifra = (j: number) => j > 0 && !texto.includes(j);
  if (!filas.length) return <p className="text-[10.5px] italic text-doc-tenue">{vacio}</p>;
  const oculta = (v: Celda) => minimo > 0 && typeof v === "number" && v > 0 && v < minimo;
  const conOcultas = filas.some((f) => f.some(oculta));
  const suma = filas.reduce((s, f) => s + (typeof f[f.length - 1] === "number" ? (f[f.length - 1] as number) : 0), 0);
  const th = "px-2 py-1 font-semibold";
  const td = "border-t border-doc-linea px-2 py-[3px]";
  return (
    <table className="w-full border-collapse text-[10.5px]">
      <thead>
        <tr className="bg-doc-suave text-left text-[9.5px] uppercase tracking-wide text-doc-acento">
          {columnas.map((c, i) => <th key={c} className={`${th} ${cifra(i) ? "text-right" : ""}`}>{c}</th>)}
          {porcentaje && <th className={`${th} w-12 text-right`}>%</th>}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            {f.map((v, j) => <td key={j} className={`${td} ${cifra(j) ? "text-right font-cifra tabular-nums" : ""}`}>{oculta(v) ? `<${minimo}` : typeof v === "number" ? num(v) : v}</td>)}
            {porcentaje && <td className={`${td} text-right font-cifra tabular-nums text-doc-tenue`}>{f.some(oculta) ? "—" : porc(f[f.length - 1] as number, suma)}</td>}
          </tr>
        ))}
        {total && filas.length > 1 && !conOcultas && (
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

function Seccion({ n, titulo, children, salto, ancla }: { n: string; titulo: string; children: React.ReactNode; salto?: boolean; ancla?: string }) {
  return (
    <section id={ancla} data-indice={ancla ? `${n}. ${titulo}` : undefined} data-indice-nivel={ancla ? 1 : undefined} className={`mb-5 ${salto ? "break-before-page" : ""}`}>
      <h2 className="mb-2.5 flex items-center gap-2.5 border-b border-doc-linea pb-1.5 text-[13px] font-extrabold uppercase tracking-[.08em] text-[#15201e] break-after-avoid">
        <span className="grid size-6 place-items-center rounded-[7px] bg-doc-acento font-cifra text-[11px] text-white">{n}</span> {titulo}
      </h2>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

// Gráfico o cuadro con su título; "ancho" ocupa las dos columnas
// ancla: el cuadro entra al índice final con su página
function Panel({ titulo, nota, children, className = "", ancla }: { titulo: string; nota?: string; children: React.ReactNode; className?: string; ancla?: string }) {
  return (
    <div id={ancla} data-indice={ancla ? titulo : undefined} className={`break-inside-avoid rounded-[10px] border border-doc-linea p-3 ${className}`}>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[.1em] text-doc-tenue">{titulo}</div>
      <div className="text-[10.5px]">{children}</div>
      {nota && <div className="mt-1.5 text-[9px] italic text-doc-tenue">{nota}</div>}
    </div>
  );
}

// Lectura inmediata del cuadro: redactada con los datos (editable en Reportes)
// titulo: cuando una sección tiene varias lecturas, dice a qué cuadro corresponde cada una
function Analisis({ texto, titulo }: { texto?: string; titulo?: string }) {
  if (!texto) return null;
  return (
    <div className="break-inside-avoid rounded-r-[8px] border-l-[3px] border-doc-acento bg-doc-suave/70 px-3 py-2 text-[11.5px] leading-relaxed">
      <span className="mr-1.5 text-[9.5px] font-bold uppercase tracking-[.12em] text-doc-acento">Análisis{titulo ? ` · ${titulo}` : ""}</span>{texto}
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

// Dato legal faltante: aviso en pantalla, raya en el papel
const Falta = () => <><span className="font-semibold text-red-700 print:hidden">Falta</span><span className="hidden print:inline">—</span></>;
const Texto = ({ children }: { children: string }) => <div className="whitespace-pre-line text-[12px] leading-relaxed">{children}</div>;
// Lo que va a la empresa nunca nombra un diagnóstico con menos de «minimo» casos ni uno confidencial (misma regla que
// el texto, nombrable): esas filas se suman en «Otros diagnósticos»; si la suma tampoco llega a «minimo», no sale
const OTROS_DX = (minimo: number) => `Otros diagnósticos (menos de ${minimo} casos o confidenciales)`;
function apartar<F extends { cie10: string | null; n: number; pacientes?: number }>(filas: F[], minimo: number) {
  if (!minimo) return { visibles: filas, otros: [] as F[], sale: false };
  const ok = (f: F) => Boolean(f.cie10) && Math.min(f.n, f.pacientes ?? f.n) >= minimo && nombrable({ ...f, cie10: f.cie10 ?? "" });
  const otros = filas.filter((f) => !ok(f));
  return { visibles: filas.filter(ok), otros, sale: otros.reduce((s, f) => s + Math.min(f.n, f.pacientes ?? f.n), 0) >= minimo };
}
const causasFilas = (c: Causa[], pob: number, minimo = 0): Celda[][] => {
  const { visibles, otros, sale } = apartar(c, minimo);
  const filas: Celda[][] = visibles.map((x) => [textoCausa(x.cie10, x.descripcion), porc(x.pacientes ?? 0, pob), x.n]);
  return sale ? [...filas, [OTROS_DX(minimo), "—", otros.reduce((s, x) => s + x.n, 0)]] : filas;
};
const reposoCausasFilas = (c: (Causa & { dias: number })[], minimo = 0): Celda[][] => {
  const { visibles, otros, sale } = apartar(c, minimo);
  const filas: Celda[][] = visibles.map((x) => [textoCausa(x.cie10, x.descripcion), x.dias, x.n]);
  return sale ? [...filas, [OTROS_DX(minimo), otros.reduce((s, x) => s + x.dias, 0), otros.reduce((s, x) => s + x.n, 0)]] : filas;
};
type Detalle = { ente: string; cie10: string | null; descripcion: string | null; n: number; dias: number };
const detalleFilas = (d: Detalle[], entes: Record<string, string>, minimo = 0): Celda[][] => {
  const { visibles, otros, sale } = apartar(d, minimo);
  const filas: Celda[][] = visibles.map((x) => [entes[x.ente] ?? x.ente, textoDiagnostico(x.cie10, x.descripcion), x.dias, x.n]);
  return sale ? [...filas, ["Varios", OTROS_DX(minimo), otros.reduce((s, x) => s + x.dias, 0), otros.reduce((s, x) => s + x.n, 0)]] : filas;
};
// Gráficos de lo que va a la empresa: las categorías con menos de «minimo» casos se suman en «Otras»; si aun así no llegan, no salen
function agrupar<F extends { nombre: string; n: number }>(filas: F[], minimo: number): { nombre: string; n: number }[] {
  if (!minimo) return filas;
  const chicas = filas.filter((f) => f.n > 0 && f.n < minimo);
  const resto = chicas.reduce((s, f) => s + f.n, 0);
  const grandes = filas.filter((f) => !chicas.includes(f));
  return resto >= minimo ? [...grandes, { nombre: `Otras (menos de ${minimo} cada una)`, n: resto }] : grandes;
}
const variacion = (actual: number, base: number | undefined, contra: string) => {
  if (base === undefined || (!base && !actual)) return null;
  if (!base) return `sin datos en ${contra}`;
  const v = Math.round(((actual - base) * 1000) / base) / 10;
  return `${v > 0 ? "▲" : v < 0 ? "▼" : "="} ${num(Math.abs(v), 1)} % vs ${contra}`;
};

function Bloque({ titulo, ancla, children }: { titulo: string; ancla: string; children: React.ReactNode }) {
  return (
    <div id={ancla} data-indice={titulo} className="break-inside-avoid">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[.1em] text-doc-acento break-after-avoid">{titulo}</h3>
      {children}
    </div>
  );
}

// «Prioridad alta: …» / «Prioridad media: …» / «Prioridad baja (sostener): …», cada una con su color
function Prioridades({ texto }: { texto: string }) {
  const color = (l: string) => (/^prioridad alta/i.test(l) ? "bg-[#b42318]" : /^prioridad media/i.test(l) ? "bg-[#c2690a]" : /^prioridad baja/i.test(l) ? "bg-doc-acento" : "bg-doc-tenue");
  return (
    <ul className="space-y-1.5 text-[11.5px] leading-snug">
      {texto.split("\n").filter((l) => l.trim()).map((l) => (
        <li key={l} className="flex gap-2"><span className={`mt-[5px] size-2 shrink-0 rounded-full ${color(l)}`} />{l}</li>
      ))}
    </ul>
  );
}

// El informe impreso completo. paraEmpresa: la versión que se envía a RR. HH. (sin discapacidad ni cifras pequeñas)
export function InformeVigilancia({ v, org, logoEmpresa, paraEmpresa, puedeEnviar }: {
  v: Awaited<ReturnType<typeof cargarVigilancia>>;
  org: OrgInforme;
  logoEmpresa: string | null;
  paraEmpresa: boolean;
  puedeEnviar: boolean;
}) {
  const { r, s, acc, ix, periodo, empresa, causas, entes, aptitudes, resultadosReubicacion, ausentismo } = v;
  if (!r) return <p className="p-10">No hay datos.</p>;
  // Lo que el médico guardó a mano no se filtra: si nombra la discapacidad, esta versión no se genera (el envío falla)
  const nombraDiscapacidad = mencionaDiscapacidad(v.informe);
  if (paraEmpresa && nombraDiscapacidad) notFound();
  const ajustesOrg = (org?.ajustes ?? {}) as { celda_minima_empresa?: number };
  const minimo = paraEmpresa ? (ajustesOrg.celda_minima_empresa ?? 3) : 0;
  const T = (p: Parameters<typeof Tabla>[0]) => <Tabla minimo={minimo} {...p} />;
  const g = <F extends { nombre: string; n: number }>(filas: F[]) => agrupar(filas, minimo);
  const cif = (n: number) => (minimo && n > 0 && n < minimo ? `<${minimo}` : num(n, 0));
  const soloEfectivos = r.criterio?.solo_efectivos ?? true;

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

  const art34 = filasArt34(r, acc?.accidentes, causas);

  return (
    <div data-informe className="papel min-h-dvh bg-neutral-100 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:bg-white">
      <BarraImpresion volver={volver} titulo={`Vigilancia epidemiológica · ${empresa?.razonSocial ?? "Todas las empresas"} · ${periodo.etiqueta}`} envio={empresa && !paraEmpresa && puedeEnviar ? { documento: "vigilancia", empresaId: empresa.id, empresa: empresa.razonSocial, bloqueo: !v.informe?.id ? "Guarda el informe antes de enviarlo (Reportes › Vigilancia › Guardar)." : nombraDiscapacidad ? "El análisis menciona discapacidad: edítalo antes de enviar." : null } : null} />

      <Portada
        logoEmpresa={logoEmpresa}
        orgLogo={org?.logo ?? null}
        empresa={empresa}
        firmantes={firmantes}
        fechaEmision={fechaEmisionDe(firmantes, v.informe?.actualizado_en, hoyCaracas())}
        titulo={titulo}
        subtitulo={subtitulo}
        periodo={periodo}
        poblacion={r.poblacion}
        org={org?.nombre ?? null}
      />

      {/* Índice justo después de la portada: las páginas se calculan al abrir */}
      <Hoja>
        <h2 className="mb-3 border-b border-doc-linea pb-1.5 text-[13px] font-extrabold uppercase tracking-[.08em] text-[#15201e]">Índice</h2>
        <IndiceInforme />
      </Hoja>

      {/* Resumen ejecutivo */}
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
            <span className="opacity-90">{num(pob, 0)} {soloEfectivos ? "trabajadores efectivos" : "trabajadores"}</span>
          </div>
        </div>
        <p className="mt-1.5 text-[9.5px] leading-snug text-doc-tenue">
          {soloEfectivos
            ? `Se consideran trabajadores efectivos los de tipo ${(r.criterio?.tipos ?? []).join(", ") || "—"}. Las consultas por motivo y por tipo de paciente incluyen a todos los pacientes.`
            : "Incluye a todos los pacientes de la empresa (también aspirantes, visitantes y particulares)."}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Kpi titulo="Consultas" valor={cif(r.consultas.total)} detalle={`${cif(r.consultas.pacientes)} pacientes · ${porc(r.consultas.pacientes, pob)} % de cobertura`} delta={actual && variacion(actual.consultas, previo?.consultas, contra)} />
          <Kpi titulo="Prevalencia de morbilidad" valor={minimo && (r.morbilidad.pacientes ?? 0) > 0 && (r.morbilidad.pacientes ?? 0) < minimo ? "—" : `${porc(r.morbilidad.pacientes ?? 0, pob)} %`} detalle={`${cif(r.morbilidad.total)} diagnósticos`} delta={actual && variacion(actual.diagnosticos, previo?.diagnosticos, contra)} />
          <Kpi titulo="Ausentismo" valor={`${num(ausentismo.pct)} %`} detalle={`Meta < 2,5 % · ${ausentismo.pct < 2.5 ? "dentro de la meta" : "sobre la meta"}`} delta={actual && variacion(actual.dias, previo?.dias, contra)} />
          <Kpi titulo="Días perdidos" valor={num(r.ausentismo.dias_computables, 0)} detalle={`${cif(r.ausentismo.reposos_iniciados ?? r.ausentismo.reposos)} reposos · PAD ${num(ausentismo.pad)}`} />
          <Kpi titulo="Accidentes de trabajo" valor={cif(acc?.accidentes ?? 0)} detalle={ix?.ifn !== null && ix?.ifn !== undefined ? `IFN ${num(ix.ifn)} · IS ${num(ix.is)}` : "Sin horas hombre registradas"} />
          <Kpi titulo="Preventivas" valor={`${porc(r.consultas.preventivas, r.consultas.total)} %`} detalle={`${cif(r.consultas.preventivas)} evaluaciones y controles`} />
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
              <div id="s-resumen" data-indice="Resumen ejecutivo y hallazgos clave" data-indice-nivel={1} className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-doc-acento">Resumen ejecutivo</div>
              <Texto>{t.resumen}</Texto>
            </div>
          </div>
        )}

        {s && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Panel ancla="i-consultas-mes" titulo="Consultas por mes"><Columnas alto={92} puntos={meses.map((m) => ({ etiqueta: nombreMes(m.mes), n: m.consultas }))} /><EjeMeses etiquetas={meses.map((m) => nombreMes(m.mes))} /></Panel>
            <Panel ancla="i-reposo-mes" titulo="Días de reposo por mes"><Columnas alto={92} serie={2} sufijo="días" puntos={meses.map((m) => ({ etiqueta: nombreMes(m.mes), n: m.dias_reposo }))} /><EjeMeses etiquetas={meses.map((m) => nombreMes(m.mes))} /></Panel>
          </div>
        )}

        <div className="mt-4 rounded-[10px] border border-doc-linea px-4 py-3 text-[10.5px]">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-doc-tenue">Identificación de la empresa</div>
          {empresa ? (
            <div className="grid grid-cols-3 gap-x-5 gap-y-0.5">
              <div><b>NIL:</b> {empresa.nil ?? <Falta />}</div>
              <div><b>Sector:</b> {empresa.sector ?? "—"}</div>
              <div><b>Teléfono:</b> {empresa.telefono ?? "—"}</div>
              <div className="col-span-3"><b>Actividad económica:</b> {empresa.actividad ?? <Falta />}</div>
              <div><b>Municipio:</b> {empresa.municipio ?? "—"}</div>
              <div><b>Parroquia:</b> {empresa.parroquia ?? "—"}</div>
              <div><b>Servicio de SST:</b> {empresa.servicioSst ?? "—"}</div>
              <div><b>Registro Servicio SST:</b> {empresa.servicioSstRegistro ? fechaCorta(empresa.servicioSstRegistro) : <Falta />}</div>
              <div><b>Registro PSST:</b> {empresa.psstRegistro ? fechaCorta(empresa.psstRegistro) : <Falta />}</div>
              <div><b>Trabajadores:</b> {pob} ({r.poblacion.femenino} F · {r.poblacion.masculino} M)</div>
            </div>
          ) : (
            <div>Consolidado de todas las empresas clientes del servicio.</div>
          )}
          {faltan.length > 0 && <p className="mt-1 font-semibold text-red-700 print:hidden">Datos legales incompletos: {faltan.join(", ")}. Complétalos en Empresas antes de consignar el informe.</p>}
        </div>
      </Hoja>

      <Hoja>
        <Seccion ancla="s-poblacion" n="1" titulo="Población trabajadora">
          <div className="grid grid-cols-[1.25fr_1fr] gap-3">
            {s && <Panel ancla="i-piramide" titulo="Pirámide por edad y sexo"><Piramide grupos={s.piramide} /></Panel>}
            <div className="space-y-3">
              <Panel ancla="i-sexo" titulo="Distribución por sexo"><Dona tam={84} partes={[{ nombre: "Hombres", n: r.poblacion.masculino }, { nombre: "Mujeres", n: r.poblacion.femenino }]} centro={num(pob, 0)} sub="trabajadores" /></Panel>
              <Panel ancla="i-vigilancia-clinica" titulo={paraEmpresa ? "Vigilancia clínica" : "Vigilancia clínica y discapacidad"} nota="Vigilancia: sobre la población actual, sin depender del período.">
                <T porcentaje={false} total={false} columnas={["Condición", "Trabajadores"]} filas={[
                  ["Vigilancia de origen ocupacional", r.poblacion.vigilancia_ocupacional ?? 0],
                  ["Vigilancia de origen no ocupacional", r.poblacion.vigilancia_no_ocupacional ?? 0],
                  ...(paraEmpresa ? [] : [["Con discapacidad registrada", r.poblacion.discapacidad ?? 0] as Celda[]]),
                ]} />
              </Panel>
            </div>
          </div>
          <Analisis texto={a.poblacion} />
          <Analisis texto={a.vigilancia_clinica} titulo="Vigilancia clínica" />
          {pob > 0 && pob < 10 && <p className="text-[10.5px] italic">Población menor a 10 trabajadores: índices de baja comparabilidad.</p>}
          <p className="text-[9px] italic text-doc-tenue">Trabajadores efectivos: activos o en reposo durante el período, y egresados después de su inicio.</p>
        </Seccion>

        <Seccion ancla="s-asistencial" n="2" titulo="Actividad asistencial">
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel ancla="i-tipo-atencion" titulo="Tipo de atención"><Dona tam={92} partes={[{ nombre: "Preventivas", n: r.consultas.preventivas }, { nombre: "Asistenciales", n: r.consultas.no_preventivas }]} centro={num(r.consultas.total, 0)} sub="consultas" /></Panel>
            <Panel ancla="i-condicion" titulo="Condición clínica"><Dona tam={92} partes={g([{ nombre: "Sanos", n: r.consultas.sanos }, { nombre: "Patológicos", n: r.consultas.patologicos ?? 0 }])} centro={num(r.consultas.pacientes, 0)} sub="pacientes" /></Panel>
            <Panel ancla="i-motivo" titulo="Consultas por motivo" className="col-span-2"><BarrasH filas={g(r.consultas.por_motivo)} max={10} /></Panel>
          </div>
          <Analisis texto={a.uso} />
          <Analisis texto={a.evaluaciones} />
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel ancla="i-tipo-paciente" titulo="Por tipo de paciente"><T columnas={["Tipo de paciente", "Casos"]} filas={(r.consultas.por_tipo_paciente ?? []).map((x) => [x.nombre, x.n])} /></Panel>
            <Panel ancla="i-sexo-edad" titulo="Por sexo y grupo etario">
              <T columnas={["Grupo", "Casos"]} filas={[["Masculino", r.consultas.por_sexo.M], ["Femenino", r.consultas.por_sexo.F]]} />
              <div className="mt-2" />
              <T columnas={["Grupo etario", "Casos"]} filas={r.consultas.por_edad.map((e) => [e.grupo, e.n])} />
            </Panel>
          </div>
          <Analisis texto={a.demografia} />
          <Panel ancla="i-dependencia" titulo="Frecuencia de uso del servicio médico por dependencia">
            <T columnas={["Dependencia", "Personal efectivo", "Consultas"]} porcentaje={false} filas={(r.consultas.por_dependencia ?? []).map((d) => [d.nombre, d.personal, d.n])} />
          </Panel>
          <Analisis texto={a.dependencias} />
        </Seccion>

        <Seccion ancla="s-morbilidad" n="3" titulo="Morbilidad">
          {s && <Panel ancla="i-pareto" titulo="Morbilidad por capítulo CIE-10 · diagrama de Pareto" nota="Barras: diagnósticos de cada grupo · línea: % acumulado · referencia: 80 %."><Pareto filas={g(s.capitulos)} max={9} /></Panel>}
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel ancla="i-sistemas" titulo="Por aparatos y sistemas"><BarrasH filas={g(r.morbilidad.por_sistema)} max={8} /></Panel>
            <Panel ancla="i-origen" titulo="Por origen"><Dona tam={92} partes={g(Object.entries(r.morbilidad.por_origen).map(([k, n]) => ({ nombre: ETIQUETA_ORIGEN[k as Origen] ?? k, n })))} centro={num(r.morbilidad.total, 0)} sub="diagnósticos" /></Panel>
          </div>
          <Analisis texto={a.morbilidad} />
          <div className="grid grid-cols-[1.6fr_1fr] items-start gap-3">
            <Panel ancla="i-primeras-causas" titulo="Diez primeras causas de morbilidad general" nota={`Prev.: pacientes sobre la población (${pob}) · Fcia.: diagnósticos.`}>
              <T columnas={["Diagnóstico (CIE-10)", "Prev. %", "Fcia."]} filas={causasFilas(r.morbilidad.primeras_causas, pob, minimo)} />
            </Panel>
            <Panel ancla="i-tipo-consulta" titulo="Frecuencia y prevalencia por tipo de consulta">
              <T columnas={["Consulta", "Pac.", "Prev. %", "Fcia."]} porcentaje={false} total={false}
                filas={(["primera", "sucesiva", "derivada"] as const).map((k) => { const x = r.morbilidad.por_tipo_consulta?.[k]; return [ETIQUETA_CLAVE[k], x?.pacientes ?? 0, porc(x?.pacientes ?? 0, pob), x?.n ?? 0]; })} />
            </Panel>
          </div>
          <Analisis texto={a.causas} />
          <p className="text-[9.5px] italic text-doc-tenue">Las diez primeras causas por tipo de consulta, origen, sexo, edad, actividad, sistema, motivo y dependencia van en el anexo estadístico, cada una con su análisis.</p>
        </Seccion>

        <Seccion ancla="s-ausentismo" n="4" titulo="Ausentismo laboral">
          <div className="grid grid-cols-[1fr_1.3fr] gap-3">
            <Panel ancla="i-ausentismo" titulo="Porcentaje de ausentismo">
              <div className="mb-2 font-cifra text-[26px] font-semibold leading-none text-doc-acento">{num(ausentismo.pct)} %</div>
              <Meta valor={ausentismo.pct} meta={2.5} />
              <div className="mt-2 text-[10px] text-doc-tenue">{num(r.ausentismo.dias_computables, 0)} días perdidos · {num(r.ausentismo.trabajadores_ausentes ?? 0, 0)} trabajadores ausentes · PAD {num(ausentismo.pad)}</div>
            </Panel>
            <Panel ancla="i-dias-causa" titulo="Días perdidos por causa"><BarrasH filas={r.ausentismo.por_causa.filter((c) => !minimo || c.n >= minimo).map((c) => ({ nombre: causas[c.nombre] ?? c.nombre, n: c.dias }))} sufijo="d" serie={2} /></Panel>
          </div>
          <Analisis texto={a.ausentismo} />
          <Indices filas={[
            ["Nro. de trabajadores", num(pob), soloEfectivos ? "Trabajadores efectivos de la empresa en el período." : "Trabajadores de la empresa en el período (todos los tipos)."],
            ["Nro. de reposos", num(r.ausentismo.reposos_iniciados ?? r.ausentismo.reposos), "Reposos iniciados en el período (los que vienen de antes cuentan sus días, no el caso)."],
            ["Trabajadores ausentes", num(r.ausentismo.trabajadores_ausentes ?? 0), "Trabajadores con algún día de reposo médico en el período."],
            ["Días cargados", num(r.ausentismo.dias_perdidos), "Días de reposo dentro del período, de todas las causas."],
            ["Días perdidos", num(r.ausentismo.dias_computables), "Días de reposo por causa médica; excluye pre y postnatal y los permisos."],
            ["Promedio de ausentismo diario (PAD)", num(ausentismo.pad), `PAD = días perdidos / días del lapso (${r.ausentismo.dias_periodo}).`],
            ["Porcentaje de ausentismo", `${num(ausentismo.pct)} %`, "%A = PAD × 100 / trabajadores. Meta internacional: menor a 2,5 %."],
          ]} />
          <Analisis texto={a.indices_ausentismo} titulo="Índices de ausentismo" />
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel ancla="i-reposo-causa" titulo="Reposos por causa"><T columnas={["Causa", "Casos", "Días"]} filas={r.ausentismo.por_causa.map((c) => [causas[c.nombre] ?? c.nombre, c.n, c.dias])} /></Panel>
            <Panel ancla="i-reposo-ente" titulo="Reposos por ente emisor"><T columnas={["Ente emisor", "Casos", "Días"]} filas={r.ausentismo.por_ente.map((c) => [entes[c.nombre] ?? c.nombre, c.n, c.dias ?? 0])} /></Panel>
            <Panel ancla="i-permisos" titulo="Permisos por causa" nota="No cuentan como ausentismo por razones de salud.">
              <T columnas={["Causa", "Casos", "Días"]} vacio="Sin permisos en el período." filas={(r.ausentismo.permisos ?? []).map((c) => [causas[c.nombre] ?? c.nombre, c.n, c.dias])} />
            </Panel>
          </div>
          <Panel ancla="i-causas-reposo" titulo="Diez primeras causas de reposo">
            <T columnas={["Diagnóstico (CIE-10)", "Días", "Casos"]} filas={reposoCausasFilas(r.ausentismo.primeras_causas ?? [], minimo)} />
          </Panel>
          <Analisis texto={a.causas_reposo} />
          <Analisis texto={a.reposos} titulo="Reposos por causa, ente emisor y permisos" />
        </Seccion>

        <Seccion ancla="s-accidentes" n="5" titulo="Accidentes y enfermedades ocupacionales">
          {acc && ix && (
            <div className="grid grid-cols-4 gap-2.5">
              <Kpi titulo="IFN" valor={num(ix.ifn)} detalle="Frecuencia neta" />
              <Kpi titulo="IFB" valor={num(ix.ifb)} detalle="Frecuencia bruta" />
              <Kpi titulo="IS" valor={num(ix.is)} detalle="Severidad" />
              <Kpi titulo="Declaradas a tiempo" valor={ix.aTiempo === null ? "—" : `${ix.aTiempo} %`} detalle={`${acc.por_declarar} por declarar`} />
            </div>
          )}
          <Analisis texto={a.accidentes} />
          <Panel ancla="i-accidentes" titulo="Accidentes e incidentes laborales">
            <Tabla columnas={["Fecha", "Tipo", "Lugar", "Lesión", "Estado", "Días perdidos"]} porcentaje={false} total={false} vacio="Sin accidentes ni incidentes en el período."
              filas={(r.accidentes ?? []).map((x) => [new Date(x.fecha).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" }), x.tipo, x.lugar ?? "—", [x.lesion, x.parte].filter(Boolean).join(" · ") || "—", x.estado, x.dias])} />
          </Panel>
          {acc && ix && (
            <Indices filas={[
              [acc.metodo === "same" ? "Horas hombre efectivas (HHE)" : "Horas hombre trabajadas (HHT)", num(acc.hht, 0), textoMetodoHoras(acc.metodo)],
              ["Índice de frecuencia neta (IFN)", num(ix.ifn), `IFN = lesiones con tiempo perdido (${acc.con_tiempo_perdido}) × 1.000.000 / HHT.`],
              ["Índice de frecuencia bruta (IFB)", num(ix.ifb), `IFB = lesiones totales (${acc.accidentes}) × 1.000.000 / HHT.`],
              ["Índice de severidad (IS)", num(ix.is), `IS = (días perdidos ${acc.dias_perdidos} + días cargados ${acc.dias_cargados}) × 1.000.000 / HHT.`],
              ["Casos de enfermedad ocupacional", num(r.enfermedad_ocupacional?.casos ?? 0), `Diagnosticadas en el período · ${num(r.enfermedad_ocupacional?.casos_anteriores ?? 0)} de años anteriores.`],
              ["Días perdidos por EO", num(r.enfermedad_ocupacional?.dias ?? 0), `Del período · ${num(r.enfermedad_ocupacional?.dias_anteriores ?? 0)} por casos anteriores.`],
              ["Tasa de ausentismo por EO (TAEO)", num(eo.taeo, 4), "TAEO = días perdidos por EO × 100 / HHT."],
              ["Tasa de incidencia de EO (TIEO)", num(eo.tieo), "TIEO = casos de EO × 1.000.000 / HHT."],
            ]} />
          )}
          <Analisis texto={a.indices_accidentes} titulo="Índices de accidentalidad y enfermedad ocupacional" />
        </Seccion>

        <Seccion ancla="s-referencias" n="6" titulo="Referencias y exámenes de salud">
          <div className="grid grid-cols-2 items-start gap-3">
            <Panel ancla="i-referencias" titulo="Referencias a especialidades"><BarrasH filas={g(r.referencias?.por_especialidad ?? [])} max={8} /></Panel>
            <Panel ancla="i-aptitud" titulo="Aptitud emitida"><Dona tam={92} partes={g(Object.entries(r.aptitud).map(([k, n]) => ({ nombre: aptitudes[k] ?? k, n })))} centro={num(Object.values(r.aptitud).reduce((x, y) => x + y, 0), 0)} sub="evaluaciones" /></Panel>
            <Panel ancla="i-externas" titulo="Especialidades por consulta externa">
              <T columnas={["Especialidad", "Consultas"]} vacio="Sin consultas externas ni especializadas en el período." filas={(r.especialidades_externas ?? []).map((x) => [x.nombre, x.n])} />
            </Panel>
            <Panel ancla="i-reubicaciones" titulo="Reubicaciones">
              <T columnas={["Resultado", "Casos"]} vacio="Sin reubicaciones en el período." filas={(r.reubicaciones?.por_resultado ?? []).map((x) => [resultadosReubicacion[x.nombre] ?? x.nombre, x.n])} />
            </Panel>
          </div>
          <Analisis texto={a.referencias} titulo="Referencias" />
          <Analisis texto={a.aptitud} titulo="Aptitud" />
          <Analisis texto={a.externas} titulo="Consulta externa" />
          <Analisis texto={a.reubicaciones} titulo="Reubicaciones" />
        </Seccion>

        <Seccion ancla="s-art34" n="7" titulo="Resumen del artículo 34 del Reglamento Parcial de la LOPCYMAT">
          <T columnas={["Concepto", "Total"]} porcentaje={false} total={false} filas={art34} />
          <Analisis texto={a.art34} />
          <p className="text-[9.5px] italic text-doc-tenue">La versión para cartelera de este cuadro va en la última hoja del informe.</p>
        </Seccion>

        <Seccion ancla="s-factores" n="8" titulo="Factores de riesgo, procesos peligrosos y efectos en la salud"><Texto>{t.factores_riesgo}</Texto></Seccion>
        <Seccion ancla="s-medidas" n="9" titulo="Medidas de control en la fuente, el ambiente y los trabajadores"><Texto>{t.medidas_control}</Texto></Seccion>

        <section id="s-conclusion" data-indice="10. Conclusión médico-ocupacional" data-indice-nivel={1} className="mb-5 break-inside-avoid rounded-[12px] bg-doc-acento px-5 py-4 text-white">
          <h2 className="mb-1.5 text-[12px] font-extrabold uppercase tracking-[.12em]">10 · Conclusión médico-ocupacional</h2>
          <div className="whitespace-pre-line text-[12px] leading-relaxed">{t.conclusiones}</div>
        </section>
        {t.vision_medico?.trim() && (
          // Si cruza de página, el borde y el fondo se repiten en cada trozo
          <section className="mb-5 rounded-r-[10px] border-l-4 border-doc-acento bg-doc-suave/60 px-5 py-3.5 [-webkit-box-decoration-break:clone] [box-decoration-break:clone]">
            <h2 className="mb-1.5 text-[12px] font-extrabold uppercase tracking-[.12em] text-doc-acento break-after-avoid">Visión del médico ocupacional</h2>
            <div className="whitespace-pre-line text-[12px] leading-relaxed">{t.vision_medico}</div>
            {firmantes.medico?.nombre && <div className="mt-2 text-right text-[10px] text-doc-tenue">— {firmantes.medico.nombre}, médico ocupacional</div>}
          </section>
        )}
        <Seccion ancla="s-rec-medicas" n="11" titulo="Recomendaciones médico-ocupacionales"><Texto>{t.recomendaciones_medicas}</Texto></Seccion>
        <Seccion ancla="s-rec-sst" n="12" titulo="Recomendaciones de seguridad y salud en el trabajo"><Texto>{t.recomendaciones}</Texto></Seccion>

        <p className="mt-6 text-[10px] italic text-doc-tenue">Las firmas de elaboración y aprobación están en la portada.</p>
      </Hoja>

      {/* Anexo: todos los cortes salen, también los vacíos, cada uno con su análisis */}
      <Hoja>
        <Seccion ancla="s-anexo" n="A" titulo="Anexo estadístico">
          {CORTES.map(([g, nombre]) => {
            const grupos = Object.keys(cortes[g] ?? {}).sort();
            return (
              <div key={g} id={`i-anexo-${g}`} data-indice={`Causas de morbilidad por ${nombre.toLowerCase()}`} className="space-y-2">
                <div className="text-[11px] font-bold text-doc-acento break-after-avoid">Diez primeras causas de morbilidad por {nombre.toLowerCase()}</div>
                {grupos.length ? (
                  <div className="grid grid-cols-2 items-start gap-3">
                    {grupos.map((k, i) => (
                      // Si quedan impares, el último ocupa el ancho completo (sin media columna vacía)
                      <Panel key={k} titulo={ETIQUETA_CLAVE[k] ?? k} className={grupos.length % 2 && i === grupos.length - 1 ? "col-span-2" : ""}><T columnas={["Diagnóstico", "Prev. %", "Fcia."]} filas={causasFilas(cortes[g][k], pob, minimo)} /></Panel>
                    ))}
                  </div>
                ) : <p className="text-[10.5px] italic text-doc-tenue">Sin registros en el período.</p>}
                <Analisis texto={a[`anexo_${g}` as SeccionAnalisis]} />
              </div>
            );
          })}
          {CAUSAS_REPOSO.map((c) => (
            <div key={c} className="space-y-2">
              <Panel ancla={`i-anexo-reposo-${c}`} titulo={`Causas de reposo por ${(causas[c] ?? c.replace("_", " ")).toLowerCase()}`}>
                <T columnas={["Ente emisor", "Diagnóstico", "Días", "Casos"]} texto={[1]} porcentaje={false} filas={detalleFilas((r.ausentismo.detalle ?? []).filter((d) => d.causa === c), entes, minimo)} />
              </Panel>
              <Analisis texto={a[`anexo_reposo_${c}` as SeccionAnalisis]} />
            </div>
          ))}
          <Panel ancla="i-anexo-reposo-dependencia" titulo="Causas de reposo por dependencia">
            <T columnas={["Dependencia", "Casos", "Días"]} filas={(r.ausentismo.por_dependencia ?? []).map((d) => [d.nombre, d.n, d.dias])} />
          </Panel>
          <Analisis texto={a.anexo_reposo_dependencia} />
          <p className="text-[9.5px] italic text-doc-tenue">Ningún cuadro identifica a trabajadores.{minimo > 0 && ` Las cifras menores de ${minimo} se muestran como «<${minimo}».`}</p>
        </Seccion>

        {/* Análisis integral: lee todos los cuadros y gráficos juntos (analizador propio, editable en Reportes) */}
        <Seccion ancla="s-integral" n="B" titulo="Análisis integral del período">
          <Bloque ancla="i-tendencias" titulo="Tendencia frente a períodos anteriores"><Texto>{a.tendencias ?? ""}</Texto></Bloque>
          <Bloque ancla="i-integral" titulo="Comportamiento de conjunto"><Texto>{a.integral ?? ""}</Texto></Bloque>
          <Bloque ancla="i-prioridades" titulo="Alertas y prioridades"><Prioridades texto={a.prioridades ?? ""} /></Bloque>
          <Bloque ancla="i-recomendaciones-empresa" titulo="Recomendaciones para la empresa"><Texto>{a.recomendaciones_empresa ?? ""}</Texto></Bloque>
          <section id="i-conclusion-final" data-indice="Conclusión final" className="break-inside-avoid rounded-[12px] bg-doc-acento px-5 py-4 text-white">
            <h3 className="mb-1.5 text-[12px] font-extrabold uppercase tracking-[.12em]">Conclusión final</h3>
            <div className="whitespace-pre-line text-[12px] leading-relaxed">{a.conclusion_final}</div>
          </section>
        </Seccion>
      </Hoja>


      {/* Hoja para cartelera: el resumen del art. 34 se publica a la vista de los trabajadores */}
      <Hoja>
        <Cartelera
          id="i-cartelera"
          filas={art34}
          empresa={empresa?.razonSocial ?? "Consolidado de empresas"}
          rif={empresa?.rif ?? null}
          titulo={titulo}
          subtitulo={subtitulo}
          desde={corta(periodo.desde)}
          hasta={corta(periodo.hasta)}
          poblacion={pob}
          org={org?.nombre ?? null}
          logo={org?.logo ?? null}
          minimo={minimo}
        />
      </Hoja>
    </div>
  );
}
