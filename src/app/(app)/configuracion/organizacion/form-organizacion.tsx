"use client";

import { useActionState } from "react";
import { PLANTILLA_APTITUD, PLANTILLA_CITA } from "@/lib/mensajes";
import { Loader2 } from "lucide-react";
import { Aviso, Campo, CampoSelect, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardarOrganizacion } from "../acciones";

type Ajustes = {
  palabra_aptitud?: string;
  titulo_constancia?: string;
  observacion_idoneidad?: string | null;
  firma_paciente_constancia?: boolean;
  firma_medico_ocupacional?: boolean;
  reposo_pie_copia?: string | null;
  orden_nota?: string | null;
  mensaje_cita?: string | null;
  mensaje_aptitud?: string | null;
  reposo_pie_original?: string | null;
  meses_examen_periodico?: number;
};

type Org = { nombre: string; rif: string | null; direccion: string | null; telefono: string | null; correo: string | null; ajustes: unknown };

function Casilla({ id, etiqueta, defecto }: { id: string; etiqueta: string; defecto: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={id} defaultChecked={defecto} className="size-4 accent-[var(--primary)]" />
      {etiqueta}
    </label>
  );
}

export function FormOrganizacion({ org, editable }: { org: Org; editable: boolean }) {
  const [estado, accion, enviando] = useActionState(guardarOrganizacion, null);
  const a = (org.ajustes ?? {}) as Ajustes;

  return (
    <form action={accion} className="space-y-4">
      <fieldset disabled={!editable} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del servicio</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Campo id="nombre" etiqueta="Nombre *" defaultValue={org.nombre} required className="sm:col-span-2" />
            <Campo id="rif" etiqueta="RIF" defaultValue={org.rif ?? ""} placeholder="J-00000000-0" />
            <Campo id="telefono" etiqueta="Teléfono" defaultValue={org.telefono ?? ""} />
            <Campo id="correo" etiqueta="Correo" type="email" defaultValue={org.correo ?? ""} />
            <Campo id="direccion" etiqueta="Dirección" defaultValue={org.direccion ?? ""} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Aptitud y constancia</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <CampoSelect id="palabra_aptitud" etiqueta="Palabra base de la aptitud" defaultValue={a.palabra_aptitud ?? "Elegible"}>
              <option value="Elegible">Elegible / No elegible</option>
              <option value="Apto">Apto / No apto</option>
              <option value="Recomendable">Recomendable / No recomendable</option>
            </CampoSelect>
            <Campo id="titulo_constancia" etiqueta="Título de la constancia" defaultValue={a.titulo_constancia ?? "Constancia de Aptitud"} />
            <CampoTexto
              id="observacion_idoneidad"
              etiqueta="Nota de idoneidad (pie de la constancia)"
              rows={2}
              className="sm:col-span-2"
              defaultValue={a.observacion_idoneidad ?? "La clasificación de aptitud se basa en el protocolo de evaluación clínica ocupacional del servicio."}
            />
            <Campo id="meses_examen_periodico" etiqueta="Vigencia del examen periódico (meses)" type="number" min={1} max={36} defaultValue={a.meses_examen_periodico ?? 12} />
            <div className="flex flex-col justify-end gap-2 pb-1">
              <Casilla id="firma_medico_ocupacional" etiqueta="Espacio de firma del médico ocupacional" defecto={a.firma_medico_ocupacional ?? true} />
              <Casilla id="firma_paciente_constancia" etiqueta="Espacio de firma del trabajador" defecto={a.firma_paciente_constancia ?? false} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Reposo médico</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Campo id="reposo_pie_copia" etiqueta="Pie de la copia" defaultValue={a.reposo_pie_copia ?? "COPIA SERVICIO MÉDICO"} />
            <Campo id="reposo_pie_original" etiqueta="Pie del original" defaultValue={a.reposo_pie_original ?? "ORIGINAL RECURSOS HUMANOS"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Mensajes por WhatsApp y correo</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">{"Se abren en tu WhatsApp o tu correo listos para enviar. Campos que se reemplazan: {nombre}, {cedula}, {fecha}, {hora}, {motivo}, {empresa}, {servicio}, {aptitud}, {observacion}."}</p>
            <CampoTexto id="mensaje_cita" etiqueta="Recordatorio de cita (al trabajador)" rows={3} defaultValue={a.mensaje_cita ?? PLANTILLA_CITA} />
            <CampoTexto id="mensaje_aptitud" etiqueta="Resultado de aptitud (a RR. HH. de la empresa)" rows={3} defaultValue={a.mensaje_aptitud ?? PLANTILLA_APTITUD} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Orden de exámenes</CardTitle></CardHeader>
          <CardContent>
            <Campo id="orden_nota" etiqueta="Nota al pie (ej. ayuno de 8 horas, laboratorio convenido)" defaultValue={a.orden_nota ?? ""} />
          </CardContent>
        </Card>
      </fieldset>

      <div className="flex items-center gap-3">
        <Aviso resultado={estado} />
        {editable ? (
          <Button type="submit" className="ml-auto" disabled={enviando}>{enviando && <Loader2 className="animate-spin" />} Guardar cambios</Button>
        ) : (
          <p className="text-sm text-muted-foreground">Solo el administrador puede cambiar estos datos.</p>
        )}
      </div>
    </form>
  );
}
