"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LATERALIDADES } from "@/lib/lateralidad";
import type { DatosFichaPersonal } from "@/lib/ficha-personal";
import { guardarFichaPersonal } from "../../acciones";

const selectClase = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function EditarFichaPersonal({ id, datos, hoy }: { id: string; datos: DatosFichaPersonal; hoy: string }) {
  const router = useRouter();
  const [guardando, iniciar] = useTransition();
  const [error, setError] = useState("");

  function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = new FormData(e.currentTarget);
    iniciar(async () => {
      setError("");
      try {
        const resultado = await guardarFichaPersonal(id, datos.version, formulario);
        if (!resultado.ok) { setError(resultado.mensaje); return; }
        router.replace(`/pacientes/${id}`);
      } catch {
        setError("No se pudo guardar. Comprueba la conexión y vuelve a intentar.");
      }
    });
  }

  return (
    <form onSubmit={guardar} autoComplete="off" className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
      <fieldset disabled={guardando} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo nombre="nombres" etiqueta="Nombres" valor={datos.nombres} required />
        <Campo nombre="apellidos" etiqueta="Apellidos" valor={datos.apellidos} required />
        <Campo nombre="cedula" etiqueta="Cédula" valor={datos.cedula} required />
        <Campo nombre="telefono" etiqueta="Teléfono" valor={datos.telefono} type="tel" />
        <Campo nombre="correo" etiqueta="Correo electrónico" valor={datos.correo} inputMode="email" />
        <Campo nombre="fecha_nacimiento" etiqueta="Fecha de nacimiento" valor={datos.fecha_nacimiento} type="date" max={hoy} />
        <label className="space-y-1.5 text-sm font-medium">
          <span>Sexo</span>
          <select name="sexo" defaultValue={datos.sexo ?? ""} className={selectClase}>
            <option value="">Sin registrar</option><option value="F">Femenino</option><option value="M">Masculino</option>
          </select>
        </label>
        <Campo nombre="lugar_nacimiento" etiqueta="Lugar de nacimiento" valor={datos.lugar_nacimiento} />
        <Campo nombre="profesion" etiqueta="Profesión" valor={datos.profesion} />
        <Campo nombre="nivel_educativo" etiqueta="Nivel educativo" valor={datos.nivel_educativo} />
        <label className="space-y-1.5 text-sm font-medium">
          <span>Lateralidad</span>
          <select name="lateralidad" defaultValue={datos.lateralidad ?? ""} className={selectClase}>
            <option value="">Sin registrar</option>
            {LATERALIDADES.map((l) => <option key={l.valor} value={l.valor}>{l.nombre}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
          <span>Dirección</span>
          <textarea name="direccion" defaultValue={datos.direccion ?? ""} rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-alerta-texto">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={guardando} className="min-h-11">{guardando ? "Guardando…" : "Guardar cambios"}</Button>
        <Button variant="outline" asChild className="min-h-11"><Link href={`/pacientes/${id}`}>Cancelar</Link></Button>
      </div>
    </form>
  );
}

function Campo({ nombre, etiqueta, valor, type = "text", required, inputMode, max }: {
  nombre: keyof Omit<DatosFichaPersonal, "version">; etiqueta: string; valor: string | null;
  type?: string; required?: boolean; inputMode?: "email"; max?: string;
}) {
  return (
    <label className="min-w-0 space-y-1.5 text-sm font-medium">
      <span>{etiqueta}</span>
      <Input name={nombre} type={type} defaultValue={valor ?? ""} required={required} inputMode={inputMode} max={max} />
    </label>
  );
}
