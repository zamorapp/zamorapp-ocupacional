"use client";

import { useEffect, useState, useTransition } from "react";
import { ClipboardPlus, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buscarPacientes, iniciarConsulta, type PacienteEncontrado } from "./acciones";

export function NuevaConsulta({ habilitado }: { habilitado: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([]);
  const [buscando, iniciarBusqueda] = useTransition();
  const [abriendo, iniciarApertura] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => iniciarBusqueda(async () => setResultados(await buscarPacientes(texto))), 250);
    return () => clearTimeout(t);
  }, [texto]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="lg" disabled={!habilitado}><ClipboardPlus /> Nueva consulta</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva consulta</DialogTitle>
          <DialogDescription>Busca al paciente por cédula o nombre.</DialogDescription>
        </DialogHeader>
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Cédula o nombre"
            className="h-11 w-full rounded-lg border bg-card pl-9 pr-9 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </label>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border empty:hidden">
          {resultados.map((p) => (
            <li key={p.id}>
              <button
                disabled={abriendo}
                onClick={() =>
                  iniciarApertura(async () => {
                    setError(null);
                    const r = await iniciarConsulta(p.id);
                    if (r && !r.ok) setError(r.mensaje);
                  })
                }
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/60 disabled:opacity-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.nombre}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.cedula} · {p.empresa}</div>
                </div>
                {abriendo ? <Loader2 className="size-4 animate-spin" /> : <ClipboardPlus className="size-4 text-primary" />}
              </button>
            </li>
          ))}
        </ul>
        {texto.trim().length >= 2 && !buscando && resultados.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Sin resultados. Regístralo primero en Pacientes.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
