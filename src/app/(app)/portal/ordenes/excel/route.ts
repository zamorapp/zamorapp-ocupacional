import writeXlsxFile, { type Row } from "write-excel-file/node";
import { listarEmpresas, soloEmpresas } from "@/lib/empresas";
import { datosOrganizacion } from "@/lib/organizacion";
import { puedePortal } from "@/lib/permisos-portal";
import { obtenerSesion } from "@/lib/sesion";
import { rangoMes, relacionMensual, resumenRelacion } from "@/lib/ordenes";

export const dynamic = "force-dynamic";

const ENCABEZADO = { fontWeight: "bold", backgroundColor: "#E6F2F0" } as const;
const nombreArchivo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

// Excel de la relación del mes: mismas filas que la pantalla, con fechas reales para filtrar y cruzar con la factura
export async function GET(req: Request) {
  if (!puedePortal(await obtenerSesion(), "relacion")) return new Response("Sin permiso para ver los atendidos del mes", { status: 403 });
  const q = Object.fromEntries(new URL(req.url).searchParams);
  const empresas = soloEmpresas(await listarEmpresas(true));
  const empresa = empresas.find((e) => e.id === q.empresa) ?? (empresas.length === 1 ? empresas[0] : null);
  if (!empresa) return new Response("Elige la empresa", { status: 400 });
  const { mes, desde, hasta } = rangoMes(q.mes);
  const [filas, org] = await Promise.all([relacionMensual(empresa.id, desde, hasta), datosOrganizacion()]);
  const r = resumenRelacion(filas);

  const datos: Row[] = [
    [{ value: org.nombre, fontWeight: "bold", fontSize: 13 }],
    [{ value: "Relación de evaluaciones realizadas", fontWeight: "bold", fontSize: 12 }],
    [`${empresa.razonSocial} · ${mes}`],
    [`${r.total} realizadas · ${r.conOrden} con orden · ${r.facturadas} en nota de cobro`],
    [],
    ["Fecha", "Trabajador", "Cédula", "Cargo", "Evaluación", "Orden Nº", "Nota de cobro", "Estado del cobro", "Factura"].map((value) => ({ value, ...ENCABEZADO })),
    ...filas.map((f) => [
      { value: new Date(f.fecha + "T00:00:00Z"), format: "dd/mm/yyyy" },
      f.trabajador, f.cedula, f.cargo, f.evaluacion,
      f.orden, f.notaCobro, f.estadoCobro ?? "pendiente", f.factura,
    ] as Row),
  ];
  const buffer = await writeXlsxFile([{ data: datos, sheet: "Relación", columns: [12, 30, 14, 22, 26, 10, 12, 14, 14].map((width) => ({ width })), stickyRowsCount: 6 }]).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relacion-${nombreArchivo(empresa.razonSocial)}-${mes}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
