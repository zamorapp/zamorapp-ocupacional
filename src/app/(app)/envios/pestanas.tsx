"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileClock, Inbox, PenLine, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/envios/por-enviar", t: "Por enviar", Icono: Inbox },
  { href: "/envios", t: "Enviar", Icono: Send },
  { href: "/envios/bitacora", t: "Bitácora", Icono: FileClock },
  { href: "/envios/plantillas", t: "Plantillas", Icono: PenLine },
] as const;

// Por enviar · Enviar · Bitácora · Plantillas. «pendientes» = correos fallidos o sin confirmar por reintentar;
// «porEnviar» = constancias firmadas que aún no salieron (solo donde ya se calculó).
export function PestanasEnvios({ pendientes = 0, porEnviar = 0 }: { pendientes?: number; porEnviar?: number }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Envíos" className="flex gap-1 overflow-x-auto border-b">
      {PESTANAS.map(({ href, t, Icono }) => {
        const activa = ruta === href;
        return (
          <Link key={href} href={href} aria-current={activa ? "page" : undefined}
            className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium", activa ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icono className="size-4" /> {t}
            {href === "/envios/bitacora" && pendientes > 0 && <span className="rounded-full bg-destructive px-1.5 text-[11px] leading-5 text-white">{pendientes}</span>}
            {href === "/envios/por-enviar" && porEnviar > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 text-primary-foreground">{porEnviar}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
