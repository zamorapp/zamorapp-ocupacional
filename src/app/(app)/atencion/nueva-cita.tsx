"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CalendarPlus, Loader2, Search, X } from "lucide-react";
import { Aviso, Campo, CampoSelect } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RegistroRapido } from "@/components/app/registro-rapido";
import { buscarPacientes, type PacienteEncontrado } from "./acciones";
import { crearCita } from "./citas-acciones";

type Props = {
  habilitado: boolean;
  fecha: string;
  motivos: { id: string; nombre: string; grupo: string | null }[];
  empresas: { id: string; nombre: string }[];
  empresaActiva: string | null;
};

export function NuevaCita({ habilitado, fecha, motivos, empresas, empresaActiva }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([]);
  // Texto cuya búsqueda ya terminó: el registro sale solo después de una búsqueda sin resultados y sigue
  // montado mientras se corrige el texto (no se pierde lo que el médico ya escribió en él)
  const [buscado, setBuscado] = useState<string | null>(null);
  const [paciente, setPaciente] = useState<PacienteEncontrado | null>(null);
  const [buscando, iniciar] = useTransition();
  const [estado, accion, enviando] = useActionState(crearCita, null);

  useEffect(() => {
    if (paciente) return;
    const t = setTimeout(() => iniciar(async () => {
      const r = await buscarPacientes(texto);
      setResultados(r);
      setBuscado(texto);
    }), 250);
    return () => clearTimeout(t);
  }, [texto, paciente]);

  useEffect(() => {
    if (estado?.ok) {
      setAbierto(false);
      setPaciente(null);
      setTexto("");
    }
  }, [estado]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!habilitado}><CalendarPlus /> Agendar</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agendar cita</DialogTitle>
          <DialogDescription>O marca «Llegó ahora» para pasarlo directo a la cola de espera.</DialogDescription>
        </DialogHeader>
        {/* El paciente va fuera del formulario de la cita: así el registro rápido (otro formulario) queda justo debajo */}
        <div>
          <Label className="mb-1.5">Paciente *</Label>
          {paciente ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <input type="hidden" name="trabajador_id" value={paciente.id} form="form-cita" />
              <span className="flex-1"><b>{paciente.nombre}</b> · {paciente.cedula} · {paciente.empresa}</span>
              <button type="button" onClick={() => setPaciente(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
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
                    <li key={p.id}>
                      <button type="button" onClick={() => setPaciente(p)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {p.nombre} <span className="text-muted-foreground">· {p.cedula} · {p.empresa}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        {!paciente && texto.trim().length >= 2 && (buscado?.trim().length ?? 0) >= 2 && resultados.length === 0 && (
          <div className="space-y-2">
            <p className="text-center text-sm text-muted-foreground">Ningún paciente coincide con «{buscado?.trim()}».</p>
            <RegistroRapido texto={texto} empresas={empresas} empresaActiva={empresaActiva} clinico={false} alRegistrar={setPaciente} />
          </div>
        )}
        <form id="form-cita" action={accion} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="fecha" etiqueta="Fecha *" type="date" defaultValue={fecha} required />
          <Campo id="hora" etiqueta="Hora" type="time" />
          <CampoSelect id="motivo_id" etiqueta="Motivo" defaultValue="" className="sm:col-span-2">
            <option value="">Sin definir</option>
            {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </CampoSelect>
          <Campo id="observacion" etiqueta="Observación" className="sm:col-span-2" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="en_espera" className="size-4 accent-[var(--primary)]" /> Llegó ahora (pasa a la cola de espera)
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Aviso resultado={estado && !estado.ok ? estado : null} />
            <Button type="submit" className="ml-auto" disabled={enviando || !paciente}>{enviando && <Loader2 className="animate-spin" />} Guardar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
