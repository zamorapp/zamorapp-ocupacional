"use client";

// zamorApp Escritorio: estado de la conexión y de los cambios por subir, en el encabezado. En la web no aparece.
// Con internet y todo al día queda discreto («Al día · 08:30») para que «Sincronizar ahora» esté siempre a mano
// (Cesar, 30-oct-2026).
import { AlertTriangle, CheckCircle2, CloudOff, CloudUpload, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { sincronizarAhora, useEstadoEscritorio } from "@/lib/escritorio-estado";
import { cn } from "@/lib/utils";

// Como el resto de la app (auditoría, bitácora de envíos): «08:30 a. m.»
const HORA = new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" });

export function IndicadorSincronia() {
  const e = useEstadoEscritorio();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const problemas = e.conflictos + e.rechazados;
  if (!e.conocido) return null;

  const atascada = e.enLinea && e.errorSincronia; // con internet, pero la última sincronía falló: la hora ya no es de «al día»
  const alDia = e.enLinea && !e.pendientes && !problemas && !e.horaSinAncla && !atascada;
  const hora = e.ultimaSincronia ? HORA.format(new Date(e.ultimaSincronia)) : null;
  // Sin internet manda el ícono de la nube tachada aunque la hora esté sin verificar: la píldora dice «Sin internet»
  const Icono = problemas ? AlertTriangle : !e.enLinea ? CloudOff : e.horaSinAncla ? AlertTriangle : alDia ? CheckCircle2 : CloudUpload;
  const sinSincronizar = hora ? `Sin sincronizar desde ${hora}` : "Sin sincronizar";
  const texto = problemas ? `${problemas} por revisar` : !e.enLinea ? (e.pendientes ? `Sin internet · ${e.pendientes}` : "Sin internet") : e.pendientes ? `Subiendo ${e.pendientes}` : e.horaSinAncla ? "Hora sin verificar" : atascada ? sinSincronizar : hora ? `Al día · ${hora}` : "Al día";

  return (
    <DropdownMenu onOpenChange={(abierto) => abierto && setAviso("")}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Estado de la sincronía: ${texto}`}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            problemas ? "bg-alerta/15 text-alerta-texto" : e.horaSinAncla || !e.enLinea || atascada ? "bg-aviso/20 text-aviso-texto" : alDia ? "text-muted-foreground hover:bg-muted" : "bg-primary/10 text-primary",
          )}
        >
          <Icono className={cn("size-4", alDia && "text-ok-texto")} aria-hidden />
          <span className="hidden sm:inline">{texto}</span>
          {(problemas || e.pendientes) > 0 && <span className="sm:hidden">{problemas || e.pendientes}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 space-y-2 p-3 text-sm">
        <DropdownMenuLabel className="p-0 text-sm">{e.enLinea ? "Conectado a la nube" : "Sin internet"}</DropdownMenuLabel>
        <p className="text-muted-foreground">
          {e.pendientes
            ? `${e.pendientes} cambio${e.pendientes === 1 ? "" : "s"} guardado${e.pendientes === 1 ? "" : "s"} en esta PC ${e.enLinea ? "subiendo a la nube." : "por subir. Suben solos cuando vuelva internet."}`
            : "Todo lo de esta PC ya está en la nube."}
        </p>
        <p className="text-xs text-muted-foreground">
          {hora ? `Última sincronía: ${hora}. ` : ""}Con internet se sincroniza sola cada 30 segundos.
        </p>
        {problemas > 0 && (
          <p className="text-alerta-texto">
            {problemas === 1
              ? "1 cambio no se pudo subir porque otro equipo lo cambió antes o la nube no lo aceptó. Nada se borró: queda guardado para revisarlo."
              : `${problemas} cambios no se pudieron subir porque otro equipo los cambió antes o la nube no los aceptó. Nada se borró: quedan guardados para revisarlos.`}
          </p>
        )}
        {atascada && (
          <p className="text-aviso-texto">No se pudieron bajar los cambios de la nube. {e.motivo ?? "Se reintenta sola cada 30 segundos."} Lo guardado en esta PC está a salvo.</p>
        )}
        {e.apartadas > 0 && (
          <p className="text-xs text-muted-foreground">
            {e.apartadas === 1 ? "1 registro de la nube no entró en esta PC" : `${e.apartadas} registros de la nube no entraron en esta PC`}: quedan apartados y se reintentan solos, sin frenar a los demás.
          </p>
        )}
        {e.horaSinAncla && (
          <p className="text-aviso-texto">La PC arrancó sin internet y aún no tiene la hora verificada con la nube. Puedes atender y cerrar consultas; las firmas esperan a que vuelva internet.</p>
        )}
        <Button size="sm" variant="outline" className="w-full" disabled={ocupado}
          onClick={async (ev) => { ev.preventDefault(); setOcupado(true); setAviso(await sincronizarAhora()); setOcupado(false); }}>
          {ocupado ? <Loader2 className="animate-spin" /> : <RefreshCw />} {e.enLinea ? "Sincronizar ahora" : "Reintentar conexión"}
        </Button>
        {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
