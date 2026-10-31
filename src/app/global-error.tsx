"use client";

// Último recurso: un fallo en el layout raíz (o en la propia pantalla de error) reemplaza toda la página. Sin esto Next
// muestra en blanco «Application error: a client-side exception…» (31-oct, celular de Cesar). Aquí se ve la causa,
// se reintenta y, si quedaron partes de una versión anterior, se recarga sola una vez.
import "./globals.css";
import { useEffect, useState } from "react";
import { actualizarApp } from "@/components/app/actualizar-app";
import { detalle, esVersionVieja, normalizarError, recargarUnaVez } from "@/lib/error-pantalla";
import { leerTema } from "@/lib/tema";

const ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO === "1";

export default function ErrorGlobal({ error: lanzado }: { error: Error & { digest?: string }; reset: () => void }) {
  const error = normalizarError(lanzado);
  const [trabajando, setTrabajando] = useState(false);
  useEffect(() => {
    // Modo oscuro: esta pantalla reemplaza la página entera y su script de tema no corre al dibujarse desde React
    const tema = leerTema();
    document.documentElement.classList.toggle("dark", tema === "oscuro" || (tema === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches));
    // Igual que error.tsx: una recarga automática por minuto como máximo
    const t = setTimeout(recargarUnaVez, esVersionVieja(normalizarError(lanzado)) ? 0 : 2000);
    return () => clearTimeout(t);
  }, [lanzado]);
  // El layout raíz falló: se recarga entera (reset() volvería a dibujar el mismo layout roto)
  const reintentar = () => { setTrabajando(true); window.location.reload(); };
  const actualizar = () => { setTrabajando(true); actualizarApp(); };

  return (
    <html lang="es-VE" suppressHydrationWarning>
      <head>
        <title>zamorApp</title>
      </head>
      <body className="antialiased">
        <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
          <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
            <h1 className="text-lg font-semibold">zamorApp no pudo abrir esta pantalla</h1>
            <p className="text-sm text-muted-foreground">
              No se perdió nada de lo ya guardado. Toca <strong>Reintentar</strong>; {ESCRITORIO ? "si vuelve a salir, cierra y abre zamorApp." : <>si vuelve a salir, <strong>Actualizar la app</strong> trae la versión más reciente.</>}
            </p>
            <p className="break-words text-[11px] text-muted-foreground opacity-70">{detalle(error)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={trabajando} onClick={reintentar} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
                {trabajando ? "Abriendo…" : "Reintentar"}
              </button>
              {!ESCRITORIO && <button type="button" disabled={trabajando} onClick={actualizar} className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium disabled:opacity-60">
                Actualizar la app
              </button>}
              {/* Navegación completa: el enrutador de la app pudo quedar roto */}
              <button type="button" onClick={() => window.location.assign("/")} className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline">Ir al inicio</button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
