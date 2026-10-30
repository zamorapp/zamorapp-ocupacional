"use client";

import { useState, useTransition } from "react";
import { Loader2, Palmtree, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmar } from "@/components/app/confirmar";
import { sumarDias } from "@/lib/fecha";
import { editarVacaciones, guardarVacaciones, quitarVacaciones, type Vacacion } from "./vacaciones-acciones";

const corta = (iso: string) => iso.split("-").reverse().join("/");
const CHIP = { alerta: "bg-alerta/15 text-alerta-texto", aviso: "bg-aviso/20 text-aviso-texto", ok: "bg-ok/15 text-ok-texto", neutro: "bg-muted text-muted-foreground" };

// Vacaciones del trabajador y su post vacacional: al anotar el regreso, zamorApp avisa 2 días antes y marca el plazo
// para la evaluación (días de la empresa). El aviso se apaga solo con una consulta «Post vacacional» desde el regreso.
export function Vacaciones({ trabajadorId, iniciales, diasPost, hoy, editable, fechasPosv = [] }: { trabajadorId: string; iniciales: Vacacion[]; diasPost: number; hoy: string; editable: boolean; fechasPosv?: string[] }) {
  const [desde, setDesde] = useState("");
  const [regreso, setRegreso] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();

  const guardar = () => iniciar(async () => {
    const r = editando ? await editarVacaciones(trabajadorId, editando, desde, regreso) : await guardarVacaciones(trabajadorId, desde, regreso);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) { setDesde(""); setRegreso(""); setEditando(null); }
  });
  const editar = (v: Vacacion) => { setEditando(v.id); setDesde(v.desde); setRegreso(v.regreso); setMensaje(null); };
  const cancelar = () => { setEditando(null); setDesde(""); setRegreso(""); };
  const quitar = async (v: Vacacion) => {
    if (!(await confirmar({ titulo: "¿Quitar estas vacaciones?", texto: `Del ${corta(v.desde)} al ${corta(v.regreso)}. También se quita su aviso de post vacacional.`, accion: "Quitar", peligro: true }))) return;
    iniciar(async () => {
      const r = await quitarVacaciones(trabajadorId, v.id);
      if (!r.ok) setMensaje({ ok: false, texto: r.mensaje });
    });
  };

  return (
    <div className="space-y-3 text-sm">
      {iniciales.length === 0 && <p className="text-muted-foreground">Sin vacaciones anotadas.</p>}
      <ul className="space-y-1.5">
        {iniciales.map((v) => {
          const limite = sumarDias(v.regreso, diasPost);
          const [estado, tono]: [string, keyof typeof CHIP] = fechasPosv.some((f) => f >= v.regreso) ? ["Post vacacional hecho", "ok"]
            : v.regreso > hoy ? ["De vacaciones", "neutro"] : limite < hoy ? ["Plazo vencido", "alerta"] : ["Post vacacional pendiente", "aviso"];
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Palmtree className="size-4 text-muted-foreground" aria-hidden />
              <span>Del {corta(v.desde)} · regresa el {corta(v.regreso)}</span>
              <span className="text-muted-foreground">Post vacacional antes del {corta(limite)}</span>
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[tono]}`}>{estado}</span>
              {editable && (
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={ocupado} onClick={() => editar(v)} aria-label="Corregir fechas" title="Corregir fechas">
                  <Pencil />
                </Button>
              )}
              {editable && (
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={ocupado} onClick={() => quitar(v)} aria-label="Quitar vacaciones" title="Quitar vacaciones">
                  <Trash2 />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm text-foreground" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Regresa el
            <input type="date" value={regreso} min={desde || undefined} onChange={(e) => setRegreso(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm text-foreground" />
          </label>
          <Button type="button" size="sm" disabled={ocupado || !desde || !regreso} onClick={guardar}>
            {ocupado && <Loader2 className="animate-spin" />} {editando ? "Guardar fechas" : "Anotar vacaciones"}
          </Button>
          {editando && <Button type="button" size="sm" variant="ghost" onClick={cancelar}>Cancelar</Button>}
        </div>
      )}
      {mensaje && <p role="status" className={mensaje.ok ? "text-ok-texto" : "text-alerta-texto"}>{mensaje.texto}</p>}
      <p className="text-xs text-muted-foreground">Te avisamos 2 días antes del regreso y el plazo es de {diasPost} días (se cambia en la empresa). El aviso se quita solo al hacer la consulta «Post vacacional».</p>
    </div>
  );
}
