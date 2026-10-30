"use client";

import { Download, GitCompareArrows } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCasosBandeja } from "@/components/app/aviso-conflictos";
import { APP_NOMBRE } from "@/lib/config";
import { buscarActualizacion, ESCRITORIO } from "@/lib/escritorio-actualizar";
import { SECCIONES, SECCIONES_EMPRESA } from "@/lib/navegacion";
import { cn } from "@/lib/utils";

type Props = { organizacion: string; portal?: boolean; alNavegar?: () => void };

export function BarraLateral({ organizacion, portal = false, alNavegar }: Props) {
  const ruta = usePathname();
  const secciones = portal ? SECCIONES_EMPRESA : SECCIONES;
  const [aviso, setAviso] = useState("");
  const casos = useCasosBandeja().length;
  return (
    <div className="flex h-full flex-col">
      <Link href={portal ? "/portal" : "/panel"} onClick={alNavegar} className="flex h-16 items-center gap-3 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icono.svg" alt="" className="size-8 rounded-lg" />
        <span className="font-semibold tracking-tight">{APP_NOMBRE}</span>
      </Link>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {secciones.map(({ href, titulo, icono: Icono, descripcion }) => {
          const activa = ruta === href || ruta.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={descripcion}
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
      {ESCRITORIO && (
        <div className="mx-3">
          {!portal && (
            <Link
              href="/conflictos"
              onClick={alNavegar}
              aria-current={ruta === "/conflictos" ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                ruta === "/conflictos" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <GitCompareArrows className="size-[18px]" aria-hidden />
              <span className="flex-1">Conflictos y rechazados</span>
              {casos > 0 && (
                <span className="rounded-full bg-aviso/15 px-1.5 text-xs font-semibold tabular-nums text-aviso-texto">
                  {casos}<span className="sr-only"> por revisar</span>
                </span>
              )}
            </Link>
          )}
          <button
            type="button"
            data-boton="buscar-actualizacion"
            disabled={Boolean(aviso)}
            onClick={async () => {
              // El resultado («ya tienes la más reciente» o la descarga con su avance) lo muestra el programa en su
              // propia ventana; aquí el aviso solo acompaña unos segundos y se va.
              setAviso("Buscando…");
              setAviso(await buscarActualizacion());
              setTimeout(() => setAviso(""), 8000);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
          >
            <Download className="size-[18px]" aria-hidden />
            Buscar actualización
          </button>
          {aviso && <p role="status" className="px-3 pb-1 text-xs text-muted-foreground">{aviso}</p>}
        </div>
      )}
      <div className="m-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        {organizacion}
        <br />
        {portal ? "Portal de empresas" : "Proveedor de salud ocupacional"}
      </div>
    </div>
  );
}
