"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { OPCIONES_IMPRESION, type OpcionImpresion } from "@/lib/documentos-opciones";
import { cn } from "@/lib/utils";

// Qué incluir en esta impresión (como las casillas del SAME). Se guarda en la URL (?sin=…) y no cambia la configuración.
export function OpcionesImpresion({ disponibles }: { disponibles: OpcionImpresion[] }) {
  const router = useRouter();
  const ruta = usePathname();
  const q = useSearchParams();
  const sin = (q.get("sin") ?? "").split(",").filter(Boolean);
  const alternar = (k: OpcionImpresion) => {
    const nuevo = sin.includes(k) ? sin.filter((x) => x !== k) : [...sin, k];
    const p = new URLSearchParams(q);
    if (nuevo.length) p.set("sin", nuevo.join(","));
    else p.delete("sin");
    router.replace(`${ruta}${p.size ? `?${p}` : ""}`, { scroll: false });
  };
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
            className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 transition", incluido ? "border-primary bg-primary/10 text-primary" : "bg-white text-muted-foreground line-through decoration-1 hover:border-primary/50")}
          >
            {incluido && <Check className="size-3.5" />} {OPCIONES_IMPRESION[k]}
          </button>
        );
      })}
    </div>
  );
}
