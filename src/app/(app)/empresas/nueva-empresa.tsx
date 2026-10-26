"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Empresa } from "@/lib/empresas";
import { MESES } from "@/lib/periodos";
import { guardarEmpresa } from "./acciones";

function Campo({ id, etiqueta, className, ...props }: React.ComponentProps<"input"> & { etiqueta: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>
      <Input id={id} name={id} className="h-10" {...props} />
    </div>
  );
}

// Formulario de empresa: sin "empresa" crea una nueva; con "empresa" edita sus datos
export function FormEmpresa({ habilitado, empresa }: { habilitado: boolean; empresa?: Empresa }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState(guardarEmpresa, null);
  const e = empresa;

  useEffect(() => {
    if (estado?.ok) setAbierto(false);
  }, [estado]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {e ? (
          <Button variant="ghost" size="sm" disabled={!habilitado}><Pencil /> Editar</Button>
        ) : (
          <Button disabled={!habilitado}><Plus /> Nueva empresa</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{e ? e.razonSocial : "Nueva empresa cliente"}</DialogTitle>
          <DialogDescription>Los datos legales se usan en constancias e informes ante el INPSASEL.</DialogDescription>
        </DialogHeader>
        <form action={accion} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {e && <input type="hidden" name="id" value={e.id} />}
          <Campo id="razon_social" etiqueta="Razón social *" required defaultValue={e?.razonSocial} className="sm:col-span-2" />
          <Campo id="rif" etiqueta="RIF *" placeholder="J-30123456-7" required defaultValue={e?.rif} />
          <Campo id="nil" etiqueta="NIL" placeholder="Número de identificación laboral" defaultValue={e?.nil ?? ""} />
          <Campo id="actividad" etiqueta="Actividad económica" defaultValue={e?.actividad ?? ""} className="sm:col-span-2" />
          <Campo id="estado" etiqueta="Estado" defaultValue={e?.estado ?? ""} />
          <Campo id="municipio" etiqueta="Municipio" defaultValue={e?.municipio ?? ""} />
          <Campo id="parroquia" etiqueta="Parroquia" defaultValue={e?.parroquia ?? ""} />
          <Campo id="sector" etiqueta="Sector económico" defaultValue={e?.sector ?? ""} />
          <Campo id="direccion" etiqueta="Dirección" defaultValue={e?.direccion ?? ""} className="sm:col-span-2" />
          <Campo id="telefono" etiqueta="Teléfono" type="tel" defaultValue={e?.telefono ?? ""} />
          <Campo id="correo" etiqueta="Correo" type="email" defaultValue={e?.correo ?? ""} />
          <div>
            <Label htmlFor="servicio_sst" className="mb-1.5">Servicio de SST</Label>
            <select id="servicio_sst" name="servicio_sst" defaultValue={e?.servicioSst ?? ""} className="h-10 w-full rounded-md border bg-transparent px-3 text-sm">
              <option value="">Sin definir</option>
              <option value="propio">Propio</option>
              <option value="mancomunado">Mancomunado</option>
              <option value="tercerizado">Tercerizado</option>
            </select>
          </div>
          <Campo id="servicio_sst_registro" etiqueta="Registro del Servicio de SST" type="date" defaultValue={e?.servicioSstRegistro ?? ""} />
          <Campo id="psst_registro" etiqueta="Registro del PSST" type="date" defaultValue={e?.psstRegistro ?? ""} />
          <div className="sm:col-span-2">
            <Label htmlFor="mes_inicio_gestion" className="mb-1.5">La gestión (año de trabajo) empieza en</Label>
            <select id="mes_inicio_gestion" name="mes_inicio_gestion" defaultValue={e?.mesInicioGestion ?? 1} className="h-10 w-full rounded-md border bg-transparent px-3 text-sm">
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Los trimestres del informe de vigilancia se cuentan desde este mes. Ejemplo: febrero → I trimestre febrero-abril.</p>
          </div>

          {estado && !estado.ok && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{estado.mensaje}</p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" />} {e ? "Guardar cambios" : "Guardar empresa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
