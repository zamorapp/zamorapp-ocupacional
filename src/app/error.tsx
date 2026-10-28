"use client";

// Pantalla de error de toda la app (en vez del «Application error» mudo de Next). En zamorApp Escritorio
// además pregunta a la puerta local si la nube ya va por delante del programa: entonces lo que toca es actualizar.
import { Download, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { abrirWeb, buscarActualizacion, nubeAdelantada } from "@/lib/escritorio-actualizar";

export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [actualizar, setActualizar] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    nubeAdelantada().then(setActualizar);
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
            <button type="button" onClick={() => reset()} className="text-xs text-muted-foreground underline-offset-4 hover:underline">Reintentar</button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">No se pudo cargar esta pantalla</h1>
            <p className="text-sm text-muted-foreground">
              Algo falló al preparar los datos. No se perdió nada de lo ya guardado. Revisa la conexión y vuelve a intentarlo.
            </p>
            {error.digest && <p className="text-xs text-muted-foreground">Código: {error.digest}</p>}
            <div className="flex gap-2">
              <Button onClick={() => reset()}>Reintentar</Button>
              <Button variant="outline" onClick={() => (window.location.href = "/")}>Ir al inicio</Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
