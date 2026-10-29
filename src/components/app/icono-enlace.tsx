"use client";

import { useLinkStatus } from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Prefetch completo al pasar el mouse (o tocar): al hacer clic la pantalla ya llegó o va en camino. El <Link> del
// App Router lo admite desde Next 15.3, pero sus tipos públicos aún no lo declaran.
// Solo en las pantallas diarias: cada prefetch completo arma la pantalla en el servidor (planes gratis).
const DIARIAS_PREFETCH = new Set(["/panel", "/pacientes", "/atencion"]);
export const alPasar = (href: string) => (DIARIAS_PREFETCH.has(href) ? ({ unstable_dynamicOnHover: true } as Record<string, unknown>) : {});

// Ícono de un enlace del menú que, apenas se toca, gira mientras llega la pantalla: la respuesta se ve al
// instante aunque la red tarde. Debe ir dentro del <Link>.
export function IconoEnlace({ icono: Icono, className }: { icono: LucideIcon; className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className={cn(className, "animate-spin")} aria-label="Abriendo" /> : <Icono className={className} aria-hidden />;
}
