"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Empresa } from "@/lib/empresas";
import { AVISOS_EMPRESA } from "@/lib/empresas-avisos";
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
// "dependencias": las que la empresa ya tiene (al editar), para verlas antes de agregar
export function FormEmpresa({ habilitado, empresa, dependencias = [] }: { habilitado: boolean; empresa?: Empresa; dependencias?: string[] }) {
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
          <Campo id="periodicidad_meses" etiqueta="Examen periódico cada (meses)" type="number" min={1} max={60} defaultValue={e?.periodicidadMeses ?? 12} />
          <Campo id="dias_aviso_examen" etiqueta="Avisar antes del vencimiento (días)" type="number" min={0} max={180} defaultValue={e?.diasAvisoExamen ?? 30} />
          <Campo id="dias_post_vacacional" etiqueta="Post vacacional: días desde el regreso" type="number" min={0} max={60} defaultValue={e?.diasPostVacacional ?? 5} />
          <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">Si la constancia de aptitud no trae «Vigente hasta», el próximo examen se calcula con esta periodicidad. El inicio y el portal avisan con la anticipación indicada. El post vacacional se avisa 2 días antes del regreso y vence a los días indicados.</p>

          {/* Avisos por empresa: con las que se trabaja poco se apagan; los reportes y la ficha siguen mostrando todo */}
          <fieldset className="space-y-2 rounded-lg border px-3 py-2.5 sm:col-span-2">
            <legend className="px-1 text-sm font-medium">Avisos de esta empresa</legend>
            <input type="hidden" name="avisos_en_formulario" value="1" />
            {AVISOS_EMPRESA.map((a) => (
              <label key={a.clave} className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" name={`aviso_${a.clave}`} defaultChecked={!e?.avisosApagados.includes(a.clave)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                <span>{a.nombre} <span className="text-xs text-muted-foreground">· {a.detalle}</span></span>
              </label>
            ))}
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="aviso_datos_legales" defaultChecked={!e?.ignorarAlertaLegal} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>Datos legales incompletos <span className="text-xs text-muted-foreground">· En Inicio y en Empresas</span></span>
            </label>
            <p className="text-xs text-muted-foreground">Desmarca los que no quieras recibir. Los reportes y la ficha del trabajador siguen mostrando todo, y los plazos legales de accidentes siempre avisan.</p>
          </fieldset>

          <div className="sm:col-span-2">
            <Label htmlFor="dependencias" className="mb-1.5">{e ? "Agregar dependencias o departamentos" : "Dependencias o departamentos"}</Label>
            {dependencias.length > 0 && (
              <ul aria-label="Dependencias que ya tiene" className="mb-2 flex flex-wrap gap-1.5">
                {dependencias.map((d) => <li key={d} className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">{d}</li>)}
              </ul>
            )}
            <Textarea id="dependencias" name="dependencias" rows={4} placeholder={"Una por línea. Ejemplo:\nAdministración\nProducción\nMantenimiento"} />
            <p className="mt-1 text-xs text-muted-foreground">Al registrar o atender a un trabajador de esta empresa, «Dependencia o departamento» muestra estas. {e ? "Las que ya tiene no se repiten." : "También se pueden agregar después."}</p>
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
