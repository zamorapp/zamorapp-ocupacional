"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Aviso, Campo } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { guardarPerfil } from "../acciones";

type Perfil = {
  nombre_completo: string;
  cedula: string | null;
  telefono: string | null;
  mpps: string | null;
  colegio_medicos: string | null;
  registro_inpsasel: string | null;
  especialidad?: string | null;
  correo?: string | null;
} | null;

export function FormPerfil({ perfil, editable }: { perfil: Perfil; editable: boolean }) {
  const [estado, accion, enviando] = useActionState(guardarPerfil, null);
  return (
    <form action={accion} className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="nombre_completo" etiqueta="Nombre completo *" defaultValue={perfil?.nombre_completo ?? ""} required className="sm:col-span-2" />
          <Campo id="cedula" etiqueta="Cédula" defaultValue={perfil?.cedula ?? ""} placeholder="V-12345678" />
          <Campo id="telefono" etiqueta="Teléfono" defaultValue={perfil?.telefono ?? ""} />
          <Campo id="especialidad" etiqueta="Especialidad" defaultValue={perfil?.especialidad ?? ""} placeholder="Medicina del Trabajo" ayuda="Sale bajo tu nombre en los documentos" />
          <Campo id="correo" etiqueta="Correo (sale impreso bajo tu firma y lo ve tu equipo)" type="email" defaultValue={perfil?.correo ?? ""} />
          <Campo id="mpps" etiqueta="Nº MPPS" defaultValue={perfil?.mpps ?? ""} ayuda="Obligatorio en el récipe (Res. MPPS 028 y 031 de 2013)" />
          <Campo id="colegio_medicos" etiqueta="Nº Colegio de Médicos" defaultValue={perfil?.colegio_medicos ?? ""} />
          <Campo
            id="registro_inpsasel"
            etiqueta="Registro INPSASEL"
            defaultValue={perfil?.registro_inpsasel ?? ""}
            ayuda="Necesario para firmar como médico ocupacional"
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>
      <div className="flex items-center gap-3">
        <Aviso resultado={estado} />
        <Button type="submit" className="ml-auto" disabled={!editable || enviando}>
          {enviando && <Loader2 className="animate-spin" />} Guardar perfil
        </Button>
      </div>
    </form>
  );
}
