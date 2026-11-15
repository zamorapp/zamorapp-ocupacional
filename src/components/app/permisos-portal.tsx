"use client";

import { Check } from "lucide-react";
import { PERMISOS_PORTAL, type PermisoPortal } from "@/lib/permisos-portal";
import { cn } from "@/lib/utils";

// Tres casillas grandes de un toque: qué puede hacer la persona de RR. HH. en el portal.
// Con `nombre` viajan en el formulario (name=permisos + marca permisos_enviados); sin él, avisa por onChange.
export function CasillasPermisos({ valor, onChange, nombre, compacto, deshabilitado }: {
  valor: PermisoPortal[] | null; onChange: (v: PermisoPortal[]) => void; nombre?: string; compacto?: boolean; deshabilitado?: boolean;
}) {
  const marcados = valor ?? PERMISOS_PORTAL.map((p) => p.clave);
  return (
    <fieldset className={compacto ? "flex flex-wrap items-center gap-1.5" : "grid grid-cols-1 gap-2 sm:grid-cols-3"} disabled={deshabilitado}>
      {compacto && <span className="mr-0.5 text-xs text-muted-foreground">Puede:</span>}
      {nombre && <input type="hidden" name={`${nombre}_enviados`} value="1" />}
      {PERMISOS_PORTAL.map((p) => {
        const si = marcados.includes(p.clave);
        return (
          <label key={p.clave} className={cn(
            "flex cursor-pointer items-start border text-left transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
            compacto ? "min-h-11 items-center gap-1.5 rounded-full px-3 py-1 sm:min-h-0" : "gap-2.5 rounded-lg px-3 py-2.5",
            si ? "border-primary/50 bg-primary/5" : "border-transparent bg-muted text-muted-foreground",
          )}>
            <input type="checkbox" name={nombre} value={p.clave} checked={si} className="sr-only"
              onChange={(e) => onChange(e.target.checked ? [...marcados, p.clave] : marcados.filter((c) => c !== p.clave))} />
            <span aria-hidden className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", si ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50")}>
              {si && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className={cn("block font-medium", compacto ? "whitespace-nowrap text-xs" : "text-sm", si ? "text-foreground" : "text-muted-foreground")}>{compacto ? p.corto : p.titulo}</span>
              {!compacto && <span className="block text-xs text-muted-foreground">{p.detalle}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
