"use client";

// Pantalla de error de toda la app (en vez del «Application error» mudo de Next). En zamorApp Escritorio
// además pregunta a la puerta local si la nube ya va por delante del programa: entonces lo que toca es actualizar.
import { Download, Globe, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { actualizarApp } from "@/components/app/actualizar-app";
import { abrirWeb, buscarActualizacion, ESCRITORIO, nubeAdelantada } from "@/lib/escritorio-actualizar";
import { detalle, esVersionVieja, normalizarError, recargarUnaVez } from "@/lib/error-pantalla";

// «Reintentar» que de verdad reintenta (31-oct, celular de Cesar: salía «Reintentar», no abría y al rato sí).
// Siempre recarga completa: pide la pantalla y el código de nuevo a la nube (sirve también si se publicó una versión
// con la app abierta). NO usar router.refresh() + reset(): con el error en un layout React revienta (#310) fuera de
// esta pantalla y queda la pantalla blanca «Application error» (31-oct, reproducido con Playwright en la compilación
// Turbopack de Vercel; prueba scripts/pruebas/pantalla-error.test.mjs).

export default function ErrorApp({ error: lanzado }: { error: Error & { digest?: string }; reset: () => void }) {
  // Lo lanzado puede no ser un Error (texto, objeto, null): la pantalla de error nunca debe fallar ella misma
  const error = normalizarError(lanzado);
  const [actualizar, setActualizar] = useState(false);
  const [aviso, setAviso] = useState("");
  const [reintentando, setReintentando] = useState(false);

  const reintentar = () => {
    setReintentando(true);
    window.location.reload();
  };

  useEffect(() => {
    nubeAdelantada().then(setActualizar);
    // Se reintenta sola UNA vez por minuto como máximo (recargarUnaVez): partes de una versión vieja al instante,
    // cualquier otro fallo a los 2 s. Si vuelve a fallar queda esta pantalla con el botón, nunca un bucle.
    const t = setTimeout(recargarUnaVez, esVersionVieja(normalizarError(lanzado)) ? 0 : 2000);
    return () => clearTimeout(t);
  }, [lanzado]);

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
              {detalle(error)}
            </p>
            {reintentando && <p role="status" className="text-sm text-muted-foreground">Reintentando…</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={reintentar} disabled={reintentando}>{reintentando && <Loader2 className="animate-spin" aria-hidden />} Reintentar</Button>
              {!ESCRITORIO && <Button variant="outline" onClick={() => actualizarApp()}>Actualizar la app</Button>}
              <Button variant="ghost" onClick={() => (window.location.href = "/")}>Ir al inicio</Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
