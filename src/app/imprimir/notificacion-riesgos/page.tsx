import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerSesion } from "@/lib/sesion";
import { documentoBase } from "../base";
import { BarraImpresion } from "../barra";
import { HojasNotificacion } from "./hojas";

export const metadata: Metadata = { title: "Notificación de riesgos" };
export const dynamic = "force-dynamic";

// Notificación de riesgos por escrito al trabajador (LOPCYMAT arts. 53.1 y 56.3), una hoja por trabajador con su acuse
export default async function NotificacionRiesgos({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const ids = ((await searchParams).ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  const sesion = await obtenerSesion();
  if (!ids.length || sesion.demo || !sesion.orgId) notFound();
  const base = await documentoBase(sesion);
  const hojas = await HojasNotificacion({ ids, base });
  if (!hojas) notFound();
  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver="/pacientes" titulo={ids.length === 1 ? "Notificación de riesgos" : `Notificación de riesgos · ${ids.length} trabajadores`} />
      {hojas}
    </div>
  );
}

