"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Building2, Globe, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Aviso, Campo, CampoSelect } from "@/components/app/campo";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ASUNTO_ENVIO, MARCAS, MENSAJE_ENVIO, mensajeSoloConstancias, rellenar, type Plantilla } from "@/lib/envios-tipos";
import { guardarPlantilla, quitarPlantilla } from "../acciones";

type Empresa = { id: string; nombre: string };
const EJEMPLO = { fechaHora: "27/10/2026, 3:40 p. m.", fecha: "27/10/2026", cantidad: 12 };
const NUEVA: Plantilla = { id: "", empresaId: null, nombre: "", asunto: ASUNTO_ENVIO, mensaje: MENSAJE_ENVIO, mensajeConstancias: null, predeterminada: false };

export function EditorPlantillas({ plantillas, empresas, puedeGeneral }: { plantillas: Plantilla[]; empresas: Empresa[]; puedeGeneral: boolean }) {
  const [editando, setEditando] = useState<Plantilla | null>(null);
  const [quitando, iniciar] = useTransition();
  const nombreEmpresa = (id: string | null) => (id ? empresas.find((e) => e.id === id)?.nombre ?? "Empresa" : "Todas las empresas");
  const generales = plantillas.filter((p) => !p.empresaId);
  const porEmpresa = plantillas.filter((p) => p.empresaId);

  const Fila = ({ p }: { p: Plantilla }) => {
    const editable = Boolean(p.empresaId) || puedeGeneral;
    return (
      <li className="flex items-start gap-3 px-4 py-3 text-sm">
        {p.empresaId ? <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 font-medium">
            {p.nombre}
            {p.predeterminada && <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"><Star className="size-3" /> Predeterminada</span>}
          </span>
          <span className="block text-xs text-muted-foreground">{nombreEmpresa(p.empresaId)} · {p.asunto}</span>
          <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{p.mensaje}</span>
        </span>
        {editable && (
          <>
            <Button variant="ghost" size="icon" aria-label={`Editar ${p.nombre}`} onClick={() => setEditando(p)}><Pencil /></Button>
            <Button variant="ghost" size="icon" disabled={quitando} aria-label={`Quitar ${p.nombre}`} onClick={async () => {
              if (await confirmar({ titulo: `¿Quitar «${p.nombre}»?`, texto: "Deja de ofrecerse al enviar. Los envíos anteriores no cambian.", accion: "Quitar", peligro: true })) iniciar(async () => { await quitarPlantilla(p.id); });
            }}><Trash2 /></Button>
          </>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Al enviar se propone la predeterminada de la empresa; si no tiene, la general.</p>
        <Button onClick={() => setEditando({ ...NUEVA, empresaId: puedeGeneral ? null : empresas[0]?.id ?? null })}><Plus /> Nueva plantilla</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <p className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Para todas las empresas</p>
          {generales.length ? <ul className="divide-y">{generales.map((p) => <Fila key={p.id} p={p} />)}</ul> : <p className="px-4 py-4 text-sm text-muted-foreground">Se usa el texto de fábrica.</p>}
          <p className="border-y px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">De una empresa</p>
          {porEmpresa.length ? <ul className="divide-y">{porEmpresa.map((p) => <Fila key={p.id} p={p} />)}</ul> : <p className="px-4 py-4 text-sm text-muted-foreground">Ninguna empresa tiene texto propio.</p>}
        </CardContent>
      </Card>
      {!puedeGeneral && <p className="text-xs text-muted-foreground">Las plantillas para todas las empresas las cambia el gerente médico o el administrador. Tú puedes crear la de una empresa.</p>}
      {editando && <Formulario key={editando.id || "nueva"} p={editando} empresas={empresas} puedeGeneral={puedeGeneral} cerrar={() => setEditando(null)} />}
    </div>
  );
}

function Formulario({ p, empresas, puedeGeneral, cerrar }: { p: Plantilla; empresas: Empresa[]; puedeGeneral: boolean; cerrar: () => void }) {
  const [estado, accion, guardando] = useActionState(guardarPlantilla, null);
  const [empresaId, setEmpresaId] = useState(p.empresaId ?? "");
  const [asunto, setAsunto] = useState(p.asunto);
  const [mensaje, setMensaje] = useState(p.mensaje);
  const [rrhh, setRrhh] = useState(p.mensajeConstancias ?? "");
  useEffect(() => { if (estado?.ok) cerrar(); }, [estado, cerrar]);

  const valores = { ...EJEMPLO, empresa: empresas.find((e) => e.id === empresaId)?.nombre ?? "Posapi" };
  const vistaRrhh = rrhh.trim() ? rellenar(rrhh, valores) : mensajeSoloConstancias(rellenar(mensaje, valores));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) cerrar(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{p.id ? `Editar «${p.nombre}»` : "Nueva plantilla"}</DialogTitle>
          <DialogDescription>Se cambian al enviar: {MARCAS.map((m) => `${m.marca} (${m.que})`).join(", ")}.</DialogDescription>
        </DialogHeader>
        <form action={accion} className="space-y-3">
          {p.id && <input type="hidden" name="id" value={p.id} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="nombre" etiqueta="Nombre *" defaultValue={p.nombre} placeholder="Evaluaciones del día" required maxLength={80} />
            {p.id ? (
              <div className="text-sm"><Label className="mb-1.5">Para</Label><p className="h-10 content-center text-muted-foreground">{empresas.find((e) => e.id === p.empresaId)?.nombre ?? "Todas las empresas"}</p></div>
            ) : (
              <CampoSelect id="empresa_id" etiqueta="Para" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
                {puedeGeneral && <option value="">Todas las empresas</option>}
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </CampoSelect>
            )}
          </div>
          <Campo id="asunto" etiqueta="Asunto del correo *" value={asunto} onChange={(e) => setAsunto(e.target.value)} required maxLength={200} />
          <div>
            <Label htmlFor="mensaje" className="mb-1.5">Mensaje *</Label>
            <Textarea id="mensaje" name="mensaje" rows={5} value={mensaje} onChange={(e) => setMensaje(e.target.value)} required maxLength={4000} />
          </div>
          <div>
            <Label htmlFor="mensaje_constancias" className="mb-1.5">Mensaje para RR. HH. (quien no recibe la consulta médica)</Label>
            <Textarea id="mensaje_constancias" name="mensaje_constancias" rows={3} value={rrhh} onChange={(e) => setRrhh(e.target.value)} maxLength={4000} placeholder="Vacío: el mismo mensaje sin mencionar la consulta médica" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="predeterminada" defaultChecked={p.predeterminada} className="size-4 accent-primary" /> Usar por defecto al enviar
          </label>
          <div className="space-y-2 rounded-md bg-muted/50 p-3 text-xs">
            <p className="font-medium">Así llega</p>
            <p><span className="text-muted-foreground">Asunto:</span> {rellenar(asunto, valores)}</p>
            <p className="whitespace-pre-wrap"><span className="text-muted-foreground">Personal de salud:</span> {rellenar(mensaje, valores)}</p>
            <p className="whitespace-pre-wrap"><span className="text-muted-foreground">RR. HH.:</span> {vistaRrhh}</p>
          </div>
          <Aviso resultado={estado} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? <><Loader2 className="animate-spin" /> Guardando…</> : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
