import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, PenLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { movimientos } from "@/lib/auditoria";
import { hoyVE } from "@/lib/citas";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { Volver } from "../volver";

export const metadata: Metadata = { title: "Auditoría" };
export const dynamic = "force-dynamic";

const mover = (dia: string, n: number) => {
  const d = new Date(dia + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hora = (iso: string) => new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ dia?: string; ver?: string }> }) {
  const [{ dia: p, ver }, sesion] = await Promise.all([searchParams, obtenerSesion()]);
  const hoy = hoyVE();
  const dia = p && /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : hoy;
  const permitido = sesion.demo || ["administrador", "gerente_medico", "auditor"].includes(sesion.rol ?? "");
  const lista = permitido ? await movimientos(dia) : [];
  const filtro = ver === "acceso" || ver === "cambio" ? ver : null;
  const vista = filtro ? lista.filter((m) => m.tipo === filtro) : lista;
  const etiqueta = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(dia + "T12:00:00Z"));
  const enlace = (q: Record<string, string | null>) => {
    const u = new URLSearchParams({ ...(dia !== hoy ? { dia } : {}), ...(filtro ? { ver: filtro } : {}) });
    for (const [k, v] of Object.entries(q)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    return `/configuracion/auditoria${u.size ? `?${u}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Auditoría</h1>
        <p className="text-muted-foreground">Quién abrió cada historia clínica y qué se creó, cambió o borró, con el equipo de origen. Los registros no se pueden editar ni borrar.</p>
      </div>

      {!permitido ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Solo el administrador, el gerente médico y el auditor ven la auditoría.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
              <Button variant="ghost" size="icon" className="size-8" asChild><Link href={enlace({ dia: mover(dia, -1) })} aria-label="Día anterior"><ChevronLeft /></Link></Button>
              <span className="px-2 text-sm first-letter:uppercase">{dia === hoy ? "Hoy" : etiqueta}</span>
              <Button variant="ghost" size="icon" className="size-8" asChild><Link href={enlace({ dia: mover(dia, 1) })} aria-label="Día siguiente"><ChevronRight /></Link></Button>
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
              {([[null, "Todo"], ["acceso", "Accesos"], ["cambio", "Cambios"]] as const).map(([v, t]) => (
                <Link key={t} href={enlace({ ver: v })} className={cn("rounded-md px-3 py-1", filtro === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>{t}</Link>
              ))}
            </div>
            <span className="ml-auto text-sm text-muted-foreground tabular-nums">{vista.length} registros</span>
          </div>

          <Card className="py-0">
            {vista.length === 0 ? (
              <p className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground">
                <ShieldCheck className="size-4" /> {sesion.demo ? "Conecta Supabase para ver la auditoría." : "Sin movimientos ese día."}
              </p>
            ) : (
              <ul className="divide-y">
                {vista.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                    <time className="w-12 font-mono text-sm text-muted-foreground">{hora(m.en)}</time>
                    <span className={cn("grid size-8 place-items-center rounded-lg", m.tipo === "acceso" ? "bg-info/15 text-info-texto" : "bg-primary/10 text-primary")}>
                      {m.tipo === "acceso" ? <Eye className="size-4" /> : <PenLine className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{m.que}</div>
                      <div className="text-xs text-muted-foreground">{m.quien} · {m.equipo ?? "Web"}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
