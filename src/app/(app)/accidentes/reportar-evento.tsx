"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HardHat, Loader2, Search, X } from "lucide-react";
import { Aviso, Campo, CampoSelect, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { buscarPacientes, type PacienteEncontrado } from "../atencion/acciones";
import { reportarEvento } from "./acciones";

// Ahora en hora de Venezuela, para el campo datetime-local
const ahoraLocal = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 16);

export function ReportarEvento({ habilitado, empresas }: { habilitado: boolean; empresas: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState("accidente");
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([]);
  const [paciente, setPaciente] = useState<PacienteEncontrado | null>(null);
  const [buscando, iniciar] = useTransition();
  const [estado, accion, enviando] = useActionState(reportarEvento, null);

  useEffect(() => {
    if (paciente) return;
    const t = setTimeout(() => iniciar(async () => setResultados(await buscarPacientes(texto))), 250);
    return () => clearTimeout(t);
  }, [texto, paciente]);

  useEffect(() => {
    if (estado?.ok && estado.id) {
      setAbierto(false);
      router.push(`/accidentes/${estado.id}`);
    }
  }, [estado, router]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="lg" disabled={!habilitado} className="bg-alerta text-white hover:bg-alerta/90"><HardHat /> Reportar evento</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Reportar evento</DialogTitle>
          <DialogDescription>Regístralo apenas ocurra: el plazo de 24 h para declarar ante el INPSASEL empieza a correr.</DialogDescription>
        </DialogHeader>
        <form action={accion} className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-3 gap-2 sm:col-span-2">
            {[["accidente", "Accidente"], ["incidente", "Incidente"], ["enfermedad", "Enfermedad ocupacional"]].map(([k, t]) => (
              <label key={k} className={`cursor-pointer rounded-lg border-2 px-3 py-2 text-center text-sm font-medium transition ${tipo === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                <input type="radio" name="tipo" value={k} checked={tipo === k} onChange={() => setTipo(k)} className="sr-only" />
                {t}
              </label>
            ))}
          </div>

          <div className="sm:col-span-2">
            <Label className="mb-1.5">Trabajador {tipo === "incidente" ? "(si lo hubo)" : "*"}</Label>
            {paciente ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <input type="hidden" name="trabajador_id" value={paciente.id} />
                <span className="flex-1"><b>{paciente.nombre}</b> · {paciente.cedula} · {paciente.empresa}</span>
                <button type="button" onClick={() => setPaciente(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
              </div>
            ) : (
              <>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cédula o nombre" className="h-10 w-full rounded-md border bg-transparent pl-9 pr-9 text-sm" />
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

          {!paciente && (
            <CampoSelect id="empresa_id" etiqueta="Empresa" className="sm:col-span-2" defaultValue={empresas[0]?.id}>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </CampoSelect>
          )}

          <Campo id="fecha_hora" etiqueta={tipo === "enfermedad" ? "Fecha y hora del diagnóstico *" : "Fecha y hora del evento *"} type="datetime-local" defaultValue={ahoraLocal()} required />
          {tipo === "accidente" ? (
            <CampoSelect id="subtipo" etiqueta="Tipo de accidente" defaultValue="trabajo">
              <option value="trabajo">En el trabajo</option>
              <option value="in_itinere">In itinere (trayecto)</option>
            </CampoSelect>
          ) : (
            <CampoSelect id="gravedad" etiqueta="Gravedad" defaultValue="">
              <option value="">Sin definir</option>
              <option value="leve">Leve</option>
              <option value="moderado">Moderado</option>
              <option value="grave">Grave</option>
            </CampoSelect>
          )}
          {tipo === "accidente" && (
            <CampoSelect id="gravedad" etiqueta="Gravedad" defaultValue="leve">
              <option value="leve">Leve</option>
              <option value="moderado">Moderado</option>
              <option value="grave">Grave</option>
              <option value="mortal">Mortal</option>
            </CampoSelect>
          )}
          {tipo !== "enfermedad" && <Campo id="lugar" etiqueta="Lugar" placeholder="Área, máquina, dirección…" className={tipo === "accidente" ? "" : "sm:col-span-2"} />}
          <CampoTexto id="descripcion" etiqueta={tipo === "enfermedad" ? "Diagnóstico y exposición sospechada" : "¿Qué pasó?"} rows={3} className="sm:col-span-2" />

          <div className="flex items-center gap-2 sm:col-span-2">
            <Aviso resultado={estado && !estado.ok ? estado : null} />
            <Button type="submit" className="ml-auto" disabled={enviando}>{enviando && <Loader2 className="animate-spin" />} Registrar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
