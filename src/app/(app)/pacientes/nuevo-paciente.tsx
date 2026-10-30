"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntradaCargo } from "@/components/app/entrada-cargo";
import { crearPaciente } from "./acciones";

type Props = {
  habilitado: boolean;
  empresas: { id: string; nombre: string }[];
  empresaInicial: string;
  tipos: { id: string; nombre: string }[];
  cargos: Record<string, string[]>;
};

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";

function Campo({ id, etiqueta, className, ...props }: React.ComponentProps<"input"> & { etiqueta: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>
      <Input id={id} name={id} className="h-10" {...props} />
    </div>
  );
}

export function NuevoPaciente({ habilitado, empresas, empresaInicial, tipos, cargos }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empresa, setEmpresa] = useState(empresaInicial);
  const [estado, accion, enviando] = useActionState(crearPaciente, null);

  useEffect(() => {
    if (estado?.ok && estado.id) {
      setAbierto(false);
      router.push(`/pacientes/${estado.id}`);
    }
  }, [estado, router]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button disabled={!habilitado} title={habilitado ? undefined : "Registra primero una empresa"}>
          <UserPlus /> Nuevo paciente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo paciente</DialogTitle>
          <DialogDescription>Abre el expediente único del trabajador.</DialogDescription>
        </DialogHeader>
        <form action={accion} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="empresa_id" className="mb-1.5">Empresa *</Label>
            <select id="empresa_id" name="empresa_id" value={empresa} onChange={(e) => setEmpresa(e.target.value)} required className={SELECT}>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <Campo id="cedula" etiqueta="Cédula *" placeholder="V-12345678" required autoFocus />
          <div>
            <Label htmlFor="tipo_paciente_id" className="mb-1.5">Tipo de paciente</Label>
            <select id="tipo_paciente_id" name="tipo_paciente_id" defaultValue="" className={SELECT}>
              <option value="">Sin definir</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <Campo id="nombres" etiqueta="Nombres *" required />
          <Campo id="apellidos" etiqueta="Apellidos *" required />
          <div>
            <Label htmlFor="sexo" className="mb-1.5">Sexo</Label>
            <select id="sexo" name="sexo" defaultValue="" className={SELECT}>
              <option value="">Sin definir</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </div>
          <Campo id="fecha_nacimiento" etiqueta="Fecha de nacimiento" type="date" />
          <div>
            <Label htmlFor="cargo" className="mb-1.5">Cargo</Label>
            <EntradaCargo id="cargo" name="cargo" cargos={cargos[empresa] ?? []} className="h-10" placeholder="Escribe o elige; si no existe se agrega" />
          </div>
          <Campo id="dependencia" etiqueta="Dependencia" placeholder="Se crea si no existe" />
          <Campo id="fecha_ingreso" etiqueta="Fecha de ingreso" type="date" />
          <div>
            <Label htmlFor="estado" className="mb-1.5">Estado</Label>
            <select id="estado" name="estado" defaultValue="activo" className={SELECT}>
              <option value="aspirante">Aspirante</option>
              <option value="activo">Activo</option>
            </select>
          </div>
          <Campo id="telefono" etiqueta="Teléfono" type="tel" />
          <Campo id="correo" etiqueta="Correo" type="email" />

          {estado && !estado.ok && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{estado.mensaje}</p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" />} Guardar paciente
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
