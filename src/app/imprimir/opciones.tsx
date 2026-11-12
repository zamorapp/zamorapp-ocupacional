"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { OPCIONES_IMPRESION, type OpcionImpresion } from "@/lib/documentos-opciones";
import { cn } from "@/lib/utils";

// Qué incluir en esta impresión (como las casillas del SAME). Se guarda en la URL (?sin=…, ?copia=1|0) y no cambia la configuración.
// copia: estado actual de la copia de la constancia para el servicio médico (undefined = el documento no la tiene)
// revision: número de revisión de la consulta (>1 muestra la casilla «Aviso de revisión», apagada por defecto)
export function OpcionesImpresion({ disponibles, copia, revision }: { disponibles: OpcionImpresion[]; copia?: boolean; revision?: number }) {
  const router = useRouter();
  const ruta = usePathname();
  const q = useSearchParams();
  const sin = (q.get("sin") ?? "").split(",").filter(Boolean);
  const alternar = (k: OpcionImpresion) => {
    const nuevo = sin.includes(k) ? sin.filter((x) => x !== k) : [...sin, k];
    const p = new URLSearchParams(q);
    if (nuevo.length) p.set("sin", nuevo.join(","));
    else p.delete("sin");
    ir(p);
  };
  const ir = (p: URLSearchParams) => router.replace(`${ruta}${p.size ? `?${p}` : ""}`, { scroll: false });
  const alternarCopia = () => {
    const p = new URLSearchParams(q);
    p.set("copia", copia ? "0" : "1");
    ir(p);
  };
  const conRevision = q.get("rev") === "1";
  const alternarRevision = () => {
    const p = new URLSearchParams(q);
    if (conRevision) p.delete("rev");
    else p.set("rev", "1");
    ir(p);
  };
  const chip = (activo: boolean) => cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 transition", activo ? "border-primary bg-primary/10 text-primary" : "bg-white text-muted-foreground line-through decoration-1 hover:border-primary/50");
  return (
    <div className="mx-auto -mt-3 mb-5 flex max-w-[216mm] flex-wrap items-center gap-1.5 px-1 text-sm print:hidden">
      <span className="mr-1 text-muted-foreground">Incluir:</span>
      {disponibles.map((k) => {
        const incluido = !sin.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={incluido}
            onClick={() => alternar(k)}
            className={chip(incluido)}
          >
            {incluido && <Check className="size-3.5" />} {OPCIONES_IMPRESION[k]}
          </button>
        );
      })}
      {copia !== undefined && (
        <button type="button" aria-pressed={copia} onClick={alternarCopia} className={chip(copia)} title="Segunda hoja igual, marcada «Copia · Servicio médico»">
          {copia && <Check className="size-3.5" />} Copia para el servicio médico
        </button>
      )}
      {(revision ?? 1) > 1 && (
        <button type="button" aria-pressed={conRevision} onClick={alternarRevision} className={chip(conRevision)} title={`Pie de hoja: «Revisión ${revision}: reemplaza los impresos anteriores»`}>
          {conRevision && <Check className="size-3.5" />} Aviso de revisión {revision}
        </button>
      )}
    </div>
  );
}
