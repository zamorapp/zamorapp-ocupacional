"use client";

import { useState, useTransition } from "react";
import { Laptop, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Equipo } from "@/lib/auditoria";
import { cn } from "@/lib/utils";
import { activarEquipo } from "../acciones";
import { confirmar } from "@/components/app/confirmar";
import { ahora } from "@/lib/fecha";

const hace = (iso: string | null) => {
  if (!iso) return "Nunca";
  const min = Math.round((ahora() - new Date(iso).getTime()) / 60e3);
  if (min < 1) return "Hace segundos";
  if (min < 60) return `Hace ${min} min`;
  if (min < 48 * 60) return `Hace ${Math.round(min / 60)} h`;
  return `Hace ${Math.round(min / 1440)} días`;
};
// Punto de estado: al día si sincronizó en la última hora, aviso si hace más de un día, apagado si está revocado
const tono = (e: Equipo) => {
  if (!e.activo) return "bg-muted-foreground/40";
  const min = e.ultimoContacto ? (ahora() - new Date(e.ultimoContacto).getTime()) / 60e3 : Infinity;
  return min <= 60 ? "bg-ok" : min <= 1440 ? "bg-info" : "bg-aviso";
};

const esCelular = (e: Equipo) => e.nombre.startsWith("Celular");

export function ListaEquipos({ equipos }: { equipos: Equipo[] }) {
  const [ocupado, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const cambiar = async (e: Equipo) => {
    // Un celular desactivado borra su copia cifrada en cuanto tiene señal (borrado remoto si se pierde)
    const texto = esCelular(e)
      ? "El teléfono borrará su copia de pacientes en cuanto tenga señal. Lo que no había subido se pierde. Úsalo si se perdió o lo robaron."
      : "Dejará de sincronizar hasta que lo reactives.";
    if (e.activo && !(await confirmar({ titulo: `¿Revocar «${e.nombre}»?`, texto, accion: esCelular(e) ? "Revocar y borrar" : "Revocar", peligro: true }))) return;
    iniciar(async () => setAviso(await activarEquipo(e.id, !e.activo)));
  };

  return (
    <div className="space-y-3">
      {aviso && <p className={cn("rounded-md px-3 py-2 text-sm", aviso.ok ? "bg-ok/10 text-ok-texto" : "bg-destructive/10 text-destructive")}>{aviso.mensaje}</p>}
      <ul className="divide-y rounded-xl border bg-card">
        {equipos.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">{esCelular(e) ? <Smartphone className="size-5" /> : <Laptop className="size-5" />}</span>
            <div className="min-w-0 flex-1">
              <div className={cn("font-medium", !e.activo && "text-muted-foreground line-through")}>{e.nombre} <span className="font-mono text-xs text-muted-foreground">· serie {e.serie}</span></div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", tono(e))} />
                {e.activo ? `Última sincronía: ${hace(e.ultimoContacto)}` : esCelular(e) ? "Revocado: se borra al tener señal" : "Revocado"}
              </div>
            </div>
            <Button size="sm" variant={e.activo ? "outline" : "default"} disabled={ocupado} onClick={() => cambiar(e)}>
              {ocupado && <Loader2 className="animate-spin" />} {e.activo ? "Revocar" : "Reactivar"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
