import writeXlsxFile, { type Row } from "write-excel-file/node";
import { datosOrganizacion } from "@/lib/organizacion";
import { candidatosInactivar } from "../acciones";
import { COLUMNA_SIGUE } from "@/lib/depurar";

export const dynamic = "force-dynamic";

const ENCABEZADO = { fontWeight: "bold", backgroundColor: "#E6F2F0" } as const;
const fechaExcel = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? { value: new Date(v.slice(0, 10) + "T00:00:00Z"), format: "dd/mm/yyyy" } : null);
const nombreArchivo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

// Excel para RR. HH. (Cesar, 31-oct): la lista de quienes no tienen consulta desde la fecha elegida. RR. HH. escribe NO
// a los que ya no están; Cesar lo sube y confirma antes de inactivar. Solo datos laborales (nada clínico).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const empresa = q.get("empresa") || null;
  const desde = q.get("desde") ?? "";
  const [r, org] = await Promise.all([candidatosInactivar(empresa, desde), datosOrganizacion()]);
  if (!r.ok || !r.candidatos) return new Response(r.mensaje, { status: 400 });
  const lista = r.candidatos;
  const nombreEmpresa = empresa ? lista[0]?.empresa ?? "" : "Todas las empresas";

  const datos: Row[] = [
    [{ value: org.nombre, fontWeight: "bold", fontSize: 13 }],
    [{ value: `Confirmación de nómina · ${nombreEmpresa}`, fontWeight: "bold", fontSize: 12 }],
    [`Trabajadores sin evaluación médica desde el ${desde.split("-").reverse().join("/")}. Escriba NO en la última columna a quien ya no trabaja en la empresa.`],
    [],
    ["Cédula", "Apellidos", "Nombres", ...(empresa ? [] : ["Empresa"]), "Cargo", "Ingreso", "Última evaluación", COLUMNA_SIGUE].map((value) => ({ value, ...ENCABEZADO })),
    ...lista.map((c) => [c.cedula, c.apellidos, c.nombres, ...(empresa ? [] : [c.empresa]), c.cargo ?? "", fechaExcel(c.fechaIngreso), fechaExcel(c.ultimaConsulta), "SÍ"] as Row),
  ];
  const anchos = [14, 22, 22, ...(empresa ? [] : [26]), 26, 12, 16, 30];
  const buffer = await writeXlsxFile([{ data: datos, sheet: "Nómina", columns: anchos.map((width) => ({ width })), stickyRowsCount: 5 }]).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="confirmar-nomina-${nombreArchivo(nombreEmpresa) || "empresa"}-${desde}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
