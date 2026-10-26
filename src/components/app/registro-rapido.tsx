"use client";

import { useState, useTransition } from "react";
import { Loader2, Stethoscope, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crearPaciente } from "@/app/(app)/pacientes/acciones";
import { iniciarConsulta } from "@/app/(app)/atencion/acciones";

type Props = {
  texto: string;
  empresas: { id: string; nombre: string }[];
  empresaActiva: string | null;
  clinico: boolean;
  alListo: (href: string | null) => void;
};

// Ficha mínima desde el buscador: cédula, nombre y empresa. El resto se completa en la consulta o en la ficha.
export function RegistroRapido({ texto, empresas, empresaActiva, clinico, alListo }: Props) {
  const digitos = texto.replace(/\D/g, "");
  const esCedula = digitos.length >= 5;
  const partes = esCedula ? [] : texto.trim().split(/\s+/);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const campo = "h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  const enviar = (datos: FormData) =>
    iniciar(async () => {
      setError(null);
      const r = await crearPaciente(null, datos);
      if (!r.ok || !r.id) return setError(r.mensaje);
      if (!clinico) return alListo(`/pacientes/${r.id}`);
      const c = await iniciarConsulta(r.id);
      // iniciarConsulta redirige a la consulta; si devuelve algo, fue un error
      if (c && !c.ok) {
        setError(`${r.mensaje} ${c.mensaje}`);
        alListo(`/pacientes/${r.id}`);
      }
    });

  if (!empresas.length) {
    return <p className="px-3 py-4 text-center text-sm text-muted-foreground">Registra primero una empresa para poder crear trabajadores.</p>;
  }

  return (
    <form action={enviar} className="space-y-3 rounded-lg border bg-muted/40 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <UserPlus className="size-4 text-primary" /> {clinico ? "Registrar y atender" : "Registrar trabajador"}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input name="cedula" aria-label="Cédula" placeholder="Cédula (V-12345678)" defaultValue={esCedula ? texto.trim() : ""} required className={campo}/>
        <select name="empresa_id" aria-label="Empresa" defaultValue={empresaActiva ?? empresas[0].id} className={campo}>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <input name="nombres" aria-label="Nombres" placeholder="Nombres" defaultValue={partes.slice(0, Math.ceil(partes.length / 2)).join(" ")} required className={campo} />
        <input name="apellidos" aria-label="Apellidos" placeholder="Apellidos" defaultValue={partes.slice(Math.ceil(partes.length / 2)).join(" ")} required className={campo} />
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Sexo, cargo y demás datos se completan después.</span>
        <Button type="submit" size="sm" disabled={ocupado}>
          {ocupado ? <Loader2 className="animate-spin" /> : clinico ? <Stethoscope /> : <UserPlus />}
          {clinico ? "Registrar y atender" : "Registrar"}
        </Button>
      </div>
    </form>
  );
}
