"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { marcarLeidas, misNotificaciones, type Notificacion } from "./acciones";

const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60e3);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};

// Campana de avisos: se actualiza cada 30 segundos
export function Notificaciones() {
  const [lista, setLista] = useState<Notificacion[]>([]);
  const cargar = useCallback(async () => setLista(await misNotificaciones()), []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30e3);
    return () => clearInterval(t);
  }, [cargar]);

  const nuevas = lista.filter((n) => !n.leida);

  return (
    <DropdownMenu
      onOpenChange={(abierto) => {
        if (!abierto && nuevas.length) {
          marcarLeidas(nuevas.map((n) => n.id));
          setLista(lista.map((n) => ({ ...n, leida: true })));
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative ml-auto md:ml-0" aria-label="Avisos">
          <Bell />
          {nuevas.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-alerta px-1 text-[10px] font-semibold text-white">
              {nuevas.length > 9 ? "9+" : nuevas.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Avisos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {lista.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin avisos.</p>}
          {lista.map((n) => {
            const contenido = (
              <div className={cn("flex gap-2 px-3 py-2 text-sm", !n.leida && "bg-primary/5")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.leida ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{n.titulo}</div>
                  {n.texto && <div className="truncate text-xs text-muted-foreground">{n.texto}</div>}
                  <div className="text-[11px] text-muted-foreground">{hace(n.creadoEn)}</div>
                </div>
              </div>
            );
            return n.enlace ? <Link key={n.id} href={n.enlace} className="block hover:bg-muted">{contenido}</Link> : <div key={n.id}>{contenido}</div>;
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
