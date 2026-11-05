"use client";

import { useState, useTransition } from "react";
import { Building2, CheckCircle2, Loader2, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TURNOS } from "@/lib/solicitudes-paciente";
import { enviarRegistro } from "./acciones";

type Props = { token: string; servicio: string; empresa: string | null; motivos: { id: string; nombre: string }[]; hoy: string; maximo: string };

// Botones de una sola opción (más rápidos que una lista en el celular)
function Opciones<T extends string>({ etiqueta, valor, opciones, alCambiar }: { etiqueta: string; valor: T | ""; opciones: { v: T; t: React.ReactNode }[]; alCambiar: (v: T | "") => void }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} onClick={() => alCambiar(valor === o.v ? "" : o.v)}
          className={cn("flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition",
            valor === o.v ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary")}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

export function FormularioRegistro({ token, servicio, empresa, motivos, hoy, maximo }: Props) {
  const [sexo, setSexo] = useState<"F" | "M" | "">("");
  const [tipo, setTipo] = useState<"particular" | "empresa" | "">(empresa ? "empresa" : "");
  const [motivo, setMotivo] = useState("");
  const [turno, setTurno] = useState<"manana" | "tarde" | "">("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (listo !== null) {
    return (
      <section role="status" className="space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-12 text-ok" />
        <h2 className="text-xl font-semibold">¡Listo{listo ? `, ${listo}` : ""}!</h2>
        <p className="text-sm text-muted-foreground">{servicio} recibió tus datos. Te confirmaremos el día y la hora de tu consulta por WhatsApp.</p>
        <p className="text-xs text-muted-foreground">Ya puedes cerrar esta página.</p>
      </section>
    );
  }

  const enviar = (form: HTMLFormElement) => {
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (!tipo) return setError("Indica si vienes por tu cuenta o de una empresa.");
    if (!f.acepto) return setError("Marca la autorización para que el servicio use tus datos.");
    setError(null);
    iniciar(async () => {
      const r = await enviarRegistro(token, { ...f, sexo, tipo, motivo_id: motivo, turno, acepto: "" });
      if (r.ok) setListo(f.nombres?.trim().split(/\s+/)[0] ?? "");
      else setError(r.mensaje);
    });
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enviar(e.currentTarget); }}>
      {/* Trampa para robots: invisible para las personas */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Sitio web<input name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <Seccion titulo="Tus datos">
        <div>
          <Label htmlFor="cedula" className="mb-1.5">Cédula *</Label>
          <Input id="cedula" name="cedula" required inputMode="text" autoComplete="off" placeholder="V-12345678" maxLength={14} className="h-11 text-base" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="nombres" className="mb-1.5">Nombres *</Label>
            <Input id="nombres" name="nombres" required autoComplete="given-name" maxLength={80} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="apellidos" className="mb-1.5">Apellidos *</Label>
            <Input id="apellidos" name="apellidos" required autoComplete="family-name" maxLength={80} className="h-11 text-base" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fecha_nacimiento" className="mb-1.5">Fecha de nacimiento *</Label>
            <Input id="fecha_nacimiento" name="fecha_nacimiento" type="date" required min="1900-01-01" max={hoy} autoComplete="bday" className="h-11 text-base" />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium">Sexo</span>
            <Opciones etiqueta="Sexo" valor={sexo} alCambiar={setSexo} opciones={[{ v: "F", t: "Femenino" }, { v: "M", t: "Masculino" }]} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="¿Cómo te contactamos?">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="telefono" className="mb-1.5">Celular (WhatsApp) *</Label>
            <Input id="telefono" name="telefono" type="tel" required inputMode="tel" autoComplete="tel" placeholder="0414-1234567" maxLength={20} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="correo" className="mb-1.5">Correo</Label>
            <Input id="correo" name="correo" type="email" autoComplete="email" maxLength={120} className="h-11 text-base" />
          </div>
        </div>
        <div>
          <Label htmlFor="direccion" className="mb-1.5">Dirección</Label>
          <Input id="direccion" name="direccion" autoComplete="street-address" maxLength={300} className="h-11 text-base" />
        </div>
      </Seccion>

      <Seccion titulo="Tu consulta">
        <div className="space-y-2">
          <span className="block text-sm font-medium">¿Vienes por tu cuenta o de una empresa? *</span>
          <Opciones etiqueta="Tipo de paciente" valor={tipo} alCambiar={setTipo}
            opciones={[{ v: "particular", t: <><User className="size-4" /> Por mi cuenta</> }, { v: "empresa", t: <><Building2 className="size-4" /> De una empresa</> }]} />
        </div>
        {tipo === "empresa" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="empresa" className="mb-1.5">Empresa</Label>
              <Input id="empresa" name="empresa" defaultValue={empresa ?? ""} maxLength={120} className="h-11 text-base" />
            </div>
            <div>
              <Label htmlFor="cargo" className="mb-1.5">Cargo</Label>
              <Input id="cargo" name="cargo" maxLength={120} className="h-11 text-base" />
            </div>
          </div>
        )}
        {motivos.length > 0 && (
          <div className="space-y-2">
            <span className="block text-sm font-medium">¿Qué evaluación necesitas?</span>
            <Opciones etiqueta="Evaluación" valor={motivo} alCambiar={setMotivo} opciones={motivos.map((m) => ({ v: m.id, t: m.nombre }))} />
          </div>
        )}
        <div>
          <Label htmlFor="motivo" className="mb-1.5">Cuéntanos brevemente</Label>
          <Textarea id="motivo" name="motivo" maxLength={500} rows={3} placeholder="Ej.: examen pre-empleo para un nuevo trabajo" className="text-base" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fecha" className="mb-1.5">Día que prefieres</Label>
            <Input id="fecha" name="fecha" type="date" min={hoy} max={maximo} className="h-11 text-base" />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium">Horario</span>
            <Opciones etiqueta="Horario" valor={turno} alCambiar={setTurno} opciones={Object.entries(TURNOS).map(([v, t]) => ({ v: v as "manana" | "tarde", t }))} />
          </div>
        </div>
      </Seccion>

      <label className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm shadow-sm">
        <input type="checkbox" name="acepto" className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span>Autorizo a {servicio} a guardar estos datos para atenderme. Solo los ve su personal de salud.</span>
      </label>

      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" /> : <Send />} Enviar mis datos
      </Button>
    </form>
  );
}
