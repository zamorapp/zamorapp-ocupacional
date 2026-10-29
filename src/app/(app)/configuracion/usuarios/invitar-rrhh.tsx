"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Link2, Link2Off, Loader2, MessageCircle } from "lucide-react";
import { Aviso, Campo, CampoSelect } from "@/components/app/campo";
import { confirmar } from "@/components/app/confirmar";
import { RequiereInternet, useSinInternet } from "@/components/app/sin-internet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Invitacion } from "@/lib/invitaciones";
import { cn } from "@/lib/utils";
import { anularInvitacion, crearInvitacion } from "../acciones";

type Empresa = { id: string; nombre: string; contactos: { nombre: string; telefono: string }[] };

const ESTADO: Record<Invitacion["estado"], { t: string; c: string }> = {
  vigente: { t: "Esperando", c: "bg-aviso/20 text-aviso-texto" },
  usada: { t: "Ya entró", c: "bg-ok/15 text-ok-texto" },
  vencida: { t: "Venció", c: "bg-muted text-muted-foreground" },
  anulada: { t: "Anulada", c: "bg-muted text-muted-foreground" },
};
const dia = (iso: string) => new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));

// RR. HH. de cada empresa entra al portal con un enlace que el administrador manda por WhatsApp desde su teléfono
export function InvitarRrhh({ empresas, invitaciones }: { empresas: Empresa[]; invitaciones: Invitacion[] }) {
  const [estado, accion, creando] = useActionState(crearInvitacion, null);
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [, iniciar] = useTransition();
  const sinInternet = useSinInternet();
  const contactos = empresas.find((e) => e.id === empresaId)?.contactos ?? [];

  return (
    <Card id="invitar">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Link2 className="size-4" /> Invitar a RR. HH. por enlace</CardTitle>
        <p className="text-sm text-muted-foreground">Le llega un enlace por WhatsApp; crea su cuenta y entra directo al portal de su empresa para pedir evaluaciones y ver resultados. Vale 7 días y un solo uso.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {sinInternet && <RequiereInternet texto="La invitación vive en la nube para que RR. HH. la abra desde su teléfono. Conéctate para crearla." />}
        <form action={accion} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <CampoSelect id="empresa_id" etiqueta="Empresa *" value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setNombre(""); setTelefono(""); }}>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </CampoSelect>
          <Campo id="nombre" etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Quién recibe" maxLength={120} />
          <Campo id="telefono" etiqueta="WhatsApp" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="0414-1234567" />
          <Button type="submit" disabled={creando || !empresaId || sinInternet} className="h-10">{creando ? <Loader2 className="animate-spin" /> : <Link2 />} Crear enlace</Button>
          {contactos.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Contactos de la empresa:
              {contactos.map((c) => (
                <button key={c.telefono} type="button" onClick={() => { setNombre(c.nombre); setTelefono(c.telefono); }} className="rounded-full border px-2 py-0.5 hover:bg-muted">{c.nombre}</button>
              ))}
            </p>
          )}
        </form>

        {estado?.ok && estado.enlace ? (
          <div className="space-y-2 rounded-md bg-ok/10 p-3 text-sm">
            <p className="font-medium text-ok-texto">{estado.mensaje}</p>
            <p className="break-all rounded bg-background px-2 py-1 font-mono text-xs">{estado.enlace}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm"><a href={estado.whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> Enviar por WhatsApp</a></Button>
              <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(estado.enlace!); setCopiado(true); }}>{copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar enlace"}</Button>
            </div>
          </div>
        ) : (
          <Aviso resultado={estado} />
        )}

        {invitaciones.length > 0 && (
          <ul className="divide-y rounded-md border">
            {invitaciones.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium [overflow-wrap:anywhere]">{i.nombre || "Sin nombre"} <span className="font-normal text-muted-foreground">· {i.empresa}</span></span>
                  <span className="block text-xs text-muted-foreground">Creada el {dia(i.creadoEn)}{i.usadaEn ? ` · entró el ${dia(i.usadaEn)}` : i.estado === "vigente" ? ` · vence el ${dia(i.vence)}` : ""}</span>
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTADO[i.estado].c)}>{ESTADO[i.estado].t}</span>
                {i.estado === "vigente" && (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    if (await confirmar({ titulo: "¿Anular este enlace?", texto: "Ya no servirá para entrar. Puedes crear otro cuando quieras.", accion: "Anular", peligro: true })) iniciar(async () => { await anularInvitacion(i.id); });
                  }}><Link2Off /> Anular</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
