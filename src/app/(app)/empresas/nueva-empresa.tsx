"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearEmpresa } from "./acciones";

function Campo({ id, etiqueta, className, ...props }: React.ComponentProps<"input"> & { etiqueta: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>
      <Input id={id} name={id} className="h-10" {...props} />
    </div>
  );
}

export function NuevaEmpresa({ habilitado }: { habilitado: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState(crearEmpresa, null);

  useEffect(() => {
    if (estado?.ok) setAbierto(false);
  }, [estado]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button disabled={!habilitado}><Plus /> Nueva empresa</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva empresa cliente</DialogTitle>
          <DialogDescription>Los datos legales se usan en constancias e informes ante el INPSASEL.</DialogDescription>
        </DialogHeader>
        <form action={accion} className="grid gap-4 sm:grid-cols-2">
          <Campo id="razon_social" etiqueta="Razón social *" required className="sm:col-span-2" />
          <Campo id="rif" etiqueta="RIF *" placeholder="J-30123456-7" required />
          <Campo id="nil" etiqueta="NIL" placeholder="Número de identificación laboral" />
          <Campo id="actividad" etiqueta="Actividad económica" className="sm:col-span-2" />
          <Campo id="estado" etiqueta="Estado" />
          <Campo id="municipio" etiqueta="Municipio" />
          <Campo id="direccion" etiqueta="Dirección" className="sm:col-span-2" />
          <Campo id="telefono" etiqueta="Teléfono" type="tel" />
          <Campo id="correo" etiqueta="Correo" type="email" />
          <div>
            <Label htmlFor="servicio_sst" className="mb-1.5">Servicio de SST</Label>
            <select id="servicio_sst" name="servicio_sst" defaultValue="" className="h-10 w-full rounded-md border bg-transparent px-3 text-sm">
              <option value="">Sin definir</option>
              <option value="propio">Propio</option>
              <option value="mancomunado">Mancomunado</option>
              <option value="tercerizado">Tercerizado</option>
            </select>
          </div>
          <Campo id="servicio_sst_registro" etiqueta="Registro del Servicio de SST" type="date" />
          <Campo id="psst_registro" etiqueta="Registro del PSST" type="date" />

          {estado && !estado.ok && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{estado.mensaje}</p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" />} Guardar empresa
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
