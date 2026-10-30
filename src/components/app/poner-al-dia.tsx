"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResultadoAlDia, ResumenAlDia } from "@/lib/al-dia";
import { alDia } from "@/app/(app)/envios/acciones";

const n = (v: number, uno: string, varios: string) => `${v} ${v === 1 ? uno : varios}`;

// Un toque para lo que se le debe a las empresas: confirmar citas del portal y mandar constancias y solicitudes
export function PonerAlDia({ r }: { r: ResumenAlDia }) {
  const [trabajando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoAlDia | null>(null);
  const correo = r.correo ? r.constancias + r.solicitudes : 0;
  const total = r.citas + correo;
  if (!total && !r.soloWhatsapp && !resultado) return null;

  const partes = [
    r.citas ? n(r.citas, "cita del portal por confirmar", "citas del portal por confirmar") : null,
    r.correo && r.constancias ? n(r.constancias, "constancia por enviar", "constancias por enviar") : null,
    r.correo && r.solicitudes ? n(r.solicitudes, "solicitud respondida sin enviar", "solicitudes respondidas sin enviar") : null,
  ].filter(Boolean);

  return (
    <section aria-label="Poner todo al día" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <RefreshCw className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{total ? "Pendientes con las empresas" : "Con las empresas"}</p>
        <p className="text-sm text-muted-foreground">
          {partes.length ? partes.join(" · ") : "Nada por correo."}
          {r.soloWhatsapp > 0 && <> · {n(r.soloWhatsapp, "constancia", "constancias")} solo por WhatsApp: <Link href="/envios/por-enviar" className="underline">Por enviar</Link></>}
          {!r.correo && r.constancias + r.solicitudes > 0 && <> · El correo remitente no está configurado</>}
        </p>
        {resultado && (
          <p role="status" className="mt-1 text-sm">
            <span className={resultado.ok ? "text-ok-texto" : "text-alerta-texto"}>{resultado.ok && <CheckCircle2 className="mr-1 inline size-4" aria-hidden />}{resultado.mensaje}</span>
            {resultado.aviso && <span className="block text-aviso-texto">{resultado.aviso} <Link href="/envios/bitacora" className="underline">Ver Bitácora</Link></span>}
          </p>
        )}
      </div>
      {total > 0 && (
        <Button disabled={trabajando} onClick={() => iniciar(async () => setResultado(await alDia()))} className="whitespace-nowrap">
          {trabajando ? <Loader2 className="animate-spin" /> : <RefreshCw />} {trabajando ? "Poniendo al día…" : "Poner todo al día"}
        </Button>
      )}
    </section>
  );
}
