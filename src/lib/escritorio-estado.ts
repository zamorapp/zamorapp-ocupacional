"use client";

// zamorApp Escritorio (local primero): lo que la puerta local dice de la conexión y de la bandeja de salida
// (/zamorapp/estado). Una sola consulta cada 10 s para toda la ventana; en la web no hace nada.
import { useSyncExternalStore } from "react";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { crearClienteNavegador } from "@/lib/supabase/client";

const PUERTA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export type EstadoEscritorio = {
  enLinea: boolean;
  pendientes: number; // cambios guardados en la PC que aún no suben
  conflictos: number;
  rechazados: number;
  horaSinAncla: boolean; // la PC arrancó sin internet: la hora es la de Windows
  conocido: boolean; // ya respondió la puerta al menos una vez
  ultimaSincronia: string | null; // cuándo terminó bien la última sincronía (hora de la nube, ISO)
  errorSincronia: boolean; // la última sincronía falló aunque haya internet
  motivo: string | null; // por qué falló, en palabras para la persona (lo arma la puerta)
  apartadas: number; // filas que bajaron de la nube y esta PC no aceptó: se reintentan solas
};

const INICIAL: EstadoEscritorio = { enLinea: true, pendientes: 0, conflictos: 0, rechazados: 0, horaSinAncla: false, conocido: false, ultimaSincronia: null, errorSincronia: false, motivo: null, apartadas: 0 };
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
      ultimaSincronia: typeof j?.ultimaSincronia === "string" ? j.ultimaSincronia : null,
      errorSincronia: !!j?.error,
      motivo: typeof j?.motivo === "string" ? j.motivo : null,
      apartadas: n(j?.apartadas),
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
    // La puerta acepta la sesión del usuario (Bearer): solo sube y baja lo que ese usuario puede escribir
    const { data } = await crearClienteNavegador().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "Tu sesión venció: vuelve a entrar para sincronizar. Tus cambios siguen guardados en esta PC.";
    const r = await fetch(`${PUERTA}/zamorapp/sincronizar`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error();
    const e = await refrescarEstado();
    if (!e.enLinea) return "Sin internet: los cambios siguen guardados en esta PC y suben solos al volver la conexión.";
    // Subir y bajar son dos pasos: si la bajada falló, se dice qué pasó y que lo de esta PC sí subió (o sigue en camino)
    const subida = e.pendientes ? `Quedan ${e.pendientes} por subir; siguen en camino.` : "Lo de esta PC ya está en la nube.";
    if (e.errorSincronia) return `${subida} No se pudieron bajar los cambios de la nube: ${e.motivo ?? "se reintenta sola cada 30 segundos."}`;
    if (e.pendientes) return subida;
    return e.apartadas ? `Todo está al día, salvo ${e.apartadas === 1 ? "1 registro que esta PC no aceptó" : `${e.apartadas} registros que esta PC no aceptó`}; se reintentan solos.` : "Todo está al día en la nube.";
  } catch {
    return "No se pudo sincronizar ahora. Tus cambios siguen guardados en esta PC.";
  }
}

// Mensaje al guardar en el escritorio sin internet (en la web o con conexión, el de siempre)
export function mensajeGuardadoLocal(base: string): string {
  if (!ESCRITORIO || estado.enLinea) return base;
  return `${base.replace(/\.$/, "")} en esta PC. Sube a la nube cuando vuelva internet.`;
}

