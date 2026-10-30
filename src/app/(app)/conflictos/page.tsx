import type { Metadata } from "next";
import { ListaConflictos } from "./lista-conflictos";

export const metadata: Metadata = { title: "Conflictos y rechazados" };

// Solo existe en el programa de escritorio: la lista vive en la puerta de esta PC, no en la nube
export default function Conflictos() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Conflictos y rechazados</h1>
        <p className="text-muted-foreground">Cambios guardados en esta PC que la nube no aceptó. Nada se perdió: compara las dos versiones y elige cuál queda.</p>
      </div>
      <ListaConflictos />
    </div>
  );
}
