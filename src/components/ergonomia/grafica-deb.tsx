// Gráfica del DEB: los 5 peligros ordenados por prioridad, con el color de su zona y sus alertas adicionales.
// Sin estado ni efectos: sirve en la pantalla y en el informe impreso.
import { TEXTO_ZONA, type ResultadoFactor, type ZonaDeb } from "@/lib/ergonomia-deb";
import { cn } from "@/lib/utils";

const NIVEL: Record<ZonaDeb, number> = { no: 0, verde: 1, amarillo: 2, rojo: 3 };
const COLOR: Record<ZonaDeb, string> = { no: "bg-muted", verde: "bg-emerald-500", amarillo: "bg-amber-400", rojo: "bg-red-600" };
const TEXTO: Record<ZonaDeb, string> = { no: "text-muted-foreground", verde: "text-emerald-700 dark:text-emerald-400", amarillo: "text-amber-700 dark:text-amber-400", rojo: "text-red-700 dark:text-red-400" };

export function GraficaDeb({ factores, impreso }: { factores: ResultadoFactor[]; impreso?: boolean }) {
  return (
    <ol className={cn("space-y-2", impreso && "space-y-1.5")} aria-label="Peligros del puesto por prioridad">
      {factores.map((f) => {
        const z = f.zona ?? "no";
        return (
          <li key={f.clave} className="break-inside-avoid">
            <div className={cn("flex items-baseline justify-between gap-2", impreso ? "text-[10px]" : "text-xs")}>
              <span className={cn("font-medium", z === "no" && "text-muted-foreground")}>{f.nombre}</span>
              <span className={cn("shrink-0 font-semibold", TEXTO[z])}>{f.zona ? (z === "no" ? "No presente" : TEXTO_ZONA[z].split(":")[0]) : "Falta responder"}</span>
            </div>
            <div className={cn("mt-1 grid grid-cols-3 gap-0.5", impreso ? "h-2" : "h-2.5")} aria-hidden>
              {[1, 2, 3].map((i) => <span key={i} className={cn("rounded-sm", i <= NIVEL[z] ? COLOR[z] : "bg-muted", impreso && i > NIVEL[z] && "border border-doc-linea bg-transparent")} />)}
            </div>
            {f.adicionales.length > 0 && <div className={cn("mt-0.5 text-amber-700 dark:text-amber-400", impreso ? "text-[9px]" : "text-[11px]")}>⚠ {f.adicionales.length} {f.adicionales.length === 1 ? "aspecto adicional" : "aspectos adicionales"}</div>}
          </li>
        );
      })}
    </ol>
  );
}
