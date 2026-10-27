"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { FilePlus2, Loader2, Search, X } from "lucide-react";
import { Aviso, CampoSelect, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { buscarPacientes, type PacienteEncontrado } from "@/app/(app)/atencion/acciones";
import { crearSolicitud } from "@/app/(app)/solicitudes/acciones";

// Solicitud extra al servicio médico: desde el portal (la empresa) o registrada por el servicio
export function NuevaSolicitud({ tipos, empresas, servicio }: { tipos: { id: string; nombre: string }[]; empresas: { id: string; nombre: string }[]; servicio?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([]);
  const [trabajador, setTrabajador] = useState<PacienteEncontrado | null>(null);
  const [buscando, iniciar] = useTransition();
  const [estado, accion, enviando] = useActionState(crearSolicitud, null);

  useEffect(() => {
    const t = setTimeout(() => iniciar(async () => setResultados(await buscarPacientes(texto))), 300);
    return () => clearTimeout(t);
  }, [texto]);
  useEffect(() => {
    if (estado?.ok) { setAbierto(false); setTrabajador(null); setTexto(""); }
  }, [estado]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogTrigger asChild>
          <Button variant={servicio ? "outline" : "default"}><FilePlus2 /> {servicio ? "Registrar solicitud" : "Nueva solicitud"}</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{servicio ? "Registrar solicitud de la empresa" : "Solicitud al servicio médico"}</DialogTitle>
            <DialogDescription>Informes, copias de constancias, evaluaciones de puesto y lo que la empresa necesite. Llega un aviso en cada cambio de estado.</DialogDescription>
          </DialogHeader>
          <form action={accion} className="grid grid-cols-1 gap-4">
            <CampoSelect id="tipo_id" etiqueta="¿Qué necesitas? *" required defaultValue="">
              <option value="" disabled>Elige…</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </CampoSelect>
            <div>
              <Label className="mb-1.5">Trabajador (opcional)</Label>
              {trabajador ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <input type="hidden" name="trabajador_id" value={trabajador.id} />
                  <span className="min-w-0 flex-1 truncate">{trabajador.nombre} <span className="text-muted-foreground">· {trabajador.cedula} · {trabajador.empresa}</span></span>
                  <button type="button" aria-label="Quitar trabajador" onClick={() => setTrabajador(null)} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
                </div>
              ) : (
                <>
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar trabajador" placeholder="Cédula o nombre" className="h-10 w-full rounded-md border bg-transparent pl-9 pr-9 text-sm" />
                    {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                  </label>
                  {texto.trim().length >= 2 && resultados.length > 0 && (
                    <ul className="mt-1 max-h-40 divide-y overflow-y-auto rounded-md border">
                      {resultados.map((p) => (
                        <li key={p.id}><button type="button" onClick={() => { setTrabajador(p); setTexto(""); }} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">{p.nombre} <span className="text-muted-foreground">· {p.cedula} · {p.empresa}</span></button></li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            {!trabajador && empresas.length > 1 && (
              <CampoSelect id="empresa_id" etiqueta="Empresa *" required defaultValue="">
                <option value="" disabled>Elige…</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </CampoSelect>
            )}
            {!trabajador && empresas.length === 1 && <input type="hidden" name="empresa_id" value={empresas[0].id} />}
            <CampoTexto id="detalle" etiqueta="Detalle *" rows={4} required minLength={3} maxLength={2000} placeholder="Para qué lo necesitas, fechas, a quién va dirigido…" />
            <Aviso resultado={estado?.ok ? null : estado} />
            <Button type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Enviar solicitud"}</Button>
          </form>
        </DialogContent>
      </Dialog>
      {estado?.ok && <p className="text-xs text-ok-texto">{estado.mensaje}</p>}
    </div>
  );
}
