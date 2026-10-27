"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Confirmación propia de la app, en lugar del confirm() del navegador (que en el programa de escritorio
// muestra «127.0.0.1:… dice» y no sigue el diseño). Uso: `if (!(await confirmar({ ... }))) return;`
export type Pregunta = {
  titulo: string;
  texto?: string;
  accion?: string; // texto del botón que confirma
  cancelar?: string;
  peligro?: boolean; // botón rojo para acciones que borran, anulan o no se deshacen
};

type Pendiente = Pregunta & { responder: (si: boolean) => void };

let mostrar: ((p: Pendiente) => void) | null = null;

export function confirmar(pregunta: Pregunta | string): Promise<boolean> {
  const p = typeof pregunta === "string" ? { titulo: pregunta } : pregunta;
  // Si el diálogo aún no está montado, se usa el del navegador para no perder la confirmación
  if (!mostrar) return Promise.resolve(window.confirm([p.titulo, p.texto].filter(Boolean).join("\n\n")));
  return new Promise((responder) => mostrar!({ ...p, responder }));
}

// Se monta una sola vez en el layout raíz. El foco queda en «Cancelar»: un Enter por descuido nunca firma ni borra.
export function Confirmador() {
  const [actual, setActual] = useState<Pendiente | null>(null);
  const [abierto, setAbierto] = useState(false);
  const respondido = useRef(false);

  useEffect(() => {
    mostrar = (p) => {
      respondido.current = false;
      setActual(p);
      setAbierto(true);
    };
    return () => {
      mostrar = null;
    };
  }, []);

  const responder = (si: boolean) => {
    if (!actual || respondido.current) return;
    respondido.current = true;
    setAbierto(false);
    actual.responder(si);
  };

  const Icono = actual?.peligro ? AlertTriangle : HelpCircle;

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && responder(false)}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <div className="flex gap-4">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", actual?.peligro ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
            <Icono className="size-5" />
          </span>
          <div className="min-w-0 space-y-1.5 pt-1">
            <DialogTitle className="text-base leading-snug">{actual?.titulo}</DialogTitle>
            <DialogDescription className={cn(!actual?.texto && "sr-only")}>{actual?.texto || actual?.titulo}</DialogDescription>
          </div>
        </div>
        <DialogFooter>
          <Button autoFocus variant="outline" onClick={() => responder(false)}>{actual?.cancelar ?? "Cancelar"}</Button>
          <Button variant={actual?.peligro ? "destructive" : "default"} onClick={() => responder(true)}>{actual?.accion ?? "Aceptar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
