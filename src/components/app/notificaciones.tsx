"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Clock, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { aparatosSinAcuse, marcarLeidas, misNotificaciones, type AparatoSinAcuse, type Notificacion } from "./acciones";
import { avisoWindows, enEscritorio } from "@/lib/escritorio";
import { ahora } from "@/lib/fecha";

const hace = (iso: string) => {
  const min = Math.round((ahora() - new Date(iso).getTime()) / 60e3);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};

// En el escritorio, cada aviso nuevo de la campana sale también como aviso de Windows (una sola vez por aviso, aunque
// se cierre y se abra el programa). Al abrir solo suenan los de los últimos 15 min: nunca una ráfaga de avisos viejos.
const AVISADOS = "zamorapp.campana.avisados-windows";
const RECIENTE_MS = 15 * 60e3;
function leerAvisados(): string[] {
  try { return JSON.parse(localStorage.getItem(AVISADOS) ?? "[]") as string[]; } catch { return []; }
}
async function avisarEnWindows(lista: Notificacion[]) {
  if (!enEscritorio()) return;
  const avisados = leerAvisados();
  const ya = new Set(avisados);
  const nuevos = lista.filter((n) => !n.leida && !ya.has(n.id) && ahora() - new Date(n.creadoEn).getTime() < RECIENTE_MS);
  if (!nuevos.length) return;
  // Varios a la vez (el centinela crea varios): uno solo que los resume
  const [primero] = nuevos;
  await avisoWindows(nuevos.length === 1 ? primero.titulo : `${nuevos.length} avisos nuevos`,
    nuevos.length === 1 ? primero.texto ?? "" : nuevos.map((n) => n.titulo).join(" · "));
  try { localStorage.setItem(AVISADOS, JSON.stringify([...nuevos.map((n) => n.id), ...avisados].slice(0, 200))); } catch {}
}

// «Ignorar» del aviso de un aparato sin acuse: vale hasta que la nube le mande otro aviso
const IGNORADOS = "zamorapp.campana.sin-acuse-ignorados";
const claveAparato = (a: AparatoSinAcuse) => `${a.id}@${a.desde}`;
function leerIgnorados(): string[] {
  try { return JSON.parse(localStorage.getItem(IGNORADOS) ?? "[]") as string[]; } catch { return []; }
}
const HORA = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", hourCycle: "h12" });

// Campana de avisos: se actualiza cada 30 segundos
export function Notificaciones() {
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [sinAcuse, setSinAcuse] = useState<AparatoSinAcuse[]>([]);
  const cargar = useCallback(async () => {
    const [l, a] = await Promise.all([misNotificaciones(), aparatosSinAcuse().catch(() => [])]);
    setLista(l);
    const ignorados = new Set(leerIgnorados());
    setSinAcuse(a.filter((x) => !ignorados.has(claveAparato(x))));
    avisarEnWindows(l).catch(() => {});
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30e3);
    return () => clearInterval(t);
  }, [cargar]);

  const ignorar = (a: AparatoSinAcuse) => {
    try { localStorage.setItem(IGNORADOS, JSON.stringify([claveAparato(a), ...leerIgnorados()].slice(0, 50))); } catch {}
    setSinAcuse((l) => l.filter((x) => x !== a));
  };

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
        <Button variant="ghost" size="icon" className="relative" aria-label="Avisos">
          <Bell />
          {nuevas.length + sinAcuse.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-alerta px-1 text-[10px] font-semibold text-white">
              {nuevas.length + sinAcuse.length > 9 ? "9+" : nuevas.length + sinAcuse.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Avisos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sinAcuse.map((a) => (
          <div key={claveAparato(a)} role="alert" className="mx-2 mb-2 rounded-lg border border-aviso/40 bg-aviso/10 p-2.5 text-sm">
            <div className="flex items-start gap-2 font-medium text-aviso-texto">
              <Smartphone className="mt-0.5 size-4 shrink-0" />
              <span>{a.bloqueado ? `Tu ${a.equipo} recibe los avisos pero no los muestra` : `Tu ${a.equipo} no confirmó el aviso del ${HORA.format(new Date(a.desde))}`}</span>
            </div>
            <p className="mt-0.5 pl-6 text-xs text-muted-foreground">Ábrelo y toca «Probar» para revisarlo.</p>
            <div className="mt-2 flex gap-2 pl-6">
              <Button size="sm" asChild><Link href="/configuracion/perfil#avisos-celular">Probar</Link></Button>
              <Button size="sm" variant="ghost" onClick={() => ignorar(a)}>Ignorar</Button>
            </div>
          </div>
        ))}
        <div className="max-h-96 overflow-y-auto">
          {lista.length === 0 && sinAcuse.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin avisos.</p>}
          {lista.map((n) => {
            const contenido = (
              <div className={cn("flex gap-2 px-3 py-2 text-sm", !n.leida && "bg-primary/5", n.nivel === "alerta" && "border-l-2 border-alerta", n.nivel === "aviso" && "border-l-2 border-aviso")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.leida ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <div className={cn("flex items-start gap-1.5 font-medium", n.nivel === "alerta" && "text-alerta-texto", n.nivel === "aviso" && "text-aviso-texto")}>
                    {n.nivel === "alerta" && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
                    {n.nivel === "aviso" && <Clock className="mt-0.5 size-3.5 shrink-0" />}
                    <span className="min-w-0">{n.titulo}</span>
                  </div>
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
