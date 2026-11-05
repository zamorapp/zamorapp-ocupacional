"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EliminarPapelera } from "@/components/app/eliminar-papelera";
import { rutaConDeshacer } from "@/components/app/franja-deshacer";
import type { TipoPapelera } from "@/lib/papelera";

/** «Eliminar…» de cualquier documento (solo el administrador clínico; la base lo vuelve a verificar). Va a la Papelera
 *  y lleva a `destino` con la franja «Deshacer», que devuelve a `volver` (por omisión, la página actual).
 *  Sin `destino`, se queda en la página actual y la refresca. */
export function BotonEliminar({ tipo, id, nombre, destino, volver, size = "sm", variant = "ghost", className, children }: {
  tipo: TipoPapelera; id: string; nombre: string; destino?: string; volver?: string;
  size?: "sm" | "default" | "icon"; variant?: "outline" | "ghost"; className?: string; children?: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant={variant} size={size} className={cn("text-muted-foreground hover:text-alerta-texto", className)} onClick={() => setAbierto(true)}
        title="Para algo repetido o hecho por error. Queda en la Papelera, con Deshacer." aria-label={children ? undefined : `Eliminar ${nombre}`}>
        <Trash2 />{size === "icon" ? null : <> {children ?? "Eliminar…"}</>}
      </Button>
      <EliminarPapelera tipo={tipo} id={id} nombre={nombre} abierto={abierto} onAbierto={setAbierto}
        onEliminado={(papeleraId, mensaje) => {
          const aqui = volver ?? `${window.location.pathname}${window.location.search}`;
          const ruta = rutaConDeshacer(destino ?? aqui, papeleraId, mensaje, aqui);
          if (destino) router.push(ruta); else { router.replace(ruta, { scroll: false }); router.refresh(); }
        }} />
    </>
  );
}
