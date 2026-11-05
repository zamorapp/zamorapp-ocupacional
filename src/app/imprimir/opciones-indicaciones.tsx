"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Pencil, Plus } from "lucide-react";
import { DIAS_TA, PLANES, clavesPlan, diasTa } from "@/lib/indicaciones-preventivas";
import { BOTONES_BIENESTAR, temasBienestar } from "@/lib/bienestar";
import { DIETAS, dietaDe, sumables } from "@/lib/dietas";
import { confirmar } from "@/components/app/confirmar";
import { cn } from "@/lib/utils";

const chip = (activo: boolean) =>
  cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 transition", activo ? "border-primary bg-primary/10 text-primary" : "bg-white text-muted-foreground hover:border-primary/50");

// Botones de las hojas de indicaciones: días del control de tensión, esquemas del plan de alimentación o temas de
// bienestar. Se guardan en la URL (?dias=, ?plan=, ?tema=) como las demás opciones de impresión.
export function OpcionesIndicaciones({ tipo }: { tipo: "control-ta" | "dieta" | "bienestar" }) {
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
  const dieta = dietaDe(q.get("dieta") ?? undefined).clave;
  const dias = diasTa(q.get("dias") ?? undefined);
  const temas = temasBienestar(q.get("tema") ?? undefined);
  // Otra dieta es otra hoja: los cambios hechos a la anterior no aplican (se avisa si había)
  const cambiarDieta = async (clave: string) => {
    if (clave === dieta) return;
    if (q.get("c") && !(await confirmar({ titulo: "¿Cambiar de dieta?", texto: "Se pierden los cambios que hizo en esta hoja.", accion: "Cambiar" }))) return;
    const p = new URLSearchParams(q);
    p.delete("c");
    if (clave === "general") p.delete("dieta");
    else p.set("dieta", clave);
    router.replace(`${ruta}${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  // Siempre queda al menos un tema: el último marcado no se puede quitar
  const cambiarTema = (clave: string) => {
    const nuevos = temas.includes(clave) ? temas.filter((x) => x !== clave) : [...temas, clave];
    if (!nuevos.length) return;
    ir("tema", nuevos.length === 1 && nuevos[0] === "pausas" ? null : nuevos.join(","));
  };
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
      ) : tipo === "bienestar" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-muted-foreground">Temas:</span>
          {BOTONES_BIENESTAR.map((t) => {
            const activo = temas.includes(t.clave);
            const unico = activo && temas.length === 1;
            return (
              <button key={t.clave} type="button" aria-pressed={activo} disabled={unico} title={unico ? "Debe quedar al menos un tema" : undefined} onClick={() => cambiarTema(t.clave)} className={cn(chip(activo), unico && "cursor-default")}>
                {activo ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} {t.boton}
              </button>
            );
          })}
        </div>
      ) : (
        <>
        {/* Una sola dieta completa por hoja, la del caso del trabajador */}
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Tipo de dieta">
          <span className="mr-1 font-medium">Tipo de dieta:</span>
          {DIETAS.map((x) => (
            <button key={x.clave} type="button" role="radio" aria-checked={dieta === x.clave} onClick={() => cambiarDieta(x.clave)} className={chip(dieta === x.clave)}>
              {dieta === x.clave && <Check className="size-3.5" />} {x.boton}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-muted-foreground">Sumar indicaciones de:</span>
          {PLANES.filter((p) => sumables(dietaDe(dieta), p.clave)).map((p) => {
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
        </>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Pencil className="size-3.5" /> Toque cualquier texto para cambiarlo; con ✕ quita un renglón y con «Agregar» suma otro. Vale solo para esta impresión.
      </p>
    </div>
  );
}
