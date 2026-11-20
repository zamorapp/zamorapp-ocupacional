"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, PhoneForwarded } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { enlaceWhatsApp, numeroWhatsApp } from "@/lib/mensajes";
import { guardarTelefonoTrabajador } from "./telefono-acciones";

// WhatsApp de la agenda (pedido de Cesar, 19-nov-2026): si la ficha tiene teléfono abre el chat directo;
// si no tiene, pide el número al momento (con «Guardar en la ficha») en vez de abrir el selector de
// contactos vacío, que confundía («abre el WhatsApp Web pero no enlaza con la persona»).
export function BotonWhatsAppCita({ telefono, trabajadorId, paciente, texto, titulo, variante = "icono" }: {
  telefono: string | null; trabajadorId: string; paciente: string; texto: string; titulo: string; variante?: "icono" | "boton";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  if (numeroWhatsApp(telefono)) {
    return variante === "icono" ? (
      <Button size="icon" variant="ghost" className="size-8 max-sm:size-11 text-ok-texto" asChild title={titulo}>
        <a href={enlaceWhatsApp(telefono, texto)} target="_blank" rel="noreferrer" aria-label={titulo}><MessageCircle /></a>
      </Button>
    ) : (
      <Button size="sm" variant="outline" className="text-ok-texto max-sm:min-h-11" asChild title={titulo}>
        <a href={enlaceWhatsApp(telefono, texto)} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
      </Button>
    );
  }

  const abrir = (guardar: boolean) => iniciar(async () => {
    if (!numeroWhatsApp(numero)) { setError("Revisa el celular (ejemplo: 0414-1234567)."); return; }
    if (guardar) {
      const r = await guardarTelefonoTrabajador(trabajadorId, numero);
      if (!r.ok) { setError(r.mensaje); return; }
    }
    setAbierto(false);
    setNumero("");
    setError(null);
    window.open(enlaceWhatsApp(numero, texto), "_blank", "noopener,noreferrer");
    if (guardar) router.refresh();
  });

  return (
    <>
      {variante === "icono" ? (
        <Button size="icon" variant="ghost" className="size-8 max-sm:size-11 text-ok-texto" title="Sin teléfono en la ficha: lo escribes al momento" aria-label={`Sin teléfono en la ficha de ${paciente}: escribirlo al momento`} onClick={() => { setError(null); setAbierto(true); }}><PhoneForwarded /></Button>
      ) : (
        <Button size="sm" variant="outline" className="text-ok-texto max-sm:min-h-11" title="Sin teléfono en la ficha: lo escribes al momento" onClick={() => { setError(null); setAbierto(true); }}><PhoneForwarded /> WhatsApp</Button>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>WhatsApp para {paciente}</DialogTitle>
            <DialogDescription>No tiene teléfono en la ficha. Escríbelo para abrir su chat; si lo guardas, la próxima vez abre directo.</DialogDescription>
          </DialogHeader>
          <form id="telefono-cita" onSubmit={(e) => { e.preventDefault(); abrir(true); }} className="space-y-3">
            <label className="block text-sm font-medium">Celular
              <input type="tel" required value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="0414-1234567" autoComplete="off"
                className="mt-1 block h-10 w-full rounded-md border bg-transparent px-2 text-sm font-normal" />
            </label>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </form>
          <DialogFooter className="max-sm:flex-col">
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} className="max-sm:min-h-11">Cancelar</Button>
            <Button type="button" variant="outline" disabled={ocupado || !numero.trim()} onClick={() => abrir(false)} className="max-sm:min-h-11">
              {ocupado ? <Loader2 className="animate-spin" /> : <MessageCircle />} Abrir sin guardar
            </Button>
            <Button type="submit" form="telefono-cita" disabled={ocupado || !numero.trim()} className="max-sm:min-h-11">
              {ocupado ? <Loader2 className="animate-spin" /> : <PhoneForwarded />} Guardar y abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
