import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NuevaSolicitud } from "@/components/app/nueva-solicitud";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { consultasParaResponder, listarSolicitudes } from "@/lib/solicitudes";
import type { EstadoSolicitud } from "@/lib/solicitudes-tipos";
import { cn } from "@/lib/utils";
import { FilaSolicitud } from "./fila-solicitud";

export const metadata: Metadata = { title: "Solicitudes de empresas" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SERVICIO = ["administrador", "gerente_medico", "medico", "enfermeria", "recepcion"];
const FILTROS: { clave: EstadoSolicitud | "abiertas" | "todas"; texto: string }[] = [
  { clave: "abiertas", texto: "Abiertas" },
  { clave: "respondida", texto: "Respondidas" },
  { clave: "rechazada", texto: "Rechazadas" },
  { clave: "todas", texto: "Todas" },
];

// Bandeja del servicio: lo que piden las empresas desde el portal (o se registró por teléfono), para responder con un documento
export default async function Solicitudes({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion.rol || !SERVICIO.includes(sesion.rol)) notFound();
  const { ver = "abiertas" } = await searchParams;
  const filtro = FILTROS.find((f) => f.clave === ver)?.clave ?? "abiertas";
  const [empresas, activa, listas] = await Promise.all([listarEmpresas(), empresaActivaId(), opciones(sesion.orgId, ["tipo_solicitud"])]);
  const solicitudes = await listarSolicitudes({ estado: filtro === "todas" ? undefined : filtro, empresaId: activa });
  const consultas = sesion.clinico ? await consultasParaResponder([...new Set(solicitudes.filter((s) => s.trabajadorId && ["pendiente", "en_proceso"].includes(s.estado)).map((s) => s.trabajadorId!))]) : {};

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Solicitudes de empresas</h1>
          <p className="text-muted-foreground">Informes, copias y constancias que piden las empresas. Al responder, la empresa recibe el aviso y descarga el documento en su portal.</p>
        </div>
        <NuevaSolicitud servicio tipos={listas.tipo_solicitud.map((t) => ({ id: t.id, nombre: t.nombre }))} empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} />
      </div>
      <nav className="flex w-fit flex-wrap gap-1 rounded-xl bg-muted p-1" aria-label="Filtrar solicitudes">
        {FILTROS.map((f) => (
          <Link key={f.clave} href={`/solicitudes?ver=${f.clave}`} aria-current={filtro === f.clave ? "page" : undefined}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", filtro === f.clave ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>{f.texto}</Link>
        ))}
      </nav>
      {solicitudes.length === 0 ? (
        <p className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">{filtro === "abiertas" ? "Nada pendiente. Las nuevas solicitudes llegan con aviso a la campanita." : "Sin solicitudes."}</p>
      ) : (
        <ul className="space-y-3">
          {solicitudes.map((s) => <FilaSolicitud key={s.id} s={s} orgId={sesion.orgId ?? ""} consultas={s.trabajadorId ? consultas[s.trabajadorId] ?? [] : []} clinico={sesion.clinico} />)}
        </ul>
      )}
    </div>
  );
}
