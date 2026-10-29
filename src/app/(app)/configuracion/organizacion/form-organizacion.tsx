"use client";

import { useActionState } from "react";
import { PLANTILLA_APTITUD, PLANTILLA_CITA } from "@/lib/mensajes";
import { Loader2 } from "lucide-react";
import { Aviso, Campo, CampoSelect, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardarOrganizacion } from "../acciones";
import { CERTIFICACION_TRABAJADOR, NOTA_CERTIFICADO_SACS, NOTA_IDONEIDAD, NOTA_PREEMPLEO_VIH } from "@/lib/mensajes";

type Ajustes = {
  palabra_aptitud?: string;
  titulo_constancia?: string;
  observacion_idoneidad?: string | null;
  firma_paciente_constancia?: boolean;
  firma_medico_ocupacional?: boolean;
  reposo_pie_copia?: string | null;
  orden_nota?: string | null;
  orden_nota_preempleo?: string | null;
  constancia_copias?: boolean;
  mensaje_cita?: string | null;
  mensaje_aptitud?: string | null;
  certificado_titulo?: string | null;
  certificado_nota?: string | null;
  firma_sello_separados?: boolean;
  reposo_pie_original?: string | null;
  meses_examen_periodico?: number;
  recordatorio_resultados_dias?: number;
  centinela_correo?: boolean;
  dias_equipo_confianza?: number;
  membrete_lema?: string | null;
  certificacion_trabajador?: string | null;
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
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo id="nombre" etiqueta="Nombre *" defaultValue={org.nombre} required className="sm:col-span-2" />
            <Campo id="rif" etiqueta="RIF" defaultValue={org.rif ?? ""} placeholder="J-00000000-0" />
            <Campo id="telefono" etiqueta="Teléfono" defaultValue={org.telefono ?? ""} />
            <Campo id="correo" etiqueta="Correo" type="email" defaultValue={org.correo ?? ""} />
            <Campo id="direccion" etiqueta="Dirección" defaultValue={org.direccion ?? ""} />
            <Campo id="membrete_lema" etiqueta="Lema bajo el nombre (membrete)" defaultValue={a.membrete_lema ?? ""} placeholder="Servicios en Medicina Ocupacional · Ergonomía" className="sm:col-span-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Aptitud y constancia</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoSelect id="palabra_aptitud" etiqueta="Palabra base de la aptitud" defaultValue={a.palabra_aptitud ?? "Elegible"}>
              <option value="Elegible">Elegible / No elegible</option>
              <option value="Apto">Apto / No apto</option>
              <option value="Recomendable">Recomendable / No recomendable</option>
            </CampoSelect>
            <Campo id="titulo_constancia" etiqueta="Título de la constancia" defaultValue={a.titulo_constancia ?? "Constancia de Aptitud"} />
            <CampoTexto
              id="observacion_idoneidad"
              etiqueta="Nota de idoneidad (pie de la constancia; vacío para no imprimirla)"
              rows={2}
              className="sm:col-span-2"
              defaultValue={a.observacion_idoneidad ?? NOTA_IDONEIDAD}
            />
            <CampoTexto
              id="certificacion_trabajador"
              etiqueta="Certificación del trabajador (informe de consulta, historia y autorización pre-empleo; vacío para no imprimirla)"
              rows={3}
              className="sm:col-span-2"
              defaultValue={a.certificacion_trabajador ?? CERTIFICACION_TRABAJADOR}
            />
            <div className="space-y-3">
              <Campo id="meses_examen_periodico" etiqueta="Vigencia del examen periódico (meses)" type="number" min={1} max={36} defaultValue={a.meses_examen_periodico ?? 12} />
              <Campo id="recordatorio_resultados_dias" etiqueta="Recordar resultados pendientes cada (días; 0 = no recordar)" type="number" min={0} max={30} defaultValue={a.recordatorio_resultados_dias ?? 3} />
            <Campo id="dias_equipo_confianza" etiqueta="Pedir el código de dos pasos cada (días)" ayuda="En un equipo de confianza. 0 = en cada entrada." type="number" min={0} max={90} defaultValue={a.dias_equipo_confianza ?? 30} />
            </div>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <Casilla id="firma_medico_ocupacional" etiqueta="Espacio de firma del médico ocupacional" defecto={a.firma_medico_ocupacional ?? true} />
              <Casilla id="constancia_copias" etiqueta="Constancia en original (RR. HH.) y copia (servicio médico)" defecto={a.constancia_copias ?? true} />
              <Casilla id="firma_paciente_constancia" etiqueta="Espacio de firma del trabajador" defecto={a.firma_paciente_constancia ?? false} />
              <Casilla id="firma_sello_separados" etiqueta="Firma y sello del médico en casillas separadas (todos los documentos)" defecto={a.firma_sello_separados ?? true} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Reposo médico</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo id="reposo_pie_copia" etiqueta="Pie de la copia" defaultValue={a.reposo_pie_copia ?? "COPIA SERVICIO MÉDICO"} />
            <Campo id="reposo_pie_original" etiqueta="Pie del original" defaultValue={a.reposo_pie_original ?? "ORIGINAL RECURSOS HUMANOS"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Avisos</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <Casilla id="centinela_correo" etiqueta="Avisar por correo los plazos legales (declaración ante el INPSASEL, informe NT-02, investigación del accidente)" defecto={a.centinela_correo ?? false} />
            <p className="pl-6 text-xs text-muted-foreground">Viene apagado. Llega al personal de salud y SST de cada empresa con el número de evento, la empresa y el plazo: nunca el nombre del trabajador ni el diagnóstico. Sale cuando un administrador o gerente médico abre zamorApp. La campana avisa siempre.</p>
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
          <CardHeader><CardTitle className="text-base">Certificado de salud</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo id="certificado_titulo" etiqueta="Título" defaultValue={a.certificado_titulo ?? "Certificado de salud"} />
            <CampoTexto id="certificado_nota" etiqueta="Nota legal al pie (vacío para no imprimirla)" rows={2} className="sm:col-span-2" defaultValue={a.certificado_nota ?? NOTA_CERTIFICADO_SACS} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Orden de exámenes</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <Campo id="orden_nota" etiqueta="Nota al pie (ej. ayuno de 8 horas, laboratorio convenido)" defaultValue={a.orden_nota ?? ""} />
            <CampoTexto id="orden_nota_preempleo" etiqueta="Nota de la autorización pre-empleo (vacío para no imprimirla)" rows={2} defaultValue={a.orden_nota_preempleo ?? NOTA_PREEMPLEO_VIH} />
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
