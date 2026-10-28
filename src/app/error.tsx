"use client";

// Pantalla de error de toda la app (en vez del «Application error» mudo de Next). En zamorApp Escritorio
// además pregunta a la puerta local si la nube ya va por delante del programa: entonces lo que toca es actualizar.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO === "1";
const PUERTA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const URL_WEB = "https://zamorapp-ocupacional.vercel.app";

export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [actualizar, setActualizar] = useState(false);

  useEffect(() => {
    if (!ESCRITORIO || !PUERTA) return;
    fetch(`${PUERTA}/zamorapp/estado`, { credentials: "include" })
      .then((r) => r.json())
      .then((e) => setActualizar(Boolean(e?.actualizar)))
      .catch(() => {});
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6" data-estado={actualizar ? "actualizar" : "error"}>
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        {actualizar ? (
          <>
            <h1 className="text-lg font-semibold">zamorApp Escritorio necesita actualizarse</h1>
            <p className="text-sm text-muted-foreground">
              La nube ya tiene cambios que esta versión del programa no entiende. Tus datos están intactos.
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Menú <strong>zamorApp</strong> (arriba) → <strong>Buscar actualizaciones</strong> → «Actualizar ahora».</li>
              <li>Si dice que ya tienes la más reciente, la nueva versión aún se está publicando: vuelve a intentarlo en unos minutos.</li>
              <li>Mientras tanto puedes trabajar en la web: <a className="text-primary underline" href={URL_WEB} target="_blank" rel="noreferrer">{URL_WEB.replace("https://", "")}</a>.</li>
            </ol>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">No se pudo cargar esta pantalla</h1>
            <p className="text-sm text-muted-foreground">
              Algo falló al preparar los datos. No se perdió nada de lo ya guardado. Revisa la conexión y vuelve a intentarlo.
            </p>
            {error.digest && <p className="text-xs text-muted-foreground">Código: {error.digest}</p>}
          </>
        )}
        <div className="flex gap-2">
          <Button onClick={() => reset()}>Reintentar</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/")}>Ir al inicio</Button>
        </div>
      </div>
    </main>
  );
}
