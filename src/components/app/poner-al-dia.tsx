"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmar } from "@/components/app/confirmar";
import { RequiereInternet, useSinInternet } from "@/components/app/sin-internet";
import type { ResultadoAlDia, ResumenAlDia } from "@/lib/al-dia";
import { alDia } from "@/app/(app)/envios/acciones";

const n = (v: number, uno: string, varios: string) => `${v} ${v === 1 ? uno : varios}`;

// Un toque para lo que se le debe a las empresas: confirmar citas del portal y mandar constancias y solicitudes
export function PonerAlDia({ r }: { r: ResumenAlDia }) {
  const router = useRouter();
  const sinInternet = useSinInternet();
  const [trabajando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoAlDia | null>(null);
  const constancias = r.correo ? r.constancias : 0;
  const solicitudes = r.correo ? r.solicitudes : 0;
  const total = r.citas + constancias + solicitudes;
  if (!total && !r.soloWhatsapp && !resultado) return null;

  // Cada parte lleva a su pantalla, para revisarla antes de tocar el botón
  const partes = [
    r.citas ? { href: "/atencion", texto: n(r.citas, "cita del portal por confirmar", "citas del portal por confirmar") } : null,
    constancias ? { href: "/envios/por-enviar", texto: n(constancias, "constancia por enviar", "constancias por enviar") } : null,
    solicitudes ? { href: "/solicitudes", texto: n(solicitudes, "solicitud cuyo correo falló", "solicitudes cuyo correo falló") } : null,
  ].filter((p): p is { href: string; texto: string } => Boolean(p));

  const poner = async () => {
    const lista = [
      r.citas ? `se confirman ${n(r.citas, "cita", "citas")} a la hora que pidió RR. HH.` : null,
      constancias || solicitudes
        ? `se envían por correo ${[constancias ? n(constancias, "constancia", "constancias") : null, solicitudes ? n(solicitudes, "solicitud", "solicitudes") : null].filter(Boolean).join(" y ")} a cada empresa`
        : null,
    ].filter(Boolean).join(" y ");
    if (!(await confirmar({ titulo: "¿Poner todo al día?", texto: `${lista.charAt(0).toUpperCase()}${lista.slice(1)}.`, accion: "Poner al día" }))) return;
    iniciar(async () => {
      setResultado(await alDia());
      router.refresh();
    });
  };

  return (
    <section aria-label="Poner todo al día" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      {total ? <RefreshCw className="size-5 shrink-0 text-primary" aria-hidden /> : <MessageCircle className="size-5 shrink-0 text-primary" aria-hidden />}
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-medium">{total || resultado ? "Pendientes con las empresas" : "Constancias por WhatsApp"}</p>
        <p className="text-sm text-muted-foreground">
          {partes.map((p, i) => <span key={p.href}>{i > 0 && " · "}<Link href={p.href} className="underline underline-offset-2">{p.texto}</Link></span>)}
          {r.soloWhatsapp > 0 && <>{partes.length > 0 && " · "}<Link href="/envios/por-enviar" className="underline underline-offset-2">{n(r.soloWhatsapp, "constancia", "constancias")} solo por WhatsApp</Link> (la empresa no tiene correo)</>}
        </p>
        {!r.correo && r.constancias + r.solicitudes > 0 && (
          <p className="text-sm text-aviso-texto">El correo remitente no está configurado: constancias y solicitudes esperan. <Link href="/envios" className="underline">Configurar</Link></p>
        )}
        {resultado && (
          <p role="status" className="mt-1 text-sm">
            <span className={resultado.ok ? "text-ok-texto" : "text-alerta-texto"}>{resultado.ok && <CheckCircle2 className="mr-1 inline size-4" aria-hidden />}{resultado.mensaje}</span>
            {resultado.aviso && <span className="block text-aviso-texto">{resultado.aviso} <Link href="/envios/bitacora" className="underline">Ver Bitácora</Link></span>}
          </p>
        )}
      </div>
      {total > 0 && (sinInternet ? (
        <div className="w-full"><RequiereInternet texto="Confirmar citas del portal y enviar a las empresas se hace en la nube. Vuelve a intentarlo cuando haya conexión." /></div>
      ) : (
        <Button disabled={trabajando} onClick={poner} className="w-full whitespace-nowrap sm:w-auto">
          {trabajando ? <Loader2 className="animate-spin" /> : <RefreshCw />} {trabajando ? "Poniendo al día…" : "Poner todo al día"}
        </Button>
      ))}
    </section>
  );
}
