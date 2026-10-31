"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Undo2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deshacerInactivar, inactivarTrabajadores, type Inactivados, reingresarTrabajador } from "../acciones";
import { fecha } from "@/lib/pacientes";

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";
// Motivos frecuentes: un toque los escribe (el campo sigue siendo libre)
const MOTIVOS = ["No aparece en la nómina (RR. HH.)", "Renunció sin egreso", "Fin de contrato", "Traído del SAME sin egreso"];

/** Botón «Inactivar» de la ficha: ya no está en la empresa pero no tuvo egreso. Con «Deshacer». */
export function InactivarTrabajador({ trabajadorId, nombre, hoy }: { trabajadorId: string; nombre: string; hoy: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [dia, setDia] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [hecho, setHecho] = useState<Inactivados | null>(null);
  const [ocupado, iniciar] = useTransition();

  const inactivar = () => iniciar(async () => {
    const r = await inactivarTrabajadores([trabajadorId], dia, motivo);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok && r.hecho) setHecho(r.hecho);
  });
  const deshacer = () => iniciar(async () => {
    if (!hecho) return;
    const r = await deshacerInactivar(hecho);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) { setHecho(null); setAbierto(false); router.refresh(); }
  });

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v && hecho) router.refresh(); setAbierto(v); setMensaje(null); setHecho(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1 xl:flex-none"><UserMinus /> Inactivar</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inactivar a {nombre}</DialogTitle>
          <DialogDescription>
            Para quien ya no está en la empresa pero nunca tuvo egreso. No es un egreso: deja de contar en estadísticas, conteos y
            alertas, y sus datos e historia se conservan. Si vuelve, pulsas «Reingresar».
          </DialogDescription>
        </DialogHeader>
        {hecho ? (
          <div className="space-y-3">
            <p role="status" className="text-sm text-ok-texto">{mensaje?.texto}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={deshacer} disabled={ocupado}>
                {ocupado ? <Loader2 className="animate-spin" /> : <Undo2 />} Deshacer
              </Button>
              <Button className="flex-1" onClick={() => { setAbierto(false); router.refresh(); }} disabled={ocupado}>Listo</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="ina-fecha" className="mb-1.5">Desde (último día en la empresa, si lo sabes)</Label>
              <Input id="ina-fecha" type="date" max={hoy} className="h-10" value={dia} onChange={(e) => setDia(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ina-motivo" className="mb-1.5">Motivo (opcional)</Label>
              <Input id="ina-motivo" maxLength={200} className="h-10" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Escribe o toca uno" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MOTIVOS.map((m) => (
                  <button key={m} type="button" onClick={() => setMotivo(m)}
                    className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground">{m}</button>
                ))}
              </div>
            </div>
            {mensaje && !mensaje.ok && <p role="alert" className="text-sm text-destructive">{mensaje.texto}</p>}
            <Button className="w-full" onClick={inactivar} disabled={ocupado || !dia}>
              {ocupado && <Loader2 className="animate-spin" />} Inactivar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type PropsReingreso = {
  trabajadorId: string;
  nombre: string;
  estado: "inactivo" | "egresado";
  salida: string | null;
  motivo: string | null;
  empresaActual: { id: string; nombre: string; activa: boolean };
  empresas: { id: string; nombre: string }[] | null; // activas; null = este usuario no reingresa (RR. HH.)
  hoy: string;
};

/** Franja de un trabajador inactivo o egresado, con «Reingresar» (misma u otra empresa, período nuevo desde cero). */
export function ReingresarTrabajador({ trabajadorId, nombre, estado, salida, motivo, empresaActual, empresas, hoy }: PropsReingreso) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empresa, setEmpresa] = useState(empresaActual.activa ? empresaActual.id : "");
  const [ingreso, setIngreso] = useState(hoy);
  const [cargo, setCargo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const nombreEmpresa = empresas?.find((e) => e.id === empresa)?.nombre ?? "";

  const reingresar = () => iniciar(async () => {
    setError(null);
    const r = await reingresarTrabajador(trabajadorId, empresa, ingreso, cargo);
    if (!r.ok) return setError(r.mensaje);
    setAbierto(false);
    router.refresh();
  });

  return (
    <div className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2.5 text-sm">
      <p className="min-w-56 flex-1">
        <span className="font-medium">{estado === "inactivo" ? "Inactivo" : "Egresado"}{salida && ` desde el ${fecha(salida)}`}</span>
        {motivo && <span className="text-muted-foreground"> · {motivo}</span>}
        <span className="block text-muted-foreground">No cuenta en los conteos ni estadísticas de {empresaActual.nombre}. Sus datos e historia se conservan.</span>
      </p>
      {empresas && (
        <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); setError(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><RotateCcw /> Reingresar</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reingresar a {nombre}</DialogTitle>
              <DialogDescription>
                Se usan sus datos personales y empieza un período nuevo desde la fecha de ingreso, también si vuelve a la misma
                empresa. Queda «Sin evaluar»: la aptitud, los vencimientos y las alertas cuentan desde la nueva evaluación de ingreso.
                Sus consultas anteriores siguen en su historia.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="rei-empresa" className="mb-1.5">Empresa</Label>
                <select id="rei-empresa" className={SELECT} value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
                  <option value="">Elige la empresa…</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}{e.id === empresaActual.id ? " (la misma)" : ""}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rei-ingreso" className="mb-1.5">Fecha de ingreso</Label>
                  <Input id="rei-ingreso" type="date" max={hoy} className="h-10" value={ingreso} onChange={(e) => setIngreso(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="rei-cargo" className="mb-1.5">Cargo (opcional)</Label>
                  <Input id="rei-cargo" className="h-10" maxLength={120} value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Se crea si no existe" />
                </div>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={reingresar} disabled={ocupado || !empresa || !ingreso}>
                {ocupado && <Loader2 className="animate-spin" />} {empresa ? `Reingresar a ${nombreEmpresa}` : "Reingresar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
