import writeXlsxFile, { type Cell, type Row } from "write-excel-file/node";
import { datosOrganizacion } from "@/lib/organizacion";
import { hoyCaracas } from "@/lib/fecha";
import { crearClienteServidor } from "@/lib/supabase/server";
import { COLUMNAS_NOMINA, PARA_VIGILANCIA, type CampoNomina } from "@/lib/nomina";
import { datosNomina } from "../importar/acciones-nomina";

export const dynamic = "force-dynamic";

const ENCABEZADO = { fontWeight: "bold", backgroundColor: "#E6F2F0", wrap: true } as const;
const FALTA = { backgroundColor: "#FFF4C2" } as const; // amarillo suave: dato que la vigilancia necesita y no está
const fechaExcel = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? { value: new Date(v + "T00:00:00Z"), format: "dd/mm/yyyy" } : null);
const nombreArchivo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

// Orden de las columnas de datos (después de la cédula), igual que COLUMNAS_NOMINA
const CAMPOS: CampoNomina[] = ["apellidos", "nombres", "sexo", "fechaNacimiento", "fechaIngreso", "cargo", "dependencia", "turno", "tipo", "telefono", "correo", "direccion", "ficha"];

// Plantilla de nómina para RR. HH. (Cesar, 04-nov-2026): la nómina actual de la empresa, prellenada. RR. HH. corrige lo
// que cambió, llena lo amarillo, agrega a los nuevos al final y escribe NO a quien ya no trabaja. Solo datos laborales y
// personales: nada clínico (ni diagnósticos, ni grupo sanguíneo, ni discapacidad).
export async function GET(req: Request) {
  const empresa = new URL(req.url).searchParams.get("empresa") ?? "";
  const [r, org] = await Promise.all([datosNomina(empresa, []), datosOrganizacion()]);
  if (!r.ok || !r.actuales) return new Response(r.mensaje, { status: 400 });
  const lista = [...r.actuales].sort((a, b) => a.apellidos.localeCompare(b.apellidos, "es") || a.nombres.localeCompare(b.nombres, "es"));
  const nombreEmpresa = lista[0]?.empresa || (await nombreDeEmpresa(empresa));
  const hoy = hoyCaracas().split("-").reverse().join("/");

  const fila = (a: (typeof lista)[number]): Row => [
    { value: a.cedula },
    ...CAMPOS.map((c): Cell => {
      const v = a[c];
      const falta = !v && PARA_VIGILANCIA.includes(c) ? FALTA : {};
      if (c === "fechaNacimiento" || c === "fechaIngreso") return fechaExcel(v) ?? { value: "", ...falta };
      return { value: v, ...falta };
    }),
    { value: "SÍ" },
  ];

  const datos: Row[] = [
    [{ value: org.nombre, fontWeight: "bold", fontSize: 13 }],
    [{ value: `Nómina de ${nombreEmpresa} · ${hoy}`, fontWeight: "bold", fontSize: 12 }],
    ["1) Corrija lo que cambió (cargo, departamento, turno, teléfono…). 2) Llene las celdas AMARILLAS: son datos que faltan para el informe de vigilancia."],
    ["3) Agregue al final a los trabajadores nuevos (con cédula, apellidos y nombres). 4) Escriba NO en la última columna a quien ya no trabaja en la empresa."],
    ["Fechas en dd/mm/aaaa. Sexo: F o M. Una celda vacía no borra nada. No cambie el orden ni el nombre de las columnas."],
    [],
    COLUMNAS_NOMINA.map((value) => ({ value, ...ENCABEZADO })),
    ...lista.map(fila),
  ];
  const anchos = [13, 20, 20, 9, 13, 13, 26, 22, 11, 16, 15, 26, 30, 11, 18];
  const buffer = await writeXlsxFile([{ data: datos, sheet: "Nómina", columns: anchos.map((width) => ({ width })), stickyRowsCount: 7 }]).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nomina-${nombreArchivo(nombreEmpresa) || "empresa"}-${hoyCaracas()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

async function nombreDeEmpresa(id: string) {
  const { data } = await (await crearClienteServidor()).from("empresas").select("razon_social").eq("id", id).maybeSingle();
  return data?.razon_social ?? "empresa";
}
