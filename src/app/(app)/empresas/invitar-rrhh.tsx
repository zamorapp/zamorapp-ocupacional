"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Copy, Link2, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { Aviso, Campo } from "@/components/app/campo";
import { RequiereInternet, useSinInternet } from "@/components/app/sin-internet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { crearInvitacion } from "../configuracion/acciones";

type Contacto = { nombre: string; telefono: string };

// Un solo botón, desde la empresa: nombre y WhatsApp de quien recibe → «Crear y enviar» → se abre WhatsApp con el
// mensaje listo. Misma invitación que Configuración › Usuarios (7 días, un solo uso, anulable allí).
// RR. HH. entra solo al portal de su empresa: nunca ve diagnósticos.
export function InvitarRrhh({ empresaId, empresa, contactos, tamano = "default" }: { empresaId: string; empresa: string; contactos: Contacto[]; tamano?: "default" | "sm" }) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(0);
  return (
    <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); if (!v) setClave((k) => k + 1); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size={tamano}><UserPlus /> Invitar a RR. HH.</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar a RR. HH.</DialogTitle>
          <DialogDescription>
            Le llega un enlace por WhatsApp para entrar al portal de {empresa}: pide evaluaciones y ve resultados, nunca diagnósticos.
          </DialogDescription>
        </DialogHeader>
        <Formulario key={clave} empresaId={empresaId} contactos={contactos} />
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ empresaId, contactos }: { empresaId: string; contactos: Contacto[] }) {
  const [estado, accion, creando] = useActionState(crearInvitacion, null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [copiado, setCopiado] = useState(false);
  const sinInternet = useSinInternet();

  if (estado?.ok && estado.enlace) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 rounded-md bg-ok/10 px-3 py-2 text-sm font-medium text-ok-texto"><Check className="size-4" /> Enlace listo.</p>
        <Button asChild size="lg" className="w-full">
          <a href={estado.whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> Abrir WhatsApp y enviar</a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Se abre tu WhatsApp con el mensaje escrito{telefono ? "" : " (elige el contacto)"}; solo toca Enviar. Vale 7 días y un solo uso. Te llega un aviso cuando entre.
        </p>
        <Button variant="outline" size="sm" className="w-full" onClick={async () => { await navigator.clipboard.writeText(estado.enlace!); setCopiado(true); }}>
          {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar enlace"}
        </Button>
        <p className="text-center text-xs">
          <Link href="/configuracion/usuarios#invitar" className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:underline">Ver o anular invitaciones</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="empresa_id" value={empresaId} />
      {sinInternet && <RequiereInternet texto="La invitación vive en la nube para que RR. HH. la abra desde su teléfono. Conéctate para crearla." />}
      {contactos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Toca un contacto o escribe los datos:</p>
          <div className="flex flex-wrap gap-1.5">
            {contactos.map((c) => (
              <button key={c.telefono} type="button" onClick={() => { setNombre(c.nombre); setTelefono(c.telefono); }}
                aria-pressed={telefono === c.telefono}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10">
                {c.nombre}
              </button>
            ))}
          </div>
        </div>
      )}
      <Campo id="nombre" etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Quién recibe" maxLength={120} autoComplete="off" />
      <Campo id="telefono" etiqueta="WhatsApp" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="0414-1234567" autoComplete="off" />
      <Aviso resultado={estado} />
      <Button type="submit" size="lg" className="w-full" disabled={creando || sinInternet}>
        {creando ? <Loader2 className="animate-spin" /> : <Link2 />} Crear enlace
      </Button>
    </form>
  );
}
