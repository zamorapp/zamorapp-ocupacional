"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hora12 } from "@/lib/propuesta";
import { cn } from "@/lib/utils";
import { agendaPortal } from "./acciones";

type Agenda = Awaited<ReturnType<typeof agendaPortal>>;
const DIA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const corta = (f: string) => { const [a, m, d] = f.split("-").map(Number); return `${DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}/${m}`; };

/**
 * Día y hora para pedir una cita. Si el servicio cargó su horario, RR. HH. solo toca horas con cupo (y ve los próximos
 * días con cupo); si no, escribe la hora libremente como antes. Deja «fecha» y «hora» en el formulario.
 */
export function ElegirHora({ empresaId, min, etiqueta, personas = 1, inicial, alCambiar }: {
  empresaId: string; min: string; etiqueta: React.ReactNode; personas?: number; inicial?: string;
  alCambiar?: (v: { fecha: string; hora: string }) => void;
}) {
  const uid = useId();
  const [fecha, setFecha] = useState(inicial ?? min);
  const [hora, setHora] = useState("");
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!empresaId || !fecha) return;
    let vigente = true;
    setCargando(true);
    agendaPortal(empresaId, fecha).then((a) => { if (vigente) { setAgenda(a); setCargando(false); } }).catch(() => vigente && setCargando(false));
    return () => { vigente = false; };
  }, [empresaId, fecha]);
  // Al cambiar de día, la hora elegida deja de valer si ese día no la tiene libre
  useEffect(() => {
    if (agenda?.configurado && hora && !agenda.horas?.some((h) => h.hora === hora && h.libres > 0)) setHora("");
  }, [agenda, hora]);
  const aviso = useRef(alCambiar);
  useEffect(() => { aviso.current = alCambiar; });
  useEffect(() => { aviso.current?.({ fecha, hora }); }, [fecha, hora]);

  const horas = agenda?.configurado ? agenda.horas ?? [] : [];
  const libresDesde = horas.filter((h) => hora && h.hora >= hora).reduce((s, h) => s + h.libres, 0);
  const elegida = horas.find((h) => h.hora === hora);

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${uid}-fecha`} className="mb-1.5">{etiqueta}</Label>
          <Input id={`${uid}-fecha`} name="fecha" type="date" min={min} value={fecha} onChange={(e) => setFecha(e.target.value)} required className="h-10" />
        </div>
        {!agenda?.configurado && (
          <div>
            <Label htmlFor={`${uid}-hora`} className="mb-1.5">Hora (opcional)</Label>
            <Input id={`${uid}-hora`} name="hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-10" />
          </div>
        )}
      </div>
      {agenda?.configurado && (
        <div className="space-y-2">
          <input type="hidden" name="hora" value={hora} />
          <p className="flex items-center gap-2 text-sm font-medium">Horas disponibles {cargando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}</p>
          {horas.some((h) => h.libres > 0) ? (
            <div role="radiogroup" aria-label="Horas disponibles" className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {horas.map((h) => (
                <button key={h.hora} type="button" role="radio" aria-checked={hora === h.hora} disabled={h.libres < 1} onClick={() => setHora(h.hora)}
                  className={cn("rounded-lg border px-2 py-1.5 text-sm transition",
                    hora === h.hora ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60 hover:bg-primary/5",
                    h.libres < 1 && "cursor-not-allowed text-muted-foreground line-through opacity-50 hover:border-border hover:bg-transparent")}>
                  {hora12(h.hora)}
                  <span className={cn("block text-[0.68rem]", hora === h.hora ? "opacity-85" : "text-muted-foreground")}>{h.libres < 1 ? "lleno" : h.libres === 1 ? "queda 1" : `quedan ${h.libres}`}</span>
                </button>
              ))}
            </div>
          ) : !cargando && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Ese día el servicio médico no tiene horas libres.</p>
          )}
          {elegida && personas > elegida.libres && (
            <p className="text-xs text-muted-foreground">
              {libresDesde >= personas
                ? `Son ${personas} trabajadores: se repartirán desde las ${hora12(hora)} en los turnos siguientes con cupo.`
                : `Desde esa hora solo quedan ${libresDesde} cupos para ${personas} trabajadores: elija una hora más temprana u otro día.`}
            </p>
          )}
          {(agenda.dias?.filter((d) => d.fecha >= min).length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" /> Días con cupo:</span>
              {agenda.dias!.filter((d) => d.fecha >= min).slice(0, 8).map((d) => (
                <button key={d.fecha} type="button" onClick={() => setFecha(d.fecha)}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs transition hover:border-primary", d.fecha === fecha && "border-primary bg-primary/10 font-medium text-primary")}>
                  {corta(d.fecha)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
