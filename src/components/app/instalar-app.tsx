"use client";

import { useEffect, useState } from "react";
import { MonitorDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Botón "Instalar app": aparece solo cuando el navegador permite instalar zamorApp y aún no está instalada. */
export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);

  useEffect(() => {
    const guardar = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar); };
    const instalada = () => setEvento(null);
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", instalada);
    return () => {
      window.removeEventListener("beforeinstallprompt", guardar);
      window.removeEventListener("appinstalled", instalada);
    };
  }, []);

  if (!evento) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={async () => { await evento.prompt(); await evento.userChoice; setEvento(null); }}
    >
      <MonitorDown /> <span className="hidden sm:inline">Instalar app</span>
    </Button>
  );
}
