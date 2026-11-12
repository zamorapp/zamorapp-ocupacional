import { ETIQUETA_APTITUD, type Aptitud } from "@/lib/pacientes";
import { fechaCorta, Hoja, Marca, Titular } from "../componentes";

export type FilaRelacion = { id: string; trabajador: string; cedula: string; edad: number | null; sexo: string | null; cargo: string | null; telefono: string | null; fecha: string; evaluacion: string | null; aptitud: string | null };

const celda = "border border-neutral-300 px-1.5 py-[3.5px] align-top";
const cifra = "font-cifra whitespace-nowrap text-[8.5pt]";
// Anchos fijos (en % de la hoja): nombre y cargo con espacio, para que casi ninguna fila se parta en dos renglones
const COLUMNAS: [string, string][] = [["Nº", "3.5%"], ["Trabajador", "20%"], ["Cédula", "10%"], ["Edad", "4.5%"], ["Sexo", "4.5%"], ["Cargo", "15%"], ["Teléfono", "10.5%"], ["Fecha", "9%"], ["Evaluación", "10.5%"], ["Resultado", "12.5%"]];

// Letra de 9 pt y filas de ~6 mm en hoja apaisada: 22 a 25 trabajadores por hoja (Cesar pidió 18 a 20 como mínimo).
// El encabezado de la tabla se repite en cada hoja; cédula, teléfono y fecha en cifras de ancho fijo.
export function TablaRelacion({ filas }: { filas: FilaRelacion[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-[9pt] leading-tight">
      <colgroup>{COLUMNAS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
      <thead>
        <tr className="bg-teal-50">
          {COLUMNAS.map(([h]) => <th key={h} className={`${celda} py-1 text-left`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={f.id} className="break-inside-avoid">
            <td className={`${celda} text-right tabular-nums`}>{i + 1}</td>
            <td className={`${celda} font-medium`}>{f.trabajador}</td>
            <td className={`${celda} ${cifra}`}>{f.cedula}</td>
            <td className={`${celda} text-center tabular-nums`}>{f.edad ?? ""}</td>
            <td className={`${celda} text-center`}>{f.sexo ?? ""}</td>
            <td className={celda}>{f.cargo ?? ""}</td>
            <td className={`${celda} ${cifra}`}>{f.telefono ?? ""}</td>
            <td className={`${celda} ${cifra}`}>{fechaCorta(f.fecha)}</td>
            <td className={celda}>{f.evaluacion ?? ""}</td>
            <td className={`${celda} font-medium`}>{f.aptitud ? ETIQUETA_APTITUD[f.aptitud as Aptitud] : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Org = { nombre?: unknown; rif?: unknown; logo?: unknown; ajustes?: unknown } | null;

// Texto seguro dentro de una cadena CSS (el nombre de la empresa lo escribe el usuario)
const cssTexto = (t: string) => `"${t.replace(/[\\"]/g, "\\$&").replace(/[\n\r<>]/g, " ")}"`;

export function HojaRelacion({ org, empresa, desde, hasta, cobro, filas }: { org: Org; empresa: string; desde: string; hasta: string; cobro: { numero: number; factura: string } | null; filas: FilaRelacion[] }) {
  // Totales por resultado: lo que la empresa quiere saber de un vistazo (arriba y al pie)
  const porResultado = new Map<string, number>();
  for (const f of filas) {
    const r = f.aptitud ? ETIQUETA_APTITUD[f.aptitud as Aptitud] : "Sin resultado";
    porResultado.set(r, (porResultado.get(r) ?? 0) + 1);
  }
  const resumen = [...porResultado.entries()].map(([r, n]) => `${r}: ${n}`).join(" · ");
  // Desde la hoja 2, arriba: de qué relación es la hoja (si se separan, cada una dice de dónde viene)
  const cabecera = ["Relación de pacientes atendidos", empresa, `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`, cobro ? `Nota Nº ${cobro.numero}` : null].filter(Boolean).join(" · ");
  const css = `@page apaisada { @top-left { content: ${cssTexto(`${cabecera} · Hoja `)} counter(page) " de " counter(pages); font: 7pt ui-sans-serif, system-ui, sans-serif; color: #55625f; } }
@page apaisada:first { @top-left { content: ""; } }`;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <Hoja horizontal>
        <header className="mb-3 flex items-start justify-between gap-4 border-b-2 border-teal-700 pb-2">
          <div className="flex items-center gap-3">
            <Marca logo={org?.logo as string | null | undefined} nombre={String(org?.nombre ?? "")} />
            <div>
              <div className="text-base font-bold uppercase text-teal-800">{String(org?.nombre ?? "")}</div>
              <Titular ajustes={org?.ajustes} />
              <div className="text-[10.5px] text-neutral-600">{org?.rif ? `RIF ${String(org.rif)}` : ""}</div>
            </div>
          </div>
          <div className="text-right text-[12px]">
            <div className="font-bold uppercase">Relación de pacientes atendidos</div>
            <div>{empresa}</div>
            <div className="text-[10.5px] text-neutral-600">
              Del {fechaCorta(desde)} al {fechaCorta(hasta)}
              {cobro && ` · Nota de cobro Nº ${cobro.numero}${cobro.factura ? ` · Factura Nº ${cobro.factura}` : ""}`}
            </div>
          </div>
        </header>
        <p className="mb-2 text-[9pt]">
          <b>{filas.length}</b> {filas.length === 1 ? "trabajador evaluado" : "trabajadores evaluados"}{resumen && ` · ${resumen}`}
        </p>
        <TablaRelacion filas={filas} />
        {filas.length === 0 ? (
          <p className="mt-6 text-center text-neutral-500">Sin pacientes atendidos en el período.</p>
        ) : (
          <div className="mt-4 break-inside-avoid text-[9pt]">
            <p><b>Total: {filas.length}</b>{resumen && ` · ${resumen}`}</p>
            <div className="mt-9 grid grid-cols-3 gap-6 text-[8.5pt] text-neutral-700">
              <div className="border-t border-neutral-500 pt-1">Recibido por (RR. HH.): nombre</div>
              <div className="border-t border-neutral-500 pt-1">Firma</div>
              <div className="border-t border-neutral-500 pt-1">Fecha</div>
            </div>
          </div>
        )}
        <p className="mt-4 text-[8pt] italic text-neutral-600">Documento administrativo: no contiene diagnósticos ni datos clínicos.</p>
      </Hoja>
    </>
  );
}
