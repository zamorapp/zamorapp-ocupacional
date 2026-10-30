"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { empresas } from "@/lib/movil/datos";
import type { Motor } from "@/lib/movil/motor";
import { cn } from "@/lib/utils";

const limpiarCedula = (v: string) => {
  const m = v.toUpperCase().replace(/[^VEJGP0-9]/g, "");
  const letra = /^[VEJGP]/.test(m) ? m[0] : "V";
  const num = m.replace(/^[VEJGP]/, "").replace(/\D/g, "");
  return num ? `${letra}-${num}` : "";
};

export function PacienteNuevo({ motor, enLinea, alCrear, volver }: { motor: Motor; enLinea: boolean; alCrear: (id: string) => void; volver: () => void }) {
  const lista = empresas(motor);
  const [f, setF] = useState({ cedula: "", nombres: "", apellidos: "", sexo: "", fecha_nacimiento: "", empresa_id: lista.length === 1 ? lista[0].id : "", telefono: "" });
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const libres = motor.numerosLibres();
  const campo = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function crear() {
    const cedula = limpiarCedula(f.cedula);
    if (!cedula || !f.nombres.trim() || !f.apellidos.trim() || !f.empresa_id) return setError("Faltan cédula, nombres, apellidos o empresa");
    const repetido = [...motor.tabla("public.trabajadores").values()].find((t) => String(t.cedula).replace(/\D/g, "") === cedula.replace(/\D/g, ""));
    if (repetido) return setError(`Esa cédula ya está registrada: ${repetido.nombres} ${repetido.apellidos}`);
    if (!libres.length) return setError(enLinea ? "Sincroniza para reservar números de historia y vuelve a intentar" : "Sin números de historia reservados: el registro de pacientes nuevos necesita señal una vez");
    setOcupado(true); setError(null);
    try {
      const id = motor.insertar("public.trabajadores", {
        id: crypto.randomUUID(), cedula, nombres: f.nombres.trim(), apellidos: f.apellidos.trim(), sexo: f.sexo || null,
        fecha_nacimiento: f.fecha_nacimiento || null, empresa_id: f.empresa_id, telefono: f.telefono.trim() || null, numero_historia: libres[0],
      }, motor.meta.equipo!.uid);
      await motor.persistir();
      motor.sincronizar().catch(() => {});
      alCrear(id);
    } catch (e) {
      setError((e as Error).message || "No se pudo guardar");
    } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={volver} aria-label="Volver"><ArrowLeft /></Button>
        <h2 className="font-semibold">Paciente nuevo</h2>
        <span className="ml-auto text-xs text-muted-foreground">{libres.length ? `Historia ${libres[0]}` : "Sin números reservados"}</span>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <Input value={f.cedula} onChange={campo("cedula")} onBlur={() => setF({ ...f, cedula: limpiarCedula(f.cedula) })} placeholder="Cédula (V-12345678)" inputMode="text" className="h-11" />
        <Input value={f.nombres} onChange={campo("nombres")} placeholder="Nombres" autoCapitalize="words" className="h-11" />
        <Input value={f.apellidos} onChange={campo("apellidos")} placeholder="Apellidos" autoCapitalize="words" className="h-11" />
        <div className="grid grid-cols-2 gap-2">
          <select value={f.sexo} onChange={campo("sexo")} className="h-11 rounded-md border bg-background px-3 text-sm">
            <option value="">Sexo…</option><option value="F">Femenino</option><option value="M">Masculino</option>
          </select>
          <Input type="date" value={f.fecha_nacimiento} onChange={campo("fecha_nacimiento")} aria-label="Fecha de nacimiento" className="h-11" />
        </div>
        <select value={f.empresa_id} onChange={campo("empresa_id")} className={cn("h-11 w-full rounded-md border bg-background px-3 text-sm", !f.empresa_id && "text-muted-foreground")}>
          <option value="">Empresa…</option>
          {lista.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <Input value={f.telefono} onChange={campo("telefono")} placeholder="Teléfono (opcional)" inputMode="tel" className="h-11" />
      </div>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <Button className="h-12 w-full text-base" disabled={ocupado} onClick={crear}>{ocupado ? <Loader2 className="animate-spin" /> : <UserPlus />} Registrar</Button>
      <p className="text-center text-xs text-muted-foreground">El resto de la ficha se completa luego en la app completa o la PC.</p>
    </div>
  );
}
