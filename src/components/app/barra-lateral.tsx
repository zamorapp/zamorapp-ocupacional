"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NOMBRE } from "@/lib/config";
import { SECCIONES, SECCIONES_EMPRESA } from "@/lib/navegacion";
import { cn } from "@/lib/utils";

type Props = { organizacion: string; portal?: boolean; alNavegar?: () => void };

export function BarraLateral({ organizacion, portal = false, alNavegar }: Props) {
  const ruta = usePathname();
  const secciones = portal ? SECCIONES_EMPRESA : SECCIONES;
  return (
    <div className="flex h-full flex-col">
      <Link href={portal ? "/portal" : "/panel"} onClick={alNavegar} className="flex h-16 items-center gap-3 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icono.svg" alt="" className="size-8 rounded-lg" />
        <span className="font-semibold tracking-tight">{APP_NOMBRE}</span>
      </Link>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {secciones.map(({ href, titulo, icono: Icono }) => {
          const activa = ruta === href || ruta.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={alNavegar}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors",
                activa ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icono className="size-[18px]" />
              {titulo}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        {organizacion}
        <br />
        {portal ? "Portal de empresas" : "Proveedor de salud ocupacional"}
      </div>
    </div>
  );
}
