"use client";

// zamorApp Escritorio (local primero): lo que la puerta local dice de la conexión y de la bandeja de salida
// (/zamorapp/estado). Una sola consulta cada 10 s para toda la ventana; en la web no hace nada.
import { useSyncExternalStore } from "react";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";

const PUERTA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export type EstadoEscritorio = {
  enLinea: boolean;
  pendientes: number; // cambios guardados en la PC que aún no suben
  conflictos: number;
  rechazados: number;
  horaSinAncla: boolean; // la PC arrancó sin internet: la hora es la de Windows
  conocido: boolean; // ya respondió la puerta al menos una vez
};

const INICIAL: EstadoEscritorio = { enLinea: true, pendientes: 0, conflictos: 0, rechazados: 0, horaSinAncla: false, conocido: false };
let estado = INICIAL;
const oyentes = new Set<() => void>();
let reloj: ReturnType<typeof setInterval> | null = null;

const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);

export async function refrescarEstado(): Promise<EstadoEscritorio> {
  if (!ESCRITORIO || !PUERTA) return estado;
  try {
    const r = await fetch(`${PUERTA}/zamorapp/estado`, { credentials: "include", cache: "no-store" });
    const j = await r.json();
    const b = j?.bandeja ?? {};
    const nuevo: EstadoEscritorio = {
      enLinea: j?.enLinea !== false,
      pendientes: n(b.pendientes),
      conflictos: n(b.conflictos),
      rechazados: n(b.rechazados),
      horaSinAncla: j?.horaSinAncla === true,
      conocido: true,
    };
    if (JSON.stringify(nuevo) !== JSON.stringify(estado)) {
      estado = nuevo;
      oyentes.forEach((o) => o());
    }
  } catch {
    // La puerta no respondió: no se cambia nada (la pantalla de error del programa se ocupa)
  }
  return estado;
}

function suscribir(o: () => void) {
  oyentes.add(o);
  if (!reloj && ESCRITORIO) {
    void refrescarEstado();
    reloj = setInterval(refrescarEstado, 10e3);
  }
  return () => {
    oyentes.delete(o);
    if (!oyentes.size && reloj) { clearInterval(reloj); reloj = null; }
  };
}

export function useEstadoEscritorio(): EstadoEscritorio {
  return useSyncExternalStore(suscribir, () => estado, () => INICIAL);
}

// «Sincronizar ahora»: sube la bandeja y baja lo nuevo. Devuelve el mensaje para la persona.
export async function sincronizarAhora(): Promise<string> {
  try {
    const r = await fetch(`${PUERTA}/zamorapp/sincronizar`, { method: "POST", credentials: "include" });
    if (!r.ok) throw new Error();
    const e = await refrescarEstado();
    if (!e.enLinea) return "Sin internet: los cambios siguen guardados en esta PC y suben solos al volver la conexión.";
    return e.pendientes ? `Quedan ${e.pendientes} por subir; siguen en camino.` : "Todo está al día en la nube.";
  } catch {
    return "No se pudo sincronizar ahora. Tus cambios siguen guardados en esta PC.";
  }
}

// Mensaje al guardar en el escritorio sin internet (en la web o con conexión, el de siempre)
export function mensajeGuardadoLocal(base: string): string {
  if (!ESCRITORIO || estado.enLinea) return base;
  return `${base.replace(/\.$/, "")} en esta PC. Sube a la nube cuando vuelva internet.`;
}

