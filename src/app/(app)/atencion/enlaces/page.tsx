import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Link2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ahora, hoyCaracas, sumarDias } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { historialEnlacesPaciente } from "../paciente-enlace-acciones";
import { HistorialEnlaces } from "./historial";

export const metadata: Metadata = { title: "Historial de enlaces" };
export const dynamic = "force-dynamic";

const fecha = (x: string | undefined) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);

// Historial de enlaces al paciente (20261030931000). Por defecto, los últimos 30 días.
export default async function Enlaces({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const [q, sesion] = await Promise.all([searchParams, obtenerSesion()]);
  const hoy = hoyCaracas();
  const hasta = fecha(q.hasta) ?? hoy;
  const desde = fecha(q.desde) ?? sumarDias(hasta, -30);
  const r = await historialEnlacesPaciente(desde, hasta);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/atencion" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Atención médica</Link>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Historial de enlaces</h1>
          <p className="text-sm text-muted-foreground">Los enlaces que envió a sus pacientes: alárguelos, cadúquelos o elimínelos.</p>
        </div>
        {!sesion.demo && <Button asChild><Link href="/atencion?enlace=nuevo"><Link2 /> Nuevo enlace</Link></Button>}
      </div>
      {r.ok ? (
        <HistorialEnlaces enlaces={r.enlaces} desde={desde} hasta={hasta} hoy={hoy} ahora={ahora()} mas={r.mas} sinProrroga={r.sinProrroga} />
      ) : (
        <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground"><WifiOff className="size-4 shrink-0" /> {r.mensaje}</p>
      )}
    </div>
  );
}
