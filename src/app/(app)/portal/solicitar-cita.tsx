"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CalendarPlus, CheckCircle2, Loader2, Search, X } from "lucide-react";
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
  // Varios trabajadores con la misma fecha y motivo en una sola solicitud
  const [elegidos, setElegidos] = useState<PacienteEncontrado[]>([]);
  const [buscando, iniciar] = useTransition();
  const [estado, accion, enviando] = useActionState(solicitarCita, null);

  useEffect(() => {
    const t = setTimeout(() => iniciar(async () => setResultados(await buscarPacientes(texto))), 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    if (estado?.ok) { setAbierto(false); setElegidos([]); setTexto(""); }
  }, [estado]);

  const agregar = (p: PacienteEncontrado) => {
    setElegidos((l) => (l.some((x) => x.id === p.id) ? l : [...l, p]));
    setTexto("");
  };
  const pendientes = resultados.filter((p) => !elegidos.some((x) => x.id === p.id));

  return (
    <div className="flex flex-col items-end gap-1">
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="lg"><CalendarPlus /> Solicitar cita</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar cita</DialogTitle>
          <DialogDescription>Para uno o varios trabajadores a la vez. El servicio médico confirma o propone otra hora, y te llega un aviso en cada paso.</DialogDescription>
        </DialogHeader>
        <form action={accion} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="mb-1.5">Trabajadores * {elegidos.length > 0 && <span className="font-normal text-muted-foreground">· {elegidos.length} elegidos</span>}</Label>
            {elegidos.length > 0 && (
              <ul className="mb-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {elegidos.map((p) => (
                  <li key={p.id} className="flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs">
                    <input type="hidden" name="trabajador_id" value={p.id} />
                    {p.nombre}
                    <button type="button" aria-label={`Quitar a ${p.nombre}`} onClick={() => setElegidos((l) => l.filter((x) => x.id !== p.id))} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3" /></button>
                  </li>
                ))}
              </ul>
            )}
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar trabajador" placeholder={elegidos.length ? "Agregar otro: cédula o nombre" : "Cédula o nombre"} className="h-10 w-full rounded-md border bg-transparent pl-9 pr-9 text-sm" />
              {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </label>
            {texto.trim().length >= 2 && pendientes.length > 0 && (
              <ul className="mt-1 max-h-40 divide-y overflow-y-auto rounded-md border">
                {pendientes.length > 1 && (
                  <li><button type="button" onClick={() => { setElegidos((l) => [...l, ...pendientes].slice(0, 200)); setTexto(""); }} className="w-full px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted">Agregar los {pendientes.length}</button></li>
                )}
                {pendientes.map((p) => (
                  <li key={p.id}><button type="button" onClick={() => agregar(p)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">{p.nombre} <span className="text-muted-foreground">· {p.cedula}</span></button></li>
                ))}
              </ul>
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
            <Button type="submit" className="ml-auto" disabled={enviando || !elegidos.length}>
              {enviando && <Loader2 className="animate-spin" />} {elegidos.length > 1 ? `Enviar ${elegidos.length} solicitudes` : "Enviar solicitud"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {estado?.ok && <p className="flex items-center gap-1.5 text-sm text-ok-texto"><CheckCircle2 className="size-4" /> {estado.mensaje}</p>}
    </div>
  );
}
