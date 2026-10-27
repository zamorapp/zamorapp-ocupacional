import writeXlsxFile, { type Row, type Sheet } from "write-excel-file/node";
import { datosOrganizacion } from "@/lib/organizacion";
import { cargarListado, type ConsultaReporte } from "@/lib/reportes-listados";

export const dynamic = "force-dynamic";

const ENCABEZADO = { fontWeight: "bold", backgroundColor: "#E6F2F0" } as const;
const fechaExcel = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v.slice(0, 10) + "T00:00:00Z") : null);
const nombreArchivo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

// Excel del reporte: mismas filas y filtros que la pantalla, con fechas y números reales (se pueden sumar y filtrar)
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const q = Object.fromEntries(new URL(req.url).searchParams) as ConsultaReporte;
  const [l, org] = await Promise.all([cargarListado(tipo, q), datosOrganizacion()]);
  if (!l) return new Response("Reporte no encontrado", { status: 404 });
  const { def, periodo, empresa } = l;

  const cabecera: Row[] = [
    [{ value: org.nombre, fontWeight: "bold", fontSize: 13 }],
    [{ value: def.titulo, fontWeight: "bold", fontSize: 12 }],
    [`${empresa?.razonSocial ?? "Todas las empresas"} · ${def.periodo === false ? "Situación actual" : periodo.etiqueta}`],
    ...(Object.keys(l.activos).length || l.busqueda
      ? [[`Filtros: ${[...Object.entries(l.activos).map(([k, v]) => `${def.columnas.find((c) => c.k === k)?.t ?? k}: ${v}`), l.busqueda && `búsqueda «${l.busqueda}»`].filter(Boolean).join(" · ")}`] as Row]
      : []),
    ...((def.opciones ?? []).some((o) => l.opc[o.k])
      ? [[(def.opciones ?? []).filter((o) => l.opc[o.k]).map((o) => `${o.t}: ${o.valores.find(([v]) => v === l.opc[o.k])?.[1]}`).join(" · ")] as Row]
      : []),
    [],
  ];

  let datos: Row[];
  let anchos: number[];
  if (l.pivote) {
    const p = l.pivote;
    datos = [
      [p.titulo, ...p.columnas, "Consultas", "Pacientes"].map((value) => ({ value, ...ENCABEZADO })),
      ...p.filas.map((f) => [f.nombre, ...f.celdas, f.total, f.pacientes]),
      [{ value: "Totales", fontWeight: "bold" }, ...[...p.totales, p.total, p.pacientes].map((value) => ({ value, fontWeight: "bold" as const }))],
    ];
    anchos = [34, ...p.columnas.map((c) => Math.max(10, Math.min(22, c.length + 2))), 11, 11];
  } else {
    const cols = l.columnas;
    datos = [
      cols.map((c) => ({ value: c.t, ...ENCABEZADO })),
      ...l.filas.map((f) =>
        cols.map((c) => {
          const v = f[c.k];
          if (v === null || v === undefined || v === "") return null;
          if (c.tipo === "fecha") return { value: fechaExcel(v) ?? String(v), format: "dd/mm/yyyy" };
          if (c.tipo === "num") return Number(v);
          return String(v);
        }),
      ),
      ...(Object.keys(l.totales).length
        ? [cols.map((c, i) => (c.k in l.totales ? { value: l.totales[c.k], fontWeight: "bold" as const } : i === 0 ? { value: "Totales", fontWeight: "bold" as const } : null))]
        : []),
    ];
    anchos = cols.map((c) => c.ancho ?? (c.tipo === "num" ? 10 : 18));
  }

  const resumen: Row[] = [
    [{ value: def.titulo, fontWeight: "bold", fontSize: 12 }],
    [`${empresa?.razonSocial ?? "Todas las empresas"} · ${def.periodo === false ? "Situación actual" : periodo.etiqueta}`],
    [],
    ...l.indicadores.map((i) => [{ value: i.titulo, fontWeight: "bold" as const }, i.valor, i.detalle ?? ""] as Row),
    ...l.resumenes.flatMap((r) => [
      [] as Row,
      [{ value: r.titulo, ...ENCABEZADO }, { value: r.valor === "dias_periodo" ? "Días" : "Casos", ...ENCABEZADO }] as Row,
      ...r.filas.map((b) => [b.nombre, b.n] as Row),
    ]),
  ];

  const hojas: Sheet<Buffer>[] = [
    { data: [...cabecera, ...datos], sheet: def.corto.slice(0, 31), columns: anchos.map((width) => ({ width })), stickyRowsCount: cabecera.length + 1, orientation: def.horizontal ? "landscape" : undefined },
    { data: resumen, sheet: "Resumen", columns: [{ width: 40 }, { width: 14 }, { width: 30 }] },
  ];
  const buffer = await writeXlsxFile(hojas).toBuffer();
  const archivo = `${nombreArchivo(def.corto)}-${nombreArchivo(empresa?.razonSocial ?? "todas")}-${periodo.desde}-a-${periodo.hasta}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
