import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { listarEmpresas } from "@/lib/empresas";
import { listarAtenciones, listarServicios, preciosEmpresa, tasaVigente } from "@/lib/facturacion";
import { ArmarCobro } from "./armar-cobro";

export const metadata: Metadata = { title: "Nueva nota de cobro" };
export const dynamic = "force-dynamic";

export default async function NuevoCobro({ searchParams }: { searchParams: Promise<{ empresa?: string; desde?: string; hasta?: string }> }) {
  const q = await searchParams;
  if (!q.empresa || !q.desde || !q.hasta) notFound();
  const [empresas, atenciones, servicios, precios, tasa] = await Promise.all([
    listarEmpresas(),
    listarAtenciones(q.empresa, q.desde, q.hasta),
    listarServicios(true),
    preciosEmpresa(q.empresa),
    tasaVigente(),
  ]);
  const empresa = empresas.find((e) => e.id === q.empresa);
  if (!empresa) notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/facturacion?vista=atendidos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes atendidos
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva nota de cobro</h1>
        <p className="text-muted-foreground">{empresa.razonSocial} · {q.desde.split("-").reverse().join("/")} al {q.hasta.split("-").reverse().join("/")}</p>
      </div>
      <ArmarCobro
        empresaId={empresa.id}
        desde={q.desde}
        hasta={q.hasta}
        atenciones={atenciones.filter((a) => !a.cobroId)}
        servicios={servicios.map((s) => ({ ...s, precioUsd: precios[s.id] ?? s.precioUsd }))}
        tasa={tasa?.tasa ?? null}
      />
    </div>
  );
}
