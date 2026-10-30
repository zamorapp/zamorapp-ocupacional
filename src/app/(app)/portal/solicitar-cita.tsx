"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CalendarPlus, CheckCircle2, Loader2, Search, UserPlus, X } from "lucide-react";
import { Aviso, Campo, CampoSelect } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { buscarPacientes, type PacienteEncontrado } from "../atencion/acciones";
import { solicitarCita } from "./acciones";

type Nuevo = { cedula: string; nombres: string; apellidos: string };

// Número de paso: RR. HH. sigue la solicitud en orden (1 a quién, 2 qué día, 3 qué evaluación)
function Paso({ n }: { n: number }) {
  return <span className="mr-1 inline-grid size-5 place-items-center rounded-full bg-primary text-[0.7rem] font-semibold text-primary-foreground">{n}</span>;
}

export function SolicitarCita({ motivos, manana, empresas, empresaActiva }: { motivos: { id: string; nombre: string }[]; manana: string; empresas: { id: string; nombre: string }[]; empresaActiva: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([]);
  // Varios trabajadores con la misma fecha y motivo en una sola solicitud
  const [elegidos, setElegidos] = useState<PacienteEncontrado[]>([]);
  // Trabajadores que aún no están en la nómina: se registran al enviar la solicitud
  const [nuevos, setNuevos] = useState<Nuevo[]>([]);
  const [ficha, setFicha] = useState<Nuevo | null>(null);
  const [empresaNuevos, setEmpresaNuevos] = useState(empresaActiva ?? empresas[0]?.id ?? "");
  const total = elegidos.length + nuevos.length;
  const [buscando, iniciar] = useTransition();
  const [estado, accion, enviando] = useActionState(solicitarCita, null);

  useEffect(() => {
    const t = setTimeout(() => iniciar(async () => setResultados(await buscarPacientes(texto))), 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    if (estado?.ok) { setAbierto(false); setElegidos([]); setNuevos([]); setFicha(null); setTexto(""); }
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
            <Label className="mb-1.5"><Paso n={1} /> ¿A quién? {total > 0 && <span className="font-normal text-muted-foreground">· {total} elegidos</span>}</Label>
            {total > 0 && (
              <ul className="mb-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {nuevos.map((n) => (
                  <li key={n.cedula} className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs">
                    <input type="hidden" name="nuevo" value={JSON.stringify(n)} />
                    {n.nombres} {n.apellidos} <span className="text-muted-foreground">· nuevo</span>
                    <button type="button" aria-label={`Quitar a ${n.nombres}`} onClick={() => setNuevos((l) => l.filter((x) => x.cedula !== n.cedula))} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3" /></button>
                  </li>
                ))}
                {elegidos.map((p) => (
                  <li key={p.id} className="flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs">
                    <input type="hidden" name="trabajador_id" value={p.id} />
                    {p.nombre}
                    <button type="button" aria-label={`Quitar a ${p.nombre}`} onClick={() => setElegidos((l) => l.filter((x) => x.id !== p.id))} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3" /></button>
                  </li>
                ))}
              </ul>
            )}
            {total === 0 && !ficha && <p className="mb-1.5 text-xs text-muted-foreground">Escribe la cédula o el nombre y tócalo en la lista. Si no aparece, toca «Trabajador nuevo».</p>}
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar trabajador" placeholder={elegidos.length ? "Agregar otro: cédula o nombre" : "Cédula o nombre"} className="h-10 w-full rounded-md border bg-transparent pl-9 pr-9 text-sm" />
              {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </label>
            {texto.trim().length >= 2 && !buscando && pendientes.length === 0 && !ficha && (
              <p className="mt-1 text-xs text-muted-foreground">No está en la nómina. <button type="button" className="font-medium text-primary hover:underline" onClick={() => { const d = texto.replace(/\D/g, ""); setFicha({ cedula: d.length >= 5 ? d : "", nombres: d.length >= 5 ? "" : texto.trim(), apellidos: "" }); setTexto(""); }}>Agregarlo como trabajador nuevo</button></p>
            )}
            {!ficha && (
              <button type="button" onClick={() => setFicha({ cedula: "", nombres: "", apellidos: "" })} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><UserPlus className="size-4" /> Trabajador nuevo (no está en la nómina)</button>
            )}
            {ficha && (
              <div className="mt-2 grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-3" onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}>
                <input value={ficha.cedula} onChange={(e) => setFicha({ ...ficha, cedula: e.target.value })} placeholder="Cédula *" aria-label="Cédula del trabajador nuevo" inputMode="numeric" className="h-9 rounded-md border bg-background px-2 text-sm" />
                <input value={ficha.nombres} onChange={(e) => setFicha({ ...ficha, nombres: e.target.value })} placeholder="Nombres *" aria-label="Nombres del trabajador nuevo" className="h-9 rounded-md border bg-background px-2 text-sm" />
                <input value={ficha.apellidos} onChange={(e) => setFicha({ ...ficha, apellidos: e.target.value })} placeholder="Apellidos *" aria-label="Apellidos del trabajador nuevo" className="h-9 rounded-md border bg-background px-2 text-sm" />
                {empresas.length > 1 && (
                  <select value={empresaNuevos} onChange={(e) => setEmpresaNuevos(e.target.value)} aria-label="Empresa del trabajador nuevo" className="h-9 rounded-md border bg-background px-2 text-sm sm:col-span-3">
                    {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                )}
                <div className="flex items-center justify-end gap-2 sm:col-span-3">
                  <span className="mr-auto text-xs text-muted-foreground">Llena los tres datos y toca «Agregar».</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFicha(null)}>Cancelar</Button>
                  <Button type="button" size="sm" disabled={ficha.cedula.replace(/\D/g, "").length < 5 || !ficha.nombres.trim() || !ficha.apellidos.trim()}
                    onClick={() => { setNuevos((l) => (l.some((x) => x.cedula === ficha.cedula) ? l : [...l, { cedula: ficha.cedula.trim(), nombres: ficha.nombres.trim(), apellidos: ficha.apellidos.trim() }])); setFicha(null); }}>
                    Agregar
                  </Button>
                </div>
              </div>
            )}
            {nuevos.length > 0 && <input type="hidden" name="empresa_nuevos" value={empresaNuevos} />}
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
          <Campo id="fecha" etiqueta={<><Paso n={2} /> ¿Qué día?</>} type="date" min={manana} defaultValue={manana} required />
          <Campo id="hora" etiqueta="Hora (opcional)" type="time" />
          <CampoSelect id="motivo_id" etiqueta={<><Paso n={3} /> Tipo de evaluación</>} defaultValue="" className="sm:col-span-2">
            <option value="">No sé / que lo defina el médico</option>
            {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </CampoSelect>
          <Campo id="nota" etiqueta="Nota (opcional)" className="sm:col-span-2" />
          <div className="flex items-center gap-2 sm:col-span-2">
            <Aviso resultado={estado && !estado.ok ? estado : null} />
            <Button type="submit" className="ml-auto" disabled={enviando || !total}>
              {enviando && <Loader2 className="animate-spin" />} {total > 1 ? `Enviar ${total} solicitudes` : "Enviar solicitud"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {estado?.ok && <p className="flex items-center gap-1.5 text-sm text-ok-texto"><CheckCircle2 className="size-4" /> {estado.mensaje}</p>}
    </div>
  );
}
