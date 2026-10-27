import type { Pivote } from "@/lib/reportes-listados";

const n = (x: number) => (x ? x.toLocaleString("es-VE") : "·");

// Relación de atención médica: empresas en filas, motivos en columnas, con totales y pacientes distintos
export function TablaPivote({ p }: { p: Pivote }) {
  if (!p.filas.length) return <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">Sin consultas en el período con estos filtros.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{p.titulo}</th>
            {p.columnas.map((c) => <th key={c} className="px-3 py-2 text-right font-medium">{c}</th>)}
            <th className="px-3 py-2 text-right font-semibold text-foreground">Consultas</th>
            <th className="px-3 py-2 text-right font-medium">Pacientes</th>
          </tr>
        </thead>
        <tbody>
          {p.filas.map((f) => (
            <tr key={f.nombre} className="border-t hover:bg-muted/30">
              <td className="px-3 py-1.5 font-medium">{f.nombre}</td>
              {f.celdas.map((x, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{n(x)}</td>)}
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{n(f.total)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{n(f.pacientes)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 bg-muted/40 font-semibold">
          <tr>
            <td className="px-3 py-2">Totales</td>
            {p.totales.map((x, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{n(x)}</td>)}
            <td className="px-3 py-2 text-right tabular-nums">{n(p.total)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n(p.pacientes)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
