"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { SECCIONES, SECCIONES_EMPRESA } from "@/lib/navegacion";
import { cn } from "@/lib/utils";
import { AL_PASAR, IconoEnlace } from "./icono-enlace";
import { abrirBuscador } from "./buscador-global";

// Navegación al pulgar en teléfono y tablet: las tres áreas de uso diario y el buscador.
const DIARIAS = ["/panel", "/pacientes", "/atencion"];

export function BarraInferior({ portal = false }: { portal?: boolean }) {
  const ruta = usePathname();
  const secciones = portal ? SECCIONES_EMPRESA.slice(0, 3) : SECCIONES.filter((s) => DIARIAS.includes(s.href));
  return (
    <nav
      aria-label="Navegación principal"
      data-barra-inferior
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {secciones.map(({ href, titulo, icono: Icono }) => {
        const activa = ruta === href || ruta.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            {...AL_PASAR}
            aria-current={activa ? "page" : undefined}
            className={cn("flex flex-col items-center gap-1 py-2 text-[11px] font-medium", activa ? "text-primary" : "text-muted-foreground")}
          >
            <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", activa && "bg-primary/12")}>
              <IconoEnlace icono={Icono} className="size-5" />
            </span>
            {titulo.replace(" médica", "")}
          </Link>
        );
      })}
      <button type="button" onClick={abrirBuscador} className="flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground">
        <span className="grid h-7 w-12 place-items-center rounded-full"><Search className="size-5" /></span>
        Buscar
      </button>
    </nav>
  );
}
