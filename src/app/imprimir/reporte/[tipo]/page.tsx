import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatoCelda, reporte, type Columna } from "@/lib/reportes-catalogo";
import { supabaseConfigurado } from "@/lib/config";
import { cargarListado, parametrosListado, type ConsultaReporte, type Fila } from "@/lib/reportes-listados";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { fechaCorta, Hoja, Membrete, Pie } from "../../componentes";
import { ahora } from "@/lib/fecha";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tipo: string }>; searchParams: Promise<ConsultaReporte> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: reporte((await params).tipo)?.titulo ?? "Reporte" };
}

const th = "border border-doc-linea bg-doc-suave px-1.5 py-1 text-left font-bold";
const td = "border border-doc-linea px-1.5 py-[3px] align-top";

function Resumen({ titulo, filas, valor }: { titulo: string; filas: { nombre: string; n: number }[]; valor?: string }) {
  const total = filas.reduce((s, f) => s + f.n, 0);
  return (
    <div className="break-inside-avoid">
      <div className="mb-1 text-[9.5px] font-extrabold uppercase tracking-[.11em] text-doc-acento">{titulo}</div>
      <table className="w-full border-collapse text-[10px]">
        <tbody>
          {filas.map((f) => (
            <tr key={f.nombre}>
              <td className={td}>{f.nombre}</td>
              <td className={`${td} w-12 text-right font-cifra`}>{f.n.toLocaleString("es-VE")}{valor === "dias_periodo" ? " d" : ""}</td>
              <td className={`${td} w-12 text-right font-cifra text-doc-tenue`}>{total ? `${Math.round((f.n * 1000) / total) / 10}%` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cabecera({ cols }: { cols: Columna[] }) {
  return (
    <thead>
      <tr>{cols.map((c) => <th key={c.k} className={`${th} ${c.tipo === "num" ? "text-right" : ""}`}>{c.t}</th>)}</tr>
    </thead>
  );
}

function Celdas({ cols, f }: { cols: Columna[]; f: Fila }) {
  return (
    <tr className="break-inside-avoid">
      {cols.map((c) => <td key={c.k} className={`${td} ${c.tipo === "num" || c.tipo === "fecha" ? "whitespace-nowrap font-cifra" : ""} ${c.tipo === "num" ? "text-right" : ""}`}>{formatoCelda(c, f[c.k])}</td>)}
    </tr>
  );
}

// Reporte impreso (o PDF): membrete con los logos del servicio y de la empresa, resumen y la tabla completa
export default async function ImprimirReporte({ params, searchParams }: Props) {
  const [{ tipo }, q] = await Promise.all([params, searchParams]);
  const l = await cargarListado(tipo, q);
  if (!l) notFound();
  const { def, periodo, empresa, sesion } = l;
  const supabase = supabaseConfigurado && !sesion.demo ? await crearClienteServidor() : null;
  const [{ data: org }, { data: emp }] = await Promise.all([
    supabase && sesion.orgId ? supabase.from("organizaciones").select("nombre, rif, direccion, telefono, logo, ajustes").eq("id", sesion.orgId).maybeSingle() : Promise.resolve({ data: null }),
    supabase && empresa ? supabase.from("empresas").select("razon_social, logo").eq("id", empresa.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const membrete = {
    org: { nombre: org?.nombre ?? sesion.organizacion, rif: org?.rif ?? null, direccion: org?.direccion ?? null, telefono: org?.telefono ?? null, logo: org?.logo ?? null, ajustes: org?.ajustes ?? {} },
    empresa: { razon_social: emp?.razon_social ?? "Todas las empresas", logo: emp?.logo ?? null },
  } as Parameters<typeof Membrete>[0]["d"];
  const impreso = { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(ahora())) };

  // Consolidado: se agrupa por empresa (o por el grupo de la morbilidad) con subtotal; la columna agrupada sobra
  const agrupar = l.agrupar && l.filas.length > 0 ? l.agrupar : null;
  const colsTabla = l.columnas.filter((c) => !(c.k === agrupar || (empresa && c.k === "empresa")));
  const grupos = agrupar
    ? [...l.filas.reduce((m, f) => m.set(String(f[agrupar] ?? "Sin dato"), [...(m.get(String(f[agrupar] ?? "Sin dato")) ?? []), f]), new Map<string, Fila[]>())]
    : [["", l.filas] as [string, Fila[]]];
  const filtros = [
    ...Object.entries(l.activos).map(([k, v]) => `${def.columnas.find((c) => c.k === k)?.t ?? k}: ${v}`),
    l.busqueda && `búsqueda «${l.busqueda}»`,
    ...(def.opciones ?? []).filter((o) => l.opc[o.k]).map((o) => `${o.t}: ${o.valores.find(([v]) => v === l.opc[o.k])?.[1] ?? l.opc[o.k]}`),
  ].filter(Boolean);
  const subtotal = (fs: Fila[]) => Object.fromEntries(colsTabla.filter((c) => c.total).map((c) => [c.k, fs.reduce((s, f) => s + Number(f[c.k] ?? 0), 0)]));
  const filaTotal = (t: Record<string, number>, etiqueta: string) => (
    <tr className="bg-doc-suave font-bold">
      {colsTabla.map((c, i) => <td key={c.k} className={`${td} ${c.tipo === "num" ? "text-right font-cifra" : ""}`}>{c.k in t ? t[c.k].toLocaleString("es-VE") : i === 0 ? etiqueta : ""}</td>)}
    </tr>
  );

  return (
    <div className="min-h-dvh bg-neutral-100 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:bg-white">
      <BarraImpresion volver={`/reportes/${def.clave}?${parametrosListado(q, empresa?.id ?? null)}`} titulo={def.titulo} />
      <Hoja horizontal={def.horizontal} className="!min-h-0">
        <Membrete d={membrete} compacto />

        <div className="mt-4 mb-3 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold leading-tight tracking-tight">{def.titulo}</h1>
            <span className="mt-1 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">
              {def.periodo === false ? "Situación actual" : periodo.etiqueta}
            </span>
          </div>
          <div className="shrink-0 text-right font-cifra text-[10px] leading-relaxed text-doc-tenue">
            {def.periodo !== false && <div>Del <b className="font-medium text-[#15201e]">{fechaCorta(periodo.desde)}</b> al <b className="font-medium text-[#15201e]">{fechaCorta(periodo.hasta)}</b></div>}
            <div>Registros <b className="font-medium text-[#15201e]">{l.filas.length.toLocaleString("es-VE")}</b></div>
          </div>
        </div>
        {filtros.length > 0 && <p className="mb-2 text-[10px] text-doc-tenue">Filtros: {filtros.join(" · ")}</p>}

        <div className="mb-3 grid grid-cols-4 overflow-hidden rounded-lg border border-doc-linea">
          {l.indicadores.map((i) => (
            <div key={i.titulo} className="border-r border-doc-linea px-3 py-1.5 last:border-r-0">
              <div className="text-[8.5px] font-semibold uppercase tracking-[.11em] text-doc-tenue">{i.titulo}</div>
              <div className="text-[15px] font-extrabold">{i.valor}</div>
              {i.detalle && <div className="truncate text-[9px] text-doc-tenue">{i.detalle}</div>}
            </div>
          ))}
        </div>

        {l.filas.length > 0 && (
          <div className={`mb-4 grid gap-4 ${def.horizontal ? "grid-cols-3" : "grid-cols-2"}`}>
            {l.resumenes.map((r) => <Resumen key={r.titulo} titulo={r.titulo} filas={r.filas} valor={r.valor} />)}
          </div>
        )}

        {l.pivote ? (
          // Muchos motivos no caben a lo ancho: se parte en bloques de 9 columnas, cada uno con sus totales
          Array.from({ length: Math.ceil(l.pivote.columnas.length / 9) || 1 }, (_, b) => {
            const p = l.pivote!;
            const idx = p.columnas.map((_, i) => i).slice(b * 9, b * 9 + 9);
            return (
              <table key={b} className="mb-3 w-full border-collapse text-[9.5px]">
                <thead>
                  <tr>
                    <th className={`${th} w-48`}>{p.titulo}</th>
                    {idx.map((i) => <th key={i} className={`${th} text-right`}>{p.columnas[i]}</th>)}
                    <th className={`${th} w-16 text-right`}>Consultas</th>
                    <th className={`${th} w-16 text-right`}>Pacientes</th>
                  </tr>
                </thead>
                <tbody>
                  {p.filas.map((f) => (
                    <tr key={f.nombre} className="break-inside-avoid">
                      <td className={td}>{f.nombre}</td>
                      {idx.map((i) => <td key={i} className={`${td} text-right font-cifra`}>{f.celdas[i] || ""}</td>)}
                      <td className={`${td} text-right font-cifra font-bold`}>{f.total}</td>
                      <td className={`${td} text-right font-cifra`}>{f.pacientes}</td>
                    </tr>
                  ))}
                  <tr className="bg-doc-suave font-bold">
                    <td className={td}>Totales</td>
                    {idx.map((i) => <td key={i} className={`${td} text-right font-cifra`}>{p.totales[i]}</td>)}
                    <td className={`${td} text-right font-cifra`}>{p.total}</td>
                    <td className={`${td} text-right font-cifra`}>{p.pacientes}</td>
                  </tr>
                </tbody>
              </table>
            );
          })
        ) : l.filas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-doc-linea py-8 text-center text-doc-tenue">Sin registros en el período con estos filtros.</p>
        ) : (
          <table className="w-full border-collapse text-[9.5px] leading-snug">
            <Cabecera cols={colsTabla} />
            <tbody>
              {grupos.map(([nombre, fs]) => [
                agrupar && (
                  <tr key={`g-${nombre}`} className="break-after-avoid">
                    <td colSpan={colsTabla.length} className="border border-doc-linea bg-[#eef5f3] px-1.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-doc-acento">
                      {nombre} <span className="font-cifra font-medium normal-case text-doc-tenue">· {fs.length.toLocaleString("es-VE")} {fs.length === 1 ? "registro" : "registros"}</span>
                    </td>
                  </tr>
                ),
                ...fs.map((f, i) => <Celdas key={`${nombre}-${String(f.id ?? "")}-${i}`} cols={colsTabla} f={f} />),
                agrupar && colsTabla.some((c) => c.total) && <Fragment key={`s-${nombre}`}>{filaTotal(subtotal(fs), "Subtotal")}</Fragment>,
              ])}
            </tbody>
            {Object.keys(l.totales).length > 0 && <tfoot className="[display:table-row-group]">{filaTotal(l.totales, "Totales")}</tfoot>}
          </table>
        )}

        {def.nota && <p className="mt-3 text-[9.5px] italic text-doc-tenue">{def.nota}</p>}
        <p className="mt-1 text-[9.5px] italic text-doc-tenue">Solo cuentan las consultas cerradas o firmadas.{def.clinico ? " Documento con datos médicos confidenciales." : ""}</p>
        <Pie d={{ impreso }} derecha={`zamorApp · ${def.corto}`} />
      </Hoja>
    </div>
  );
}
