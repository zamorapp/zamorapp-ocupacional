import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnVivo } from "@/components/app/en-vivo";
import { listarPorConfirmar } from "@/lib/citas";
import { datosOrganizacion } from "@/lib/organizacion";
import { obtenerSesion } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha";
import { PLANTILLA_CITA } from "@/lib/mensajes";
import { ListaPorConfirmar } from "./lista";

export const metadata: Metadata = { title: "Citas por confirmar" };
export const dynamic = "force-dynamic";

// Inicio › «Citas por confirmar»: las provisionales (esperan a la empresa) y las pedidas por el portal (esperan al
// servicio), de todas las empresas. Misma regla que el número de la tarjeta (inicio_conteos) y se refresca en vivo.
export default async function CitasPorConfirmar() {
  const sesion = await obtenerSesion();
  const [citas, org] = await Promise.all([sesion.demo ? [] : listarPorConfirmar(), datosOrganizacion()]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild><Link href="/panel"><ArrowLeft /> Inicio</Link></Button>
        <div className="w-full">
          <h1 className="text-2xl font-semibold tracking-tight">Citas por confirmar</h1>
          <p className="text-sm text-muted-foreground">
            Las provisionales esperan el sí de la empresa; las pedidas por el portal esperan el tuyo. Todas las empresas.
            {!sesion.demo && sesion.orgId && <EnVivo tabla="citas" orgId={sesion.orgId} />}
          </p>
        </div>
      </div>
      <ListaPorConfirmar citas={citas} hoy={hoyCaracas()} servicio={org.nombre} plantilla={org.ajustes.mensaje_cita ?? PLANTILLA_CITA} />
    </div>
  );
}
