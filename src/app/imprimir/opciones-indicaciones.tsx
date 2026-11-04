"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Pencil, Plus } from "lucide-react";
import { DIAS_TA, PLANES, clavesPlan, diasTa } from "@/lib/indicaciones-preventivas";
import { cn } from "@/lib/utils";

const chip = (activo: boolean) =>
  cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 transition", activo ? "border-primary bg-primary/10 text-primary" : "bg-white text-muted-foreground hover:border-primary/50");

// Botones de las hojas de indicaciones: días del control de tensión o esquemas del plan de alimentación.
// Se guardan en la URL (?dias=, ?plan=) como las demás opciones de impresión.
export function OpcionesIndicaciones({ tipo }: { tipo: "control-ta" | "dieta" }) {
  const router = useRouter();
  const ruta = usePathname();
  const q = useSearchParams();
  const ir = (clave: string, valor: string | null) => {
    const p = new URLSearchParams(q);
    if (valor) p.set(clave, valor);
    else p.delete(clave);
    router.replace(`${ruta}${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  const planes = clavesPlan(q.get("plan") ?? undefined);
  const dias = diasTa(q.get("dias") ?? undefined);
  return (
    <div className="mx-auto -mt-2 mb-5 max-w-[216mm] space-y-2 px-1 text-sm print:hidden">
      {tipo === "control-ta" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-muted-foreground">Días:</span>
          {DIAS_TA.map((n) => (
            <button key={n} type="button" aria-pressed={dias === n} onClick={() => ir("dias", n === 7 ? null : String(n))} className={chip(dias === n)}>
              {dias === n && <Check className="size-3.5" />} {n} días
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-muted-foreground">Agregar esquema:</span>
          {PLANES.map((p) => {
            const activo = planes.includes(p.clave);
            return (
              <button
                key={p.clave}
                type="button"
                aria-pressed={activo}
                onClick={() => ir("plan", (activo ? planes.filter((x) => x !== p.clave) : [...planes, p.clave]).join(",") || null)}
                className={chip(activo)}
              >
                {activo ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} {p.boton}
              </button>
            );
          })}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Pencil className="size-3.5" /> Puede tocar cualquier texto de la hoja para cambiarlo antes de imprimir. El cambio vale solo para esta impresión.
      </p>
    </div>
  );
}
