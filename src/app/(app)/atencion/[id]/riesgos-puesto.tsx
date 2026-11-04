"use client";

// Riesgos del puesto en la consulta (pedido de Cesar, 03-nov-2026): botones por categoría para elegir los que salen
// en la constancia y la orden, según el cargo evaluado o al que aspira el trabajador. Empieza con los de la matriz del
// cargo; lo elegido se guarda en ESTA consulta y no cambia la matriz del cargo (esa la evalúa el Servicio de SST).
import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { Item } from "@/lib/listas";
import { GRUPOS_RIESGO } from "@/lib/pacientes";
import { cn } from "@/lib/utils";

type Riesgos = Record<string, string[]>;

const iguales = (a: Riesgos, b: Riesgos) =>
  GRUPOS_RIESGO.every(([k]) => {
    const x = [...(a[k] ?? [])].sort(), y = [...(b[k] ?? [])].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  });

export function RiesgosPuesto({ valor, cargo, nombreCargo, catalogo, nota, onChange }: {
  valor: Riesgos | null | undefined; // null = aún no se tocó: se muestran los del cargo
  cargo: Riesgos;
  nombreCargo: string;
  catalogo: Item[];
  nota: string;
  onChange: (v: Riesgos | null) => void;
}) {
  const [otro, setOtro] = useState<Record<string, string>>({});
  const elegidos = valor ?? cargo;
  // Celular: abiertas solo las categorías con algo marcado (en pantallas medianas o grandes, todas)
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(GRUPOS_RIESGO.filter(([k]) => (elegidos[k] ?? []).length).map(([k]) => k)));
  const todasAbiertas = GRUPOS_RIESGO.every(([k]) => abiertas.has(k));
  const plegar = (g: string) => setAbiertas((a) => { const n = new Set(a); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const total = GRUPOS_RIESGO.reduce((n, [k]) => n + (elegidos[k]?.length ?? 0), 0);
  const delCargo = !valor || iguales(valor, cargo);

  const alternar = (g: string, agente: string) => {
    const lista = elegidos[g] ?? [];
    const nueva = lista.includes(agente) ? lista.filter((a) => a !== agente) : [...lista, agente];
    const siguiente: Riesgos = { ...elegidos, [g]: nueva };
    // Si vuelve a quedar igual al cargo, sigue «como el cargo»
    onChange(iguales(siguiente, cargo) ? null : siguiente);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          {nombreCargo ? <>Cargo: <b className="text-foreground">{nombreCargo}</b> · </> : null}
          {total ? `${total} ${total === 1 ? "riesgo marcado" : "riesgos marcados"}` : "Ningún riesgo marcado"}
          {delCargo ? " (los de la matriz del cargo)" : " (elegidos en esta consulta)"}
        </p>
        <button type="button" onClick={() => setAbiertas(new Set(todasAbiertas ? [] : GRUPOS_RIESGO.map(([k]) => k)))}
          className="text-xs font-medium text-primary hover:underline md:hidden">
          {todasAbiertas ? "Plegar las vacías" : "Ver todas"}
        </button>
        {!delCargo && (
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50">
            <RotateCcw className="size-3.5" /> Volver a los del cargo
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {GRUPOS_RIESGO.map(([g, nombre]) => {
          const marcados = elegidos[g] ?? [];
          const base = catalogo.filter((a) => a.grupo === g).map((a) => a.nombre);
          // Catálogo + los del cargo + los escritos a mano, sin repetir
          const opciones = [...new Set([...base, ...(cargo[g] ?? []), ...marcados])];
          return (
            <fieldset key={g} className={cn("min-w-0 rounded-lg border p-2.5", !abiertas.has(g) && "max-md:pb-0.5")}>
              <legend className="w-full px-0.5">
                <button type="button" onClick={() => plegar(g)} aria-expanded={abiertas.has(g)}
                  className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:pointer-events-none">
                  <span>{nombre} <span className="font-normal normal-case tracking-normal md:hidden">· {marcados.length}</span></span>
                  <span className="flex items-center gap-1">
                    {marcados.length > 0 && <span className="hidden rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary md:inline">{marcados.length}</span>}
                    <ChevronDown className={cn("size-4 transition-transform md:hidden", abiertas.has(g) && "rotate-180")} />
                  </span>
                </button>
              </legend>
              <div className={cn("mt-1.5 flex-wrap gap-1.5 md:flex", abiertas.has(g) ? "flex" : "hidden")}>
                {opciones.map((a) => {
                  const si = marcados.includes(a);
                  const enCargo = (cargo[g] ?? []).includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={si}
                      title={enCargo ? "Está en la matriz del cargo" : undefined}
                      onClick={() => alternar(g, a)}
                      className={cn(
                        // Tres estados (Diseño): relleno con ● = del cargo y marcado · relleno sin ● = agregado aquí ·
                        // punteado con ● = del cargo pero quitado aquí. Sin transición de color: nada intermedio parece un estado.
                        "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-left text-xs disabled:cursor-not-allowed disabled:opacity-70",
                        si ? "border-primary bg-primary text-primary-foreground"
                          : cn("text-muted-foreground hover:text-foreground hover:underline", enCargo && "border-dashed border-primary/70"),
                      )}
                    >
                      {enCargo && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", si ? "bg-primary-foreground" : "bg-primary")} />}
                      {a}
                    </button>
                  );
                })}
                <input
                  value={otro[g] ?? ""}
                  onChange={(e) => setOtro({ ...otro, [g]: e.target.value })}
                  onKeyDown={(e) => {
                    const v = otro[g]?.trim();
                    if (e.key === "Enter" && v) {
                      e.preventDefault();
                      if (!marcados.includes(v)) alternar(g, v);
                      setOtro({ ...otro, [g]: "" });
                    }
                  }}
                  aria-label={`Otro riesgo ${nombre.toLowerCase()}`}
                  placeholder="Otro… (Enter)"
                  className="h-8 w-32 rounded-full border border-dashed bg-transparent px-2.5 text-xs outline-none focus:border-primary disabled:hidden"
                />
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-2 py-0.5 text-primary-foreground"><span className="size-1.5 rounded-full bg-primary-foreground" />Ruido</span> del cargo y marcado</span>
        <span className="inline-flex items-center gap-1.5"><span className="rounded-full border border-primary bg-primary px-2 py-0.5 text-primary-foreground">Calor</span> agregado en esta consulta</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/70 px-2 py-0.5"><span className="size-1.5 rounded-full bg-primary" />Frío</span> del cargo, quitado aquí</span>
        <span>Lo marcado sale en la constancia y la orden de esta consulta; la matriz del cargo no cambia.</span>
      </div>
      {nota && <p className="border-t pt-2 text-[11px] italic leading-snug text-muted-foreground">{nota}</p>}
    </div>
  );
}
