"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { horaDelDia, leerRecordatorioCitas, TOPES, type UnidadRecordatorio } from "@/lib/recordatorio-citas";

const ORDEN = ["Primer aviso", "Segundo aviso", "Último aviso"];

function Paso({ i, valor, unidad, activo }: { i: number; valor: number; unidad: UnidadRecordatorio; activo: boolean }) {
  const [u, setU] = useState(unidad);
  const [encendido, setEncendido] = useState(activo);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-2.5 last:border-0">
      <label className="flex min-w-36 flex-1 items-center gap-2 text-sm">
        <input type="checkbox" name={`rc_activo_${i}`} defaultChecked={activo} onChange={(e) => setEncendido(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        {ORDEN[i]}
      </label>
      <div className={`flex items-center gap-2 text-sm ${encendido ? "" : "opacity-50"}`}>
        <input
          type="number" name={`rc_valor_${i}`} aria-label={`${ORDEN[i]}: cuánto antes`} defaultValue={valor} min={TOPES[u].min} max={TOPES[u].max}
          className="h-10 w-16 rounded-md border bg-transparent px-2 text-center font-cifra text-sm"
        />
        <select name={`rc_unidad_${i}`} aria-label={`${ORDEN[i]}: unidad`} value={u} onChange={(e) => setU(e.target.value as UnidadRecordatorio)}
          className="h-10 rounded-md border bg-transparent px-2 text-sm">
          <option value="dias">días antes</option>
          <option value="horas">horas antes</option>
          <option value="minutos">minutos antes</option>
        </select>
      </div>
    </div>
  );
}

// Configuración › Organización › Plazos y avisos: cuándo y por dónde avisan las citas
export function RecordatorioCitasCampos({ ajustes }: { ajustes: unknown }) {
  const rc = leerRecordatorioCitas(ajustes);
  return (
    <div data-grupo="recordatorio-citas" className="scroll-mt-24 space-y-2 rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium"><BellRing className="size-4 text-primary" />Recordatorios de citas</div>
      <p className="text-xs text-muted-foreground">
        Te avisa en la campana, en Windows y en el celular. Los avisos de días juntan todas las citas de ese día en uno; los de horas o minutos van por hora de cita. 0 días = el mismo día.
      </p>
      <div>{rc.avisos.map((p, i) => <Paso key={i} i={i} {...p} />)}</div>
      <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          Avisos de días desde las
          <select name="rc_hora_dias" defaultValue={rc.hora_dias} aria-label="Hora de los avisos de días" className="h-10 rounded-md border bg-transparent px-2 text-sm">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{horaDelDia(h)}</option>)}
          </select>
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="rc_celular" defaultChecked={rc.celular} className="size-4 accent-[var(--primary)]" />
            Enviar también al celular
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="rc_correo" defaultChecked={rc.correo} className="size-4 accent-[var(--primary)]" />
            Enviar por correo la lista del día
          </label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        El correo sale con el aviso de días más cercano (por omisión, «mañana») a la dirección con que entras. Sin internet, el escritorio te sigue avisando en la campana y en Windows; el celular y el correo esperan a que vuelva.
      </p>
    </div>
  );
}
