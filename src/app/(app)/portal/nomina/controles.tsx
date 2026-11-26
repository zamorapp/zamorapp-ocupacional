"use client";

import { useActionState, useState } from "react";
import { Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crearEnlaceNomina } from "./acciones";

export function CrearEnlaceNomina({ empresa }: { empresa: string }) {
  const [error, crear, pendiente] = useActionState(crearEnlaceNomina.bind(null, empresa), "");
  return (
    <form action={crear} className="space-y-2">
      <Button type="submit" disabled={pendiente}>
        {pendiente ? <Loader2 className="animate-spin" /> : <Link2 />} {pendiente ? "Creando…" : "Crear enlace"}
      </Button>
      {error && <p className="text-sm text-alerta-texto" role="alert">{error}</p>}
    </form>
  );
}

export function CopiarEnlaceNomina({ enlace }: { enlace: string }) {
  const [mensaje, setMensaje] = useState("");
  const [mostrar, setMostrar] = useState(false);
  return (
    <div className="max-w-full space-y-2">
      <Button type="button" variant="outline" onClick={async () => {
        try {
          await navigator.clipboard.writeText(enlace);
          setMensaje("Enlace copiado.");
        } catch {
          setMostrar(true);
          setMensaje("Selecciona el enlace para copiarlo.");
        }
      }}><Copy /> Copiar enlace</Button>
      {mostrar && <input readOnly value={enlace} aria-label="Enlace de actualización" className="w-full rounded border bg-background p-2 text-sm" onFocus={(e) => e.target.select()} />}
      {mensaje && <p className="text-sm text-muted-foreground" role="status">{mensaje}</p>}
    </div>
  );
}
