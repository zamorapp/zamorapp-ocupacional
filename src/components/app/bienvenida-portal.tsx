"use client";

import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Download, Share, SquarePlus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AvisosCelular, useAvisos } from "./avisos-celular";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const AHORA_NO = "zamorapp.bienvenida-portal.ahora-no";

function Numero({ n, listo, activo }: { n: number; listo: boolean; activo: boolean }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
      listo ? "bg-ok text-white" : activo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
      {listo ? <CheckCircle2 className="size-5" /> : n}
    </span>
  );
}

/**
 * Bienvenida guiada del portal de RR. HH. (Cesar, 31-oct): 1) instalar zamorApp en el teléfono y 2) activar los avisos
 * (citas confirmadas o cambiadas, horas propuestas, solicitudes respondidas, constancias; nunca datos médicos).
 * «Ahora no» la recoge en un botón pequeño; no bloquea nada.
 */
export function Bienvenida({ servicio }: { servicio: string }) {
  const { estado } = useAvisos();
  const [listo, setListo] = useState(false);
  const [instalada, setInstalada] = useState(false);
  const [iphone, setIphone] = useState(false);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [ahoraNo, setAhoraNo] = useState(false);
  const [paso, setPaso] = useState<1 | 2>(1);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setInstalada(standalone);
    setPaso(standalone ? 2 : 1);
    setIphone(/iPhone|iPad/i.test(navigator.userAgent));
    setEvento((window as { __eventoInstalar?: EventoInstalar | null }).__eventoInstalar ?? null);
    try { setAhoraNo(localStorage.getItem(AHORA_NO) === "1"); } catch {}
    const guardar = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar); };
    const instalo = () => { setInstalada(true); setEvento(null); setPaso(2); };
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", instalo);
    setListo(true);
    return () => { window.removeEventListener("beforeinstallprompt", guardar); window.removeEventListener("appinstalled", instalo); };
  }, []);

  if (!listo || estado === "cargando" || estado === "activo" || estado === "no-soporta") return null;
  const cerrar = () => { try { localStorage.setItem(AHORA_NO, "1"); } catch {} setAhoraNo(true); };
  if (ahoraNo) {
    return (
      <button type="button" onClick={() => { try { localStorage.removeItem(AHORA_NO); } catch {} setAhoraNo(false); }}
        className="flex items-center gap-1.5 text-sm text-primary hover:underline">
        <BellRing className="size-4" /> Recibir avisos en este equipo
      </button>
    );
  }
  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    const r = await evento.userChoice;
    setEvento(null);
    (window as { __eventoInstalar?: EventoInstalar | null }).__eventoInstalar = null;
    if (r.outcome === "accepted") { setInstalada(true); setPaso(2); }
  };
  // iPhone solo recibe avisos con la app agregada a la pantalla de inicio y abierta desde ahí
  const avisosPosibles = !(iphone && !instalada);

  return (
    <section aria-label="Bienvenida" className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
        <div>
          <h2 className="text-lg font-semibold">Le damos la bienvenida a {servicio}</h2>
          <p className="text-sm text-muted-foreground">Dos pasos y tendrá sus citas a un toque, con avisos al momento.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={cerrar}>Ahora no</Button>
      </div>
      <ol className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
        <li className={cn("rounded-xl border bg-card p-4", paso === 1 && !instalada && "ring-2 ring-primary/40")}>
          <div className="mb-2 flex items-center gap-3">
            <Numero n={1} listo={instalada} activo={paso === 1} />
            <h3 className="font-medium">Instale zamorApp</h3>
          </div>
          {instalada ? <p className="text-sm text-ok-texto">Listo: zamorApp está en su pantalla de inicio.</p>
          : evento ? (
            <div className="space-y-3 text-sm">
              <p>Toque <b>«Instalar»</b> para disfrutar de los servicios de {servicio} desde su pantalla de inicio, como cualquier aplicación.</p>
              <Button size="lg" className="w-full" onClick={instalar}><Download /> Instalar</Button>
            </div>
          ) : iphone ? (
            <ol className="space-y-2.5 text-sm">
              <li className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40"><Share className="size-5 text-primary" /></span> Toque <b>Compartir</b> en la barra de Safari.</li>
              <li className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40"><SquarePlus className="size-5 text-primary" /></span> Elija <b>«Agregar a inicio»</b> y luego <b>Agregar</b>.</li>
              <li className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40"><Smartphone className="size-5 text-primary" /></span> Abra <b>zamorApp</b> desde el ícono nuevo y vuelva a este paso.</li>
            </ol>
          ) : (
            <div className="space-y-2 text-sm">
              <p>Para disfrutar de los servicios de {servicio} desde su pantalla de inicio: abra el menú <b>⋮</b> del navegador y toque <b>«Instalar app»</b> o <b>«Agregar a la pantalla principal»</b>.</p>
              <Button variant="outline" size="sm" onClick={() => setPaso(2)}>Ya la instalé o lo haré después</Button>
            </div>
          )}
        </li>
        <li className={cn("rounded-xl border bg-card p-4", paso === 2 && "ring-2 ring-primary/40", !avisosPosibles && "opacity-70")}>
          <div className="mb-2 flex items-center gap-3">
            <Numero n={2} listo={false} activo={paso === 2} />
            <h3 className="font-medium">Active los avisos</h3>
          </div>
          {avisosPosibles
            ? <AvisosCelular para="empresa" sinMarco />
            : <p className="text-sm text-muted-foreground">En iPhone los avisos llegan solo a la app instalada: termine el paso 1 y ábrala desde el ícono.</p>}
        </li>
      </ol>
    </section>
  );
}
