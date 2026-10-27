"use client";

import { useEffect, useState } from "react";
import { MonitorDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global { interface Window { __eventoInstalar?: EventoInstalar | null } }

/** Botón "Instalar app": usa el aviso del navegador si existe; si no, explica cómo instalarla. Se oculta dentro de la app instalada. */
export function InstalarApp() {
  const [instalada, setInstalada] = useState(true);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);

  useEffect(() => {
    setInstalada(window.matchMedia("(display-mode: standalone)").matches);
    setEvento(window.__eventoInstalar ?? null);
    const guardar = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar); };
    const lista = () => { setInstalada(true); setEvento(null); };
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", lista);
    return () => {
      window.removeEventListener("beforeinstallprompt", guardar);
      window.removeEventListener("appinstalled", lista);
    };
  }, []);

  // Dentro del programa de escritorio no hay nada que instalar
  if (instalada || process.env.NEXT_PUBLIC_ESCRITORIO === "1") return null;
  const boton = (
    <Button variant="outline" size="sm" className="gap-1.5" aria-label="Instalar app" onClick={evento ? async () => { await evento.prompt(); await evento.userChoice; setEvento(null); window.__eventoInstalar = null; } : undefined}>
      <MonitorDown /> <span className="hidden sm:inline">Instalar app</span>
    </Button>
  );
  if (evento) return boton;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{boton}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 space-y-2 p-3 text-sm">
        <p className="font-medium">Instalar zamorApp</p>
        <p><b>Chrome o Edge (PC):</b> menú ⋮ → «Transmitir, guardar y compartir» → «Instalar página como app», o el ícono de instalar al final de la barra de direcciones.</p>
        <p><b>Android:</b> menú ⋮ → «Agregar a la pantalla principal».</p>
        <p><b>iPhone o iPad:</b> botón Compartir → «Agregar a inicio».</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
