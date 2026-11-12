import { ETIQUETA_APTITUD, type Aptitud } from "@/lib/pacientes";
import { fechaCorta } from "../componentes";

export type FilaRelacion = { id: string; trabajador: string; cedula: string; edad: number | null; sexo: string | null; cargo: string | null; telefono: string | null; fecha: string; evaluacion: string | null; aptitud: string | null };

const celda = "border border-neutral-300 px-1 py-[1.5px] align-top";
const COLUMNAS = ["Nº", "Trabajador", "Cédula", "Edad", "Sexo", "Cargo", "Teléfono", "Fecha", "Evaluación", "Resultado"];

// Filas bajas (letra 10 px) y hoja apaisada: entran 25 o más trabajadores por hoja; el encabezado se repite en cada hoja
export function TablaRelacion({ filas }: { filas: FilaRelacion[] }) {
  return (
    <table className="w-full border-collapse text-[10px] leading-tight">
      <thead>
        <tr className="bg-teal-50">
          {COLUMNAS.map((h) => <th key={h} className={`${celda} py-1 text-left`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={f.id} className="break-inside-avoid">
            <td className={`${celda} text-right tabular-nums`}>{i + 1}</td>
            <td className={`${celda} font-medium`}>{f.trabajador}</td>
            <td className={`${celda} whitespace-nowrap tabular-nums`}>{f.cedula}</td>
            <td className={`${celda} text-center tabular-nums`}>{f.edad ?? ""}</td>
            <td className={`${celda} text-center`}>{f.sexo ?? ""}</td>
            <td className={celda}>{f.cargo ?? ""}</td>
            <td className={`${celda} whitespace-nowrap tabular-nums`}>{f.telefono ?? ""}</td>
            <td className={`${celda} whitespace-nowrap tabular-nums`}>{fechaCorta(f.fecha)}</td>
            <td className={celda}>{f.evaluacion ?? ""}</td>
            <td className={`${celda} font-medium`}>{f.aptitud ? ETIQUETA_APTITUD[f.aptitud as Aptitud] : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
