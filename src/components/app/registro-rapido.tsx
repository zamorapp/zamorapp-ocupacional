"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Stethoscope, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crearPaciente, dependenciasDeEmpresa } from "@/app/(app)/pacientes/acciones";
import { iniciarConsulta } from "@/app/(app)/atencion/acciones";

type Props = {
  texto: string;
  empresas: { id: string; nombre: string }[];
  empresaActiva: string | null;
  clinico: boolean;
  alListo?: (href: string | null) => void;
  // Si viene, solo registra y entrega el paciente (por ejemplo, para agendarle una cita) sin abrir la consulta
  alRegistrar?: (p: { id: string; nombre: string; cedula: string; empresa: string }) => void;
};

// Ficha mínima desde el buscador: cédula, nombre y empresa (nacimiento y profesión, opcionales). El resto se completa en la consulta o en la ficha.
export function RegistroRapido({ texto, empresas, empresaActiva, clinico, alListo = () => {}, alRegistrar }: Props) {
  const digitos = texto.replace(/\D/g, "");
  const esCedula = digitos.length >= 5;
  const partes = esCedula ? [] : texto.trim().split(/\s+/);
  // Cada campo sigue a la búsqueda hasta que el médico lo edita; desde ahí queda lo que escribió
  // (corregir la búsqueda nunca borra nombres, apellidos ni empresa ya puestos)
  const sugerido = {
    cedula: esCedula ? texto.trim() : "",
    nombres: partes.slice(0, Math.ceil(partes.length / 2)).join(" "),
    apellidos: partes.slice(Math.ceil(partes.length / 2)).join(" "),
  };
  const [escrito, setEscrito] = useState<Partial<Record<keyof typeof sugerido, string>>>({});
  const valor = (k: keyof typeof sugerido) => escrito[k] ?? sugerido[k];
  const escribir = (k: keyof typeof sugerido) => (e: React.ChangeEvent<HTMLInputElement>) => setEscrito((v) => ({ ...v, [k]: e.target.value }));
  const [empresaId, setEmpresaId] = useState(empresaActiva ?? empresas[0]?.id ?? "");
  // Las dependencias o departamentos de la empresa elegida (como en el SAME); escribir una nueva la crea en esa empresa
  const [dependencias, setDependencias] = useState<string[]>([]);
  useEffect(() => {
    let vigente = true;
    dependenciasDeEmpresa(empresaId).then((d) => vigente && setDependencias(d)).catch(() => {});
    return () => { vigente = false; };
  }, [empresaId]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const campo = "h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  const enviar = (datos: FormData) =>
    iniciar(async () => {
      setError(null);
      const r = await crearPaciente(null, datos);
      if (!r.ok || !r.id) return setError(r.mensaje);
      if (alRegistrar) {
        const empresa = empresas.find((e) => e.id === datos.get("empresa_id"))?.nombre ?? "";
        return alRegistrar({ id: r.id, nombre: `${datos.get("nombres")} ${datos.get("apellidos")}`, cedula: String(datos.get("cedula")), empresa });
      }
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
        <UserPlus className="size-4 text-primary" /> {alRegistrar ? "Registrar paciente nuevo" : clinico ? "Registrar y atender" : "Registrar trabajador"}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input name="cedula" aria-label="Cédula" placeholder="Cédula (V-12345678)" value={valor("cedula")} onChange={escribir("cedula")} required className={campo} />
        <select name="empresa_id" aria-label="Empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={campo}>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <input name="nombres" aria-label="Nombres" placeholder="Nombres" value={valor("nombres")} onChange={escribir("nombres")} required className={campo} />
        <input name="apellidos" aria-label="Apellidos" placeholder="Apellidos" value={valor("apellidos")} onChange={escribir("apellidos")} required className={campo} />
        {/* Opcionales: si se dejan vacíos, «Generales» de la consulta los pide */}
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          Dependencia o departamento (opcional)
          <input name="dependencia" list="rr-dependencias" placeholder={dependencias.length ? "Elige de la lista o escribe una nueva" : "Escribe una; queda en esta empresa"} className={campo} />
          <datalist id="rr-dependencias">{dependencias.map((d) => <option key={d} value={d} />)}</datalist>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Fecha de nacimiento (opcional)
          <input type="date" name="fecha_nacimiento" min="1920-01-01" className={campo} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Profesión u oficio (opcional)
          <input name="profesion" placeholder="Ej.: Técnico electricista" className={campo} />
        </label>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Cargo y sexo se completan en «Generales» de la consulta.</span>
        <Button type="submit" size="sm" disabled={ocupado}>
          {ocupado ? <Loader2 className="animate-spin" /> : clinico && !alRegistrar ? <Stethoscope /> : <UserPlus />}
          {clinico && !alRegistrar ? "Registrar y atender" : "Registrar"}
        </Button>
      </div>
    </form>
  );
}
