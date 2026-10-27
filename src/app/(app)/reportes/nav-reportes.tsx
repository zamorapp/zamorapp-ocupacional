"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { GRUPOS_REPORTE, REPORTES } from "@/lib/reportes-catalogo";
import { cn } from "@/lib/utils";

// Barra de reportes: vigilancia + los del SAME. Conserva el período elegido al cambiar de reporte.
export function NavReportes() {
  const ruta = usePathname();
  const q = useSearchParams();
  const periodo = new URLSearchParams([...q.entries()].filter(([k]) => ["p", "desde", "hasta", "anio", "t", "inicio", "mes"].includes(k)));
  const sufijo = periodo.size ? `?${periodo}` : "";
  const barra = useRef<HTMLElement>(null);
  // En el celular la barra se desliza: deja visible el reporte abierto
  useEffect(() => {
    barra.current?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [ruta]);
  const pastilla = (activa: boolean) =>
    cn("shrink-0 rounded-full border px-3 py-1.5 text-sm transition", activa ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted");

  return (
    <nav ref={barra} aria-label="Reportes" className="relative -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <div className="flex w-max items-center gap-1.5">
        <Link href={`/reportes${sufijo}`} aria-current={ruta === "/reportes" ? "page" : undefined} className={pastilla(ruta === "/reportes")}>Vigilancia epidemiológica</Link>
        {GRUPOS_REPORTE.map((g) => (
          <div key={g} className="flex items-center gap-1.5">
            <span className="mx-1 h-5 border-l" aria-hidden />
            <span className="sr-only">{g}</span>
            {REPORTES.filter((r) => r.grupo === g).map((r) => (
              <Link key={r.clave} href={`/reportes/${r.clave}${sufijo}`} title={r.titulo} aria-current={ruta === `/reportes/${r.clave}` ? "page" : undefined} className={pastilla(ruta === `/reportes/${r.clave}`)}>
                {r.corto}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
