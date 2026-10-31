"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { elegirEmpresa } from "@/components/app/acciones";
import { cambiarEstadoEmpresa } from "./acciones";

type Props = { empresaId: string; nombre: string; trabajadores: number; activa: boolean; editable: boolean };

// Inactivar / reactivar una empresa con la que ya no se trabaja. Inactivar pide confirmar y dice exactamente qué
// pasa (nada se borra); reactivar es de un toque. «Abrir sus datos» la elige en el encabezado para ver sus
// trabajadores y reportes sin reactivarla.
export function EstadoEmpresa({ empresaId, nombre, trabajadores, activa, editable }: Props) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const cambiar = (nueva: boolean) => iniciar(async () => {
    setMensaje(null);
    const r = await cambiarEstadoEmpresa(empresaId, nueva);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setConfirmar(false);
  });
  const abrir = () => iniciar(async () => {
    await elegirEmpresa(empresaId);
    router.push("/pacientes");
  });

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {!activa && (
        <button type="button" disabled={ocupado} onClick={abrir} className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-60">
          <FolderOpen className="size-3" /> Abrir sus datos
        </button>
      )}
      {editable && (activa ? (
        <button type="button" disabled={ocupado} onClick={() => setConfirmar(true)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline disabled:opacity-60">
          <Archive className="size-3" /> Inactivar
        </button>
      ) : (
        <button type="button" disabled={ocupado} onClick={() => cambiar(true)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-60">
          {ocupado ? <Loader2 className="size-3 animate-spin" /> : <ArchiveRestore className="size-3" />} Reactivar
        </button>
      ))}
      {mensaje && <span role="status" className={mensaje.ok ? "text-ok-texto" : "text-alerta-texto"}>{mensaje.texto}</span>}

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Inactivar {nombre}?</DialogTitle>
            <DialogDescription>No se borra nada. Puedes reactivarla cuando quieras.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>
              La empresa y sus <strong>{trabajadores} {trabajadores === 1 ? "trabajador" : "trabajadores"}</strong> dejan de salir en el selector,
              Pacientes, Inicio, avisos y formularios.
            </li>
            <li>Consultas, reposos, documentos, dependencias y cargos quedan guardados tal cual, por razones legales.</li>
            <li>Si uno de sus trabajadores vuelve como candidato a otra empresa, búscalo por cédula y pásalo: su historia va con él.</li>
            <li>Para ver sus datos o reportes: Empresas › Ver inactivas › Abrir sus datos.</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)} disabled={ocupado}>Cancelar</Button>
            <Button onClick={() => cambiar(false)} disabled={ocupado}>
              {ocupado ? <Loader2 className="animate-spin" /> : <Archive />} Inactivar
            </Button>
          </DialogFooter>
          {mensaje && !mensaje.ok && <p role="status" className="text-sm text-alerta-texto">{mensaje.texto}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
