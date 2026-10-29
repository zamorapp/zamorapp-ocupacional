"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Botón de un formulario que, apenas se toca, se bloquea y muestra «Buscando…»/«Guardando…» hasta que llega la
// respuesta: así nunca parece que el clic no hizo nada, y un doble clic no envía dos veces.
// Con <form> de next/form (filtros por la URL) o con action={…} (acciones del servidor).
export function BotonEnviar({ children, pendiente = "Cargando…", ...props }: React.ComponentProps<typeof Button> & { pendiente?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled} aria-busy={pending || undefined}>
      {pending ? <><Loader2 className="animate-spin" /> {pendiente}</> : children}
    </Button>
  );
}
