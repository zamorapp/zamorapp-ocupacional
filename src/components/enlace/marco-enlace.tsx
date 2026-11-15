import { cn } from "@/lib/utils";

// Marco común de las pantallas que abren por enlace el paciente, el trabajador y RR. HH. (Cesar, 06-nov): mismo
// estilo que el menú de botones. Fondo con brillo suave del color de la marca, encabezado con el servicio y
// entrada animada solo con opacidad y desplazamiento (motion-safe: respeta «reducir movimiento»). Sin imágenes
// pesadas: celulares de gama baja con datos móviles.
export function MarcoEnlace({ servicio, subtitulo, ancho = "max-w-lg", centrado = false, children }: { servicio: string; subtitulo: string; ancho?: string; centrado?: boolean; children: React.ReactNode }) {
  return (
    <main className={cn("relative isolate min-h-dvh overflow-hidden bg-muted/30 px-4 py-6 sm:py-10", centrado && "flex items-center justify-center")}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 size-72 rounded-full bg-primary/10 blur-3xl" />
      <div className={cn("mx-auto w-full space-y-5", ancho)}>
        <div className="flex items-center gap-3 motion-safe:animate-aparecer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icono.svg" alt="" className="size-11 rounded-xl shadow-sm ring-1 ring-primary/20" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{servicio}</p>
            <p className="text-xs text-muted-foreground">{subtitulo}</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

// Tarjeta del marco, que entra un poco después del encabezado
export function TarjetaEnlace({ className, retraso = 1, children, ...resto }: React.ComponentProps<"section"> & { retraso?: number }) {
  return (
    <section {...resto} style={{ animationDelay: `${retraso * 60}ms`, ...resto.style }} className={cn("rounded-2xl border bg-card p-6 shadow-sm motion-safe:animate-aparecer", className)}>
      {children}
    </section>
  );
}

// Botón grande tipo tarjeta (documento para descargar, beneficio, acción): ícono en cuadro de color + título + detalle
export function FichaBoton({ icono: Icono, titulo, detalle, indice = 0, children }: { icono: React.ComponentType<{ className?: string }>; titulo: React.ReactNode; detalle?: React.ReactNode; indice?: number; children?: React.ReactNode }) {
  return (
    <span className="flex w-full items-center gap-3 motion-safe:animate-aparecer" style={{ animationDelay: `${120 + Math.min(indice, 8) * 40}ms` }}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-200 motion-safe:group-hover:scale-105">
        <Icono className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{titulo}</span>
        {detalle && <span className="block text-xs font-normal text-muted-foreground">{detalle}</span>}
      </span>
      {children}
    </span>
  );
}
