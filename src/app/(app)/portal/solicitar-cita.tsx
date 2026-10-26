"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CalendarPlus, Loader2, Search, X } from "lucide-react";
import { Aviso, Campo, CampoSelect } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { buscarPacientes, type PacienteEncontrado } from "../atencion/acciones";
import { solicitarCita } from "./acciones";

export function SolicitarCita({ motivos, manana }: { motivos: { id: string; nombre: string }[]; manana: string }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([]);
  const [trabajador, setTrabajador] = useState<PacienteEncontrado | null>(null);
  const [buscando, iniciar] = useTransition();
  const [estado, accion, enviando] = useActionState(solicitarCita, null);

  useEffect(() => {
    if (trabajador) return;
    const t = setTimeout(() => iniciar(async () => setResultados(await buscarPacientes(texto))), 250);
    return () => clearTimeout(t);
  }, [texto, trabajador]);

  useEffect(() => {
    if (estado?.ok) { setAbierto(false); setTrabajador(null); setTexto(""); }
  }, [estado]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="lg"><CalendarPlus /> Solicitar cita</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar cita</DialogTitle>
          <DialogDescription>El servicio médico la confirma o te propone otra hora. Te llega un aviso en cada paso.</DialogDescription>
        </DialogHeader>
        <form action={accion} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="mb-1.5">Trabajador *</Label>
            {trabajador ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <input type="hidden" name="trabajador_id" value={trabajador.id} />
                <span className="flex-1"><b>{trabajador.nombre}</b> · {trabajador.cedula}</span>
                <button type="button" onClick={() => setTrabajador(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
              </div>
            ) : (
              <>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cédula o nombre" className="h-10 w-full rounded-md border bg-transparent pl-9 pr-9 text-sm" />
                  {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </label>
                {resultados.length > 0 && (
                  <ul className="mt-1 max-h-40 divide-y overflow-y-auto rounded-md border">
                    {resultados.map((p) => (
                      <li key={p.id}><button type="button" onClick={() => setTrabajador(p)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">{p.nombre} <span className="text-muted-foreground">· {p.cedula}</span></button></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <Campo id="fecha" etiqueta="Fecha *" type="date" min={manana} defaultValue={manana} required />
          <Campo id="hora" etiqueta="Hora preferida" type="time" />
          <CampoSelect id="motivo_id" etiqueta="Tipo de evaluación" defaultValue="" className="sm:col-span-2">
            <option value="">Sin definir</option>
            {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </CampoSelect>
          <Campo id="nota" etiqueta="Nota para el servicio médico" className="sm:col-span-2" />
          <div className="flex items-center gap-2 sm:col-span-2">
            <Aviso resultado={estado && !estado.ok ? estado : null} />
            <Button type="submit" className="ml-auto" disabled={enviando || !trabajador}>{enviando && <Loader2 className="animate-spin" />} Enviar solicitud</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
