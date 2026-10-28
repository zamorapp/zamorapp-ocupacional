"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Aviso, Campo, CampoSelect, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { reportarEvento } from "../../accidentes/acciones";
import { horaLocalCaracas } from "@/lib/fecha";

// Registrar un accidente o enfermedad ocupacional sin salir de la consulta: el trabajador y la consulta ya van
// cargados. Usa la misma acción que Accidentes (reportarEvento); la declaración completa (INPSASEL, COVENIN 474)
// se termina en la ficha del evento.

const ahoraLocal = () => horaLocalCaracas();

type Props = {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  consultaId: string;
  trabajador: { id: string; nombre: string; cedula: string; empresa: string };
  tipoSugerido: "accidente" | "enfermedad";
  descripcion: string;
};

export function RegistrarAccidente({ abierto, onAbierto, consultaId, trabajador, tipoSugerido, descripcion }: Props) {
  const [tipo, setTipo] = useState<string>(tipoSugerido);
  const [estado, accion, enviando] = useActionState(reportarEvento, null);
  const [inicio] = useState(ahoraLocal);

  return (
    <Sheet open={abierto} onOpenChange={onAbierto}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Registrar evento</SheetTitle>
          <SheetDescription>El plazo de 24 h para declarar ante el INPSASEL empieza a correr desde el evento o el diagnóstico.</SheetDescription>
        </SheetHeader>
        {estado?.ok && estado.id ? (
          <div className="space-y-4 px-4">
            <p className="flex items-center gap-2 rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok-texto"><CheckCircle2 className="size-4" /> Evento registrado y enlazado a esta consulta.</p>
            <p className="text-sm text-muted-foreground">Completa la lesión, los testigos y la declaración cuando termines la consulta.</p>
            <Button asChild className="w-full"><Link href={`/accidentes/${estado.id}`} target="_blank">Completar la declaración <ArrowRight /></Link></Button>
            <Button variant="outline" className="w-full" onClick={() => onAbierto(false)}>Volver a la consulta</Button>
          </div>
        ) : (
          <form action={accion} className="grid grid-cols-1 gap-4 px-4 pb-6 sm:grid-cols-2">
            <input type="hidden" name="trabajador_id" value={trabajador.id} />
            <input type="hidden" name="consulta_id" value={consultaId} />
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm sm:col-span-2">
              <b>{trabajador.nombre}</b> · {trabajador.cedula}{trabajador.empresa && ` · ${trabajador.empresa}`}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              {[["accidente", "Accidente de trabajo"], ["enfermedad", "Enfermedad ocupacional"]].map(([k, t]) => (
                <label key={k} className={`cursor-pointer rounded-lg border-2 px-3 py-2 text-center text-sm font-medium transition ${tipo === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  <input type="radio" name="tipo" value={k} checked={tipo === k} onChange={() => setTipo(k)} className="sr-only" />
                  {t}
                </label>
              ))}
            </div>
            <Campo id="fecha_hora" etiqueta={tipo === "enfermedad" ? "Fecha y hora del diagnóstico *" : "Fecha y hora del accidente *"} type="datetime-local" defaultValue={inicio} required />
            {tipo === "accidente" ? (
              <CampoSelect id="subtipo" etiqueta="Tipo de accidente" defaultValue="trabajo">
                <option value="trabajo">En el trabajo</option>
                <option value="in_itinere">In itinere (trayecto)</option>
              </CampoSelect>
            ) : <span className="hidden sm:block" />}
            <CampoSelect key={tipo} id="gravedad" etiqueta="Gravedad" defaultValue={tipo === "accidente" ? "leve" : ""}>
              {tipo === "enfermedad" && <option value="">Sin definir</option>}
              <option value="leve">Leve</option>
              <option value="moderado">Moderado</option>
              <option value="grave">Grave</option>
              {tipo === "accidente" && <option value="mortal">Mortal</option>}
            </CampoSelect>
            {tipo === "accidente" && <Campo id="lugar" etiqueta="Lugar" placeholder="Área, máquina, dirección…" />}
            <CampoTexto id="descripcion" etiqueta={tipo === "enfermedad" ? "Diagnóstico y exposición sospechada" : "¿Qué pasó?"} rows={4} defaultValue={descripcion} className="sm:col-span-2" />
            <div className="flex items-center gap-2 sm:col-span-2">
              <Aviso resultado={estado && !estado.ok ? estado : null} />
              <Button type="submit" className="ml-auto" disabled={enviando}>{enviando && <Loader2 className="animate-spin" />} Registrar</Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
