"use client";

// zamorApp Escritorio: estado de la conexión y de los cambios por subir, en el encabezado. En la web no aparece,
// y con internet y todo al día tampoco: solo se ve cuando hay algo que saber.
import { AlertTriangle, CloudOff, CloudUpload, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { sincronizarAhora, useEstadoEscritorio } from "@/lib/escritorio-estado";
import { cn } from "@/lib/utils";

export function IndicadorSincronia() {
  const e = useEstadoEscritorio();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const problemas = e.conflictos + e.rechazados;
  if (!e.conocido || (e.enLinea && !e.pendientes && !problemas && !e.horaSinAncla)) return null;

  const Icono = problemas || e.horaSinAncla ? AlertTriangle : e.enLinea ? CloudUpload : CloudOff;
  const texto = problemas ? `${problemas} por revisar` : !e.enLinea ? (e.pendientes ? `Sin internet · ${e.pendientes}` : "Sin internet") : e.pendientes ? `Subiendo ${e.pendientes}` : "Revisa la hora";

  return (
    <DropdownMenu onOpenChange={(abierto) => abierto && setAviso("")}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Estado de la sincronía: ${texto}`}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            problemas ? "bg-alerta/15 text-alerta-texto" : e.horaSinAncla || !e.enLinea ? "bg-aviso/20 text-aviso-texto" : "bg-primary/10 text-primary",
          )}
        >
          <Icono className="size-4" aria-hidden />
          <span className="hidden sm:inline">{texto}</span>
          {!problemas && e.pendientes > 0 && <span className="sm:hidden">{e.pendientes}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 space-y-2 p-3 text-sm">
        <DropdownMenuLabel className="p-0 text-sm">{e.enLinea ? "Conectado a la nube" : "Sin internet"}</DropdownMenuLabel>
        <p className="text-muted-foreground">
          {e.pendientes
            ? `${e.pendientes} cambio${e.pendientes === 1 ? "" : "s"} guardado${e.pendientes === 1 ? "" : "s"} en esta PC ${e.enLinea ? "subiendo a la nube." : "por subir. Suben solos cuando vuelva internet."}`
            : "Todo lo de esta PC ya está en la nube."}
        </p>
        {problemas > 0 && (
          <p className="text-alerta-texto">
            {problemas} cambio{problemas === 1 ? "" : "s"} no se pudo subir porque otro equipo lo cambió antes o la nube no lo aceptó. Nada se borró: queda guardado para revisarlo.
          </p>
        )}
        {e.horaSinAncla && (
          <p className="text-aviso-texto">La PC arrancó sin internet y usa la hora de Windows. Si cambiaste la fecha para el SAME, vuelve a ponerla al día antes de firmar.</p>
        )}
        <Button size="sm" variant="outline" className="w-full" disabled={ocupado}
          onClick={async (ev) => { ev.preventDefault(); setOcupado(true); setAviso(await sincronizarAhora()); setOcupado(false); }}>
          {ocupado ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar ahora
        </Button>
        {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
