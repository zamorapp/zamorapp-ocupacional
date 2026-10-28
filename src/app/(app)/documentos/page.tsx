import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { MenuImprimir } from "@/components/app/menu-imprimir";
import { Card } from "@/components/ui/card";
import { listarConsultas } from "@/lib/consultas";
import { fecha } from "@/lib/pacientes";
import { obtenerSesion } from "@/lib/sesion";
import { hoyCaracas, sumarDias } from "@/lib/fecha";

export const metadata: Metadata = { title: "Documentos" };
export const dynamic = "force-dynamic";

export default async function Documentos() {
  const sesion = await obtenerSesion();
  const desde = sumarDias(hoyCaracas(), -90);
  const consultas = sesion.demo ? [] : (await listarConsultas({ desde, limite: 300 })).filter((c) => c.estado !== "borrador");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Documentos</h1>
        <p className="text-muted-foreground">
          Constancias, reposos, informes y récipes de las consultas cerradas en los últimos 90 días. Se abren listos para imprimir o guardar en PDF.
        </p>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {consultas.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <FileText className="size-8" />
            Cierra una consulta en Atención médica para emitir sus documentos.
          </div>
        ) : (
          <ul className="divide-y">
            {consultas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <span className="w-24 font-mono text-sm text-muted-foreground">{fecha(c.fecha)}</span>
                <div className="min-w-48 flex-1">
                  <Link href={`/atencion/${c.id}`} className="font-medium hover:text-primary">{c.paciente}</Link>
                  <div className="text-xs text-muted-foreground">{c.motivo ?? "Sin motivo"} · {c.empresa}</div>
                </div>
                <MenuImprimir consultaId={c.id} aptitud={Boolean(c.aptitud)} reposo={c.tieneReposo} tratamiento={c.tieneTratamiento} preoperatoria={/preoper/i.test(c.motivo ?? "")} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
