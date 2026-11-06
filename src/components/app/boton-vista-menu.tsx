"use client";

import { LayoutGrid, PanelLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { aplicarVistaMenu, leerVistaMenu, type VistaMenu } from "@/lib/vista-menu";
import { cn } from "@/lib/utils";

// Vista actual, que se actualiza al cambiarla en cualquier botón de la pantalla
const suscribir = (aviso: () => void) => {
  window.addEventListener("zamorapp-vista-menu", aviso);
  return () => window.removeEventListener("zamorapp-vista-menu", aviso);
};
const useVistaMenu = () => useSyncExternalStore<VistaMenu>(suscribir, leerVistaMenu, () => "barra");

// Encabezado: «Menú» abre la vista de botones. Con la vista de botones elegida es el botón principal (la barra
// lateral está escondida); con la barra, un ícono discreto para entrar a los botones cuando se quiera.
export function BotonMenu() {
  const vista = useVistaMenu();
  const ruta = usePathname();
  const aqui = ruta === "/menu";
  return (
    <Link
      href="/menu"
      data-boton="menu-botones"
      aria-current={aqui ? "page" : undefined}
      title="Menú de botones"
      className={cn(
        // Solo en pantallas anchas: en el celular ya están ☰ y la barra inferior
        "hidden h-10 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors lg:inline-flex",
        vista === "botones"
          ? aqui ? "bg-primary/10 text-primary" : "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <LayoutGrid className="size-[18px]" aria-hidden />
      <span className={cn(vista === "botones" ? "" : "sr-only")}>Menú</span>
    </Link>
  );
}

// Interruptor entre barra lateral y botones (barra lateral y pantalla /menu)
export function CambiarVistaMenu({ className, alCambiar }: { className?: string; alCambiar?: () => void }) {
  const vista = useVistaMenu();
  const router = useRouter();
  const botones = vista === "botones";
  return (
    <button
      type="button"
      data-boton="cambiar-vista-menu"
      onClick={() => {
        aplicarVistaMenu(botones ? "barra" : "botones");
        alCambiar?.();
        if (!botones) router.push("/menu");
      }}
      className={cn("inline-flex items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", className)}
    >
      {botones ? <PanelLeft className="size-[18px]" aria-hidden /> : <LayoutGrid className="size-[18px]" aria-hidden />}
      {botones ? "Usar barra lateral" : "Ver menú como botones"}
    </button>
  );
}
