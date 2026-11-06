"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DatabaseBackup, X } from "lucide-react";
import { Semaforo } from "@/components/app/semaforo";
import type { EstadoRespaldo } from "@/lib/respaldo";
import { cn } from "@/lib/utils";

// «Ignorar» esconde el aviso del respaldo 3 días y medio en este navegador (Cesar 06-nov: «debería aparecer una vez
// cada 3 o 4 días»). Se cuenta con la hora fiable que manda el servidor, nunca con la del equipo (en la PC de Cesar
// la fecha de Windows se cambia por el SAME). Lo urgente (más de 3 días sin respaldo) también se ignora, pero solo
// hasta la próxima apertura (sessionStorage: se borra al cerrar el programa o la pestaña).
const CLAVE = "zamorapp:respaldo-ignorado-hasta";
const CLAVE_URGENTE = "zamorapp:respaldo-urgente-ignorado";
const PAUSA_MS = 3.5 * 864e5;

function leer(): number {
  try { return Number(localStorage.getItem(CLAVE)) || 0; } catch { return 0; }
}
function urgenteIgnorado(): boolean {
  try { return sessionStorage.getItem(CLAVE_URGENTE) === "1"; } catch { return false; }
}

export function FranjaRespaldo({ respaldo }: { respaldo: EstadoRespaldo }) {
  const ignorable = respaldo.estado !== "ok" && (respaldo.urgente || typeof respaldo.ahora === "number");
  // Empieza visible (igual que en el servidor) y se esconde al leer el navegador, si estaba ignorado
  const [oculto, setOculto] = useState(false);
  useEffect(() => {
    if (!ignorable) return;
    if (respaldo.urgente ? urgenteIgnorado() : leer() > respaldo.ahora!) setOculto(true);
  }, [ignorable, respaldo.urgente, respaldo.ahora]);
  if (oculto) return null;

  const ignorar = () => {
    try {
      if (respaldo.urgente) sessionStorage.setItem(CLAVE_URGENTE, "1");
      else localStorage.setItem(CLAVE, String(respaldo.ahora! + PAUSA_MS));
    } catch { /* sin almacenamiento: solo por ahora */ }
    setOculto(true);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition hover:border-primary/50",
        respaldo.estado === "ok" && "bg-card",
        respaldo.estado === "aviso" && "border-aviso/60 bg-aviso/10",
        respaldo.estado === "alerta" && "border-alerta/60 bg-alerta/10",
      )}
    >
      <DatabaseBackup className={cn("mt-0.5 size-4 shrink-0", respaldo.estado === "ok" ? "text-ok-texto" : respaldo.estado === "aviso" ? "text-aviso-texto" : "text-alerta-texto")} />
      <Link href="/configuracion/respaldo" className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium"><Semaforo estado={respaldo.estado} /> {respaldo.titulo}</span>
        <span className="block break-words text-xs text-muted-foreground">{respaldo.detalle}</span>
      </Link>
      {ignorable && (
        <button type="button" onClick={ignorar} title={respaldo.urgente ? "Ocultar hasta la próxima vez que abras zamorApp" : "No mostrar este aviso por 3 días"}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-3.5" /> Ignorar
        </button>
      )}
    </div>
  );
}
