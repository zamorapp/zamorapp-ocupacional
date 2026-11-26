import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Actividad de RR. HH." };
export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = {
  ingreso: "Ingreso al portal", solicitud: "Solicitud al servicio", cita: "Solicitud de cita",
  estudio: "Estudio recibido", altas: "Trabajadores registrados", nomina_abierta: "Enlace de nómina abierto",
  nomina_enviada: "Nómina enviada a revisión", documento_entregado: "Documento solicitado para descarga",
  relacion_entregada: "Excel de evaluaciones solicitado", evaluacion_firmada: "Evaluación firmada",
  constancia_lista: "Constancia disponible", constancia_entregada: "Constancia solicitada para descarga",
};
const FORMATO = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" });

export default async function ActividadRRHH() {
  const sesion = await obtenerSesion();
  if (!sesion.orgId || !["administrador", "gerente_medico"].includes(sesion.rol ?? "")) notFound();
  const [supabase, empresas, activa] = await Promise.all([crearClienteServidor(), listarEmpresas(true), empresaActivaId()]);
  const nombres = new Map(empresas.map((e) => [e.id, e.razonSocial]));
  let consulta = supabase.from("actividad_rrhh").select("id,empresa_id,actor_nombre,tipo,cantidad,fecha")
    .eq("org_id", sesion.orgId).order("fecha", { ascending: false }).limit(100);
  if (activa && nombres.has(activa)) consulta = consulta.eq("empresa_id", activa);
  const { data, error } = await consulta;
  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Actividad de RR. HH.</h1>
      <p className="text-sm text-muted-foreground">{activa && nombres.has(activa) ? nombres.get(activa) : "Empresas a tu cargo"} · Últimos 100 registros</p>
      {error ? <p role="status">El historial requiere conexión a internet. Vuelve a intentarlo cuando haya conexión.</p>
        : data?.length ? <ul className="divide-y rounded-lg border">
          {data.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 p-4">
            <div>
              <p className="font-medium">{TIPOS[r.tipo] ?? r.tipo}{r.cantidad > 1 ? ` · ${r.cantidad}` : ""}</p>
              <p className="text-sm text-muted-foreground">{nombres.get(r.empresa_id) ?? "Empresa"}{r.actor_nombre ? ` · ${r.actor_nombre}` : ""}</p>
            </div>
            <time dateTime={r.fecha} className="text-sm text-muted-foreground">{FORMATO.format(new Date(r.fecha))}</time>
          </li>)}
        </ul> : <p>Aún no hay actividad registrada para mostrar.</p>}
    </section>
  );
}
