"use client";

// Pantalla de error de toda la app (en vez del «Application error» mudo de Next). En zamorApp Escritorio
// además pregunta a la puerta local si la nube ya va por delante del programa: entonces lo que toca es actualizar.
import { Download, Globe, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { abrirWeb, buscarActualizacion, nubeAdelantada } from "@/lib/escritorio-actualizar";
import { ahora } from "@/lib/fecha";

// «Reintentar» que de verdad reintenta (31-oct, celular de Cesar: salía «Reintentar», no abría y al rato sí).
// reset() solo vuelve a dibujar con lo que ya tenía el teléfono; si el fallo vino de la nube (pantalla armada en el
// servidor) hay que pedirla de nuevo (router.refresh). Y si la app quedó abierta en segundo plano mientras se
// publicaba una versión nueva, sus archivos viejos ya no existen: solo una recarga completa la abre.
const RECARGA = "zamorapp.error.recarga";
// Si el reintento automático vuelve a fallar, la pantalla se monta de nuevo: este registro (fuera del componente)
// evita reintentar en bucle; queda el botón
let ultimoAutomatico = -Infinity;
const esVersionVieja = (e: Error) => /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Failed to fetch|NetworkError|Load failed/i.test(`${e.name} ${e.message}`);
function recargarUnaVez(): boolean {
  // Una recarga automática por minuto como máximo: nunca un bucle si la nube de verdad está caída
  try {
    const ultima = Number(sessionStorage.getItem(RECARGA) ?? 0);
    if (Math.abs(ahora() - ultima) < 60_000) return false;
    sessionStorage.setItem(RECARGA, String(ahora()));
  } catch { return false; }
  window.location.reload();
  return true;
}

export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [actualizar, setActualizar] = useState(false);
  const [aviso, setAviso] = useState("");
  const [reintentando, setReintentando] = useState(false);
  const intentos = useRef(0);

  // Pide la pantalla otra vez a la nube; desde el segundo intento, recarga completa
  const reintentar = () => {
    intentos.current += 1;
    if (intentos.current > 1 || esVersionVieja(error)) { window.location.reload(); return; }
    setReintentando(true);
    startTransition(() => { router.refresh(); reset(); });
    setTimeout(() => setReintentando(false), 4000);
  };

  useEffect(() => {
    nubeAdelantada().then(setActualizar);
    // Se reintenta sola una vez (versión vieja → recarga; si no, a los 2 s pide la pantalla de nuevo)
    if (esVersionVieja(error) && recargarUnaVez()) return;
    if (intentos.current > 0 || performance.now() - ultimoAutomatico < 30_000) return;
    const t = setTimeout(() => { ultimoAutomatico = performance.now(); reintentar(); }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const buscar = async () => setAviso(await buscarActualizacion());
  const web = async () => setAviso(await abrirWeb());

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6" data-estado={actualizar ? "actualizar" : "error"}>
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        {actualizar ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Download className="size-5" aria-hidden /></span>
              <h1 className="text-lg font-semibold">Hay una versión nueva de zamorApp</h1>
            </div>
            <p className="text-sm text-muted-foreground">Esta PC necesita instalarla para seguir. Tus datos están a salvo.</p>
            <p className="text-sm">Menú <strong>zamorApp</strong> › <strong>Buscar actualizaciones</strong>. Si aún no aparece, espera unos minutos; mientras tanto puedes trabajar en la web.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={buscar}><Download aria-hidden /> Buscar actualización</Button>
              <Button variant="outline" onClick={web}><Globe aria-hidden /> Trabajar en la web</Button>
            </div>
            {aviso && <p className="text-sm text-muted-foreground" role="status">{aviso}</p>}
            <button type="button" onClick={reintentar} className="text-xs text-muted-foreground underline-offset-4 hover:underline">Reintentar</button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">No se pudo cargar esta pantalla</h1>
            <p className="text-sm text-muted-foreground">
              Algo falló al preparar los datos. No se perdió nada de lo ya guardado. Revisa la conexión y vuelve a intentarlo.
            </p>
            {/* La causa a la vista: soporte sabe qué pasó sin pedir capturas de la consola */}
            <p className="break-words text-[11px] text-muted-foreground opacity-70">
              {error.digest ? `Código: ${error.digest} · ` : ""}Detalle: {`${error.name}: ${error.message}`.slice(0, 140)}
            </p>
            {reintentando && <p role="status" className="text-sm text-muted-foreground">Reintentando…</p>}
            <div className="flex gap-2">
              <Button onClick={reintentar} disabled={reintentando}>{reintentando && <Loader2 className="animate-spin" aria-hidden />} Reintentar</Button>
              <Button variant="outline" onClick={() => (window.location.href = "/")}>Ir al inicio</Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
