import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { porciento, type Cumplimiento, type Programa } from "@/lib/vigilancia-programas";

const pc = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-VE")} %`);

// Programas de vigilancia de la empresa con su cobertura en el período (los mismos números que el informe impreso)
export function ProgramasVigilancia({ programas, empresaId }: { programas: (Programa & { cumplimiento: Cumplimiento | null })[]; empresaId: string }) {
  if (!programas.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" aria-hidden /> Programas de vigilancia</CardTitle>
        <CardDescription>Cobertura en el período. Se configuran en la <Link href={`/empresas/${empresaId}#programas`} className="underline underline-offset-2">ficha de la empresa</Link>.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        {programas.map((p) => {
          const c = p.cumplimiento;
          return (
            <div key={p.id} className="min-w-0 space-y-2 rounded-lg border p-3">
              <div>
                <div className="font-medium">{p.nombre}</div>
                {p.riesgo ? <div className="text-muted-foreground">{p.riesgo}</div> : null}
              </div>
              {c ? (
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 font-cifra tabular-nums">
                  <dt className="font-sans text-muted-foreground">Trabajadores que cubre</dt><dd className="text-right">{c.poblacion.toLocaleString("es-VE")}</dd>
                  <dt className="font-sans text-muted-foreground">Evaluados en el período</dt><dd className="text-right">{c.evaluados.toLocaleString("es-VE")} · {pc(porciento(c.evaluados, c.poblacion))}</dd>
                  {c.examenes.map((e) => (
                    <div key={e.nombre} className="contents">
                      <dt className="font-sans text-muted-foreground">{e.nombre}{e.cada_meses ? ` (cada ${e.cada_meses} meses)` : ""}</dt>
                      <dd className="text-right">{e.hechos.toLocaleString("es-VE")} · {pc(porciento(e.hechos, c.poblacion))}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {p.metas.length ? <p className="text-xs text-muted-foreground">Metas: {p.metas.map((m) => `${m.indicador}${m.meta ? ` ${m.meta}` : ""}`).join(" · ")}</p> : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
