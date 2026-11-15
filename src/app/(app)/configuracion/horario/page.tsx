import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import { hoyCaracas } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Volver } from "../volver";
import { EditorHorario, type Bloqueo } from "./editor-horario";
import type { Tramo } from "./acciones";

export const metadata: Metadata = { title: "Disponibilidad para citas" };
export const dynamic = "force-dynamic";

export default async function Horario() {
  const sesion = await obtenerSesion();
  let tramos: Tramo[] = [];
  let bloqueos: Bloqueo[] = [];
  let minutos = 30, cupos = 1;
  if (supabaseConfigurado && sesion.orgId) {
    const supabase = await crearClienteServidor();
    const [h, b] = await Promise.all([
      supabase.from("horario_atencion").select("dia, desde, hasta, minutos, cupos").eq("org_id", sesion.orgId).order("dia").order("desde"),
      supabase.from("bloqueos_agenda").select("id, fecha, desde, hasta, motivo").eq("org_id", sesion.orgId).gte("fecha", hoyCaracas()).order("fecha").order("desde", { nullsFirst: true }).limit(200),
    ]);
    tramos = (h.data ?? []).map((t) => ({ dia: t.dia, desde: String(t.desde).slice(0, 5), hasta: String(t.hasta).slice(0, 5) }));
    if (h.data?.[0]) { minutos = h.data[0].minutos; cupos = h.data[0].cupos; }
    bloqueos = (b.data ?? []).map((x) => ({ id: x.id, fecha: x.fecha, desde: x.desde?.slice(0, 5) ?? null, hasta: x.hasta?.slice(0, 5) ?? null, motivo: x.motivo }));
  }
  const edita = !sesion.demo && ["administrador", "gerente_medico", "medico", "enfermeria", "recepcion"].includes(sesion.rol ?? "");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Disponibilidad para citas</h1>
        <p className="text-muted-foreground">Las horas en que RR. HH. puede pedir citas desde el portal. Solo ve las horas con cupo: nunca de qué empresa son las otras citas.</p>
      </div>
      <EditorHorario tramos={tramos} minutos={minutos} cupos={cupos} bloqueos={bloqueos} edita={edita} hoy={hoyCaracas()} />
    </div>
  );
}
