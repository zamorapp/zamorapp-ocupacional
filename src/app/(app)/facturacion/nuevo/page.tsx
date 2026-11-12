import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { listarEmpresas } from "@/lib/empresas";
import { listarAtenciones, listarServicios, preciosEmpresa, sugerenciasCobro, tasaVigente } from "@/lib/facturacion";
import { ArmarCobro } from "./armar-cobro";

export const metadata: Metadata = { title: "Nueva nota de cobro" };
export const dynamic = "force-dynamic";

export default async function NuevoCobro({ searchParams }: { searchParams: Promise<{ empresa?: string; desde?: string; hasta?: string; factura?: string }> }) {
  const q = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  if (!q.empresa || !q.desde || !q.hasta || !dia.test(q.desde) || !dia.test(q.hasta)) notFound();
  const [empresas, atenciones, servicios, precios, tasa, sugerencias] = await Promise.all([
    listarEmpresas(),
    listarAtenciones(q.empresa, q.desde, q.hasta),
    listarServicios(true),
    preciosEmpresa(q.empresa),
    tasaVigente(),
    sugerenciasCobro(q.empresa, q.desde, q.hasta),
  ]);
  const empresa = empresas.find((e) => e.id === q.empresa);
  if (!empresa) notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/facturacion?vista=atendidos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes atendidos
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{q.factura ? "Facturar el período" : "Nueva nota de cobro"}</h1>
        <p className="text-muted-foreground">{empresa.razonSocial} · {q.desde.split("-").reverse().join("/")} al {q.hasta.split("-").reverse().join("/")}</p>
      </div>
      <ArmarCobro
        empresaId={empresa.id}
        desde={q.desde}
        hasta={q.hasta}
        atenciones={atenciones.filter((a) => !a.cobroId)}
        servicios={servicios.map((s) => ({ ...s, precioUsd: precios[s.id] ?? s.precioUsd }))}
        tasa={tasa?.tasa ?? null}
        aFactura={Boolean(q.factura)}
        sugerencias={sugerencias}
      />
    </div>
  );
}
