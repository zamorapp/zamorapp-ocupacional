"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { eliminarAPapelera, vistaPreviaPapelera } from "@/app/(app)/configuracion/papelera/acciones";
import { listarResumen, type TipoPapelera, type VistaPrevia } from "@/lib/papelera";

const PALABRA = "ELIMINAR";

// Eliminar una consulta o un trabajador (solo el administrador). Antes de confirmar dice qué se va con él y qué se
// queda; pide el motivo (va a la bitácora) y, si hay algo firmado, que se escriba ELIMINAR. Nada se pierde: queda en
// la Papelera y «Deshacer» lo devuelve idéntico.
export function EliminarPapelera({ tipo, id, nombre, abierto, onAbierto, onEliminado }: {
  tipo: TipoPapelera;
  id: string;
  nombre: string; // «la consulta del 02/11/2026» o «Daniela Marcano»
  abierto: boolean;
  onAbierto: (a: boolean) => void;
  onEliminado: (papeleraId: string, mensaje: string) => void;
}) {
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [error, setError] = useState("");
  const [motivo, setMotivo] = useState("");
  const [palabra, setPalabra] = useState("");
  const [enCurso, iniciar] = useTransition();

  useEffect(() => {
    if (!abierto) return;
    setVista(null); setError(""); setMotivo(""); setPalabra("");
    let vivo = true;
    vistaPreviaPapelera(tipo, id).then((r) => {
      if (!vivo) return;
      if (r.ok) setVista(r.vista); else setError(r.mensaje);
    });
    return () => { vivo = false; };
  }, [abierto, tipo, id]);

  // Pide escribir ELIMINAR solo si hay algo firmado
  const fuerte = Boolean(vista && vista.firmadas > 0);
  const faltaMotivo = motivo.trim().length < 5;
  const faltaPalabra = fuerte && palabra.trim().toUpperCase() !== PALABRA;
  const listo = Boolean(vista) && !faltaMotivo && !faltaPalabra;
  // Por qué el botón está apagado, dicho en pantalla (no solo al pasar el ratón)
  const porQue = !vista ? "" : faltaMotivo ? "Escribe el motivo para poder eliminar." : faltaPalabra ? `Escribe ${PALABRA} para poder eliminar.` : "";
  const principal = tipo === "consulta" ? "clinico.consultas" : "public.trabajadores";
  const junto = vista ? listarResumen(vista.resumen, principal) : "";
  const sueltas = vista ? listarResumen(vista.sueltas) : "";

  const eliminar = () => iniciar(async () => {
    const r = await eliminarAPapelera(tipo, id, motivo);
    if (!r.ok || !r.papeleraId) return setError(r.mensaje);
    onAbierto(false);
    onEliminado(r.papeleraId, r.mensaje);
  });

  return (
    <Dialog open={abierto} onOpenChange={(a) => !enCurso && onAbierto(a)}>
      <DialogContent className="sm:max-w-lg">
        <div className="flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"><Trash2 className="size-5" /></span>
          <div className="min-w-0 space-y-1.5 pt-1">
            <DialogTitle className="text-base leading-snug">¿Eliminar {nombre}?</DialogTitle>
            <DialogDescription>
              {tipo === "consulta"
                ? "Para consultas duplicadas o hechas por error. Desaparece de la historia, los reportes y los conteos."
                : "Para un trabajador repetido o registrado por error. Desaparece de la lista, los reportes y los conteos. Si solo dejó la empresa, usa «Inactivar» en su ficha."}
            </DialogDescription>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          {!vista && !error && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Revisando qué tiene…</p>}
          {vista && (
            <ul className="space-y-1.5 rounded-lg border bg-muted/40 px-3 py-2.5">
              <li><b>Se elimina con {tipo === "consulta" ? "ella" : "él"}:</b> {junto || "nada más"}.</li>
              {vista.firmadas > 0 && <li className="text-alerta-texto"><b>{vista.firmadas === 1 ? "Hay 1 consulta firmada." : `Hay ${vista.firmadas} consultas firmadas.`}</b> Con la firma y sus versiones anteriores.</li>}
              {sueltas && <li><b>Se quedan</b>, sin el enlace: {sueltas}.</li>}
              <li className="flex items-start gap-1.5 text-muted-foreground"><Undo2 className="mt-0.5 size-4 shrink-0" /> Queda en Configuración › Papelera: «Deshacer» lo devuelve idéntico, con su firma y su número de historia.</li>
            </ul>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="motivo-eliminar">Motivo (obligatorio, queda en la auditoría)</Label>
            <Textarea id="motivo-eliminar" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
              placeholder={tipo === "consulta" ? "Ej.: duplicada al probar la firma" : "Ej.: registrado dos veces, la cédula correcta es la otra"} />
          </div>
          {fuerte && (
            <div className="space-y-1.5">
              <Label htmlFor="palabra-eliminar">Escribe <b>{PALABRA}</b> para confirmar</Label>
              <Input id="palabra-eliminar" value={palabra} onChange={(e) => setPalabra(e.target.value)} autoComplete="off" className="max-w-48 uppercase" />
            </div>
          )}
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
        </div>

        {porQue && !enCurso && <p className="text-right text-xs text-muted-foreground">{porQue}</p>}
        {/* En el celular «Cancelar» queda arriba y «Eliminar» abajo, lejos del pulgar por descuido */}
        <DialogFooter className="flex-col sm:flex-row">
          <Button autoFocus variant="outline" onClick={() => onAbierto(false)} disabled={enCurso}>Cancelar</Button>
          <Button variant="destructive" onClick={eliminar} disabled={!listo || enCurso} title={porQue || undefined}>
            {enCurso ? <Loader2 className="animate-spin" /> : <Trash2 />} Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
