"use client";

import { useState } from "react";
import { Check, Copy, Download, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ES_ESCRITORIO } from "@/lib/huella";

/** Muestra una sola vez los 10 códigos de respaldo recién creados, para copiarlos o descargarlos. */
export function VerCodigosRespaldo({ codigos, alTerminar, textoSeguir = "Ya los guardé" }: { codigos: string[]; alTerminar: () => void; textoSeguir?: string }) {
  const [copiado, setCopiado] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const texto = `zamorApp · códigos de respaldo de la verificación en dos pasos\nCada código sirve una sola vez, si pierdes el teléfono.\n\n${codigos.join("\n")}\n`;

  const descargar = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    a.download = "zamorapp-codigos-de-respaldo.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    setGuardado(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10"><KeyRound className="size-6 text-primary" /></span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Guarda tus códigos de respaldo</h2>
          <p className="text-sm text-muted-foreground">
            Si pierdes el teléfono, entra con tu contraseña y uno de estos códigos. Cada uno sirve una sola vez.
            Guárdalos fuera de este equipo (impresos o en tu correo): no se vuelven a mostrar.
          </p>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
        {codigos.map((c) => <li key={c} className="text-center tracking-wider">{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        {/* En la ventana del escritorio un enlace de descarga puede no hacer nada: ahí solo se copian */}
        {!ES_ESCRITORIO && <Button type="button" variant="outline" onClick={descargar}><Download /> Descargar</Button>}
        <Button type="button" variant="outline" onClick={() => navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setGuardado(true); }).catch(() => {})}>
          {copiado ? <Check /> : <Copy />} {copiado ? "Copiados" : "Copiar"}
        </Button>
      </div>
      <Button type="button" className="h-11 w-full" onClick={alTerminar} disabled={!guardado}>{textoSeguir}</Button>
      {!guardado && <p className="text-center text-xs text-muted-foreground">{ES_ESCRITORIO ? "Cópialos y pégalos en tu correo o un documento para seguir." : "Descárgalos o cópialos para seguir."}</p>}
    </div>
  );
}
