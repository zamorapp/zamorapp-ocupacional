import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { listarServicios, obtenerCobro, preciosEmpresa } from "@/lib/facturacion";
import { obtenerSesion } from "@/lib/sesion";
import { EditorCobro } from "./editor-cobro";

export const metadata: Metadata = { title: "Cobro o presupuesto" };
export const dynamic = "force-dynamic";

export default async function Cobro({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cobro, sesion] = await Promise.all([obtenerCobro(id), obtenerSesion()]);
  if (!cobro) notFound();
  const [servicios, precios] = await Promise.all([listarServicios(true), preciosEmpresa(cobro.empresaId)]);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/facturacion" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Facturación
      </Link>
      <EditorCobro inicial={cobro} servicios={servicios} precios={precios} editable={!sesion.demo && ["administrador", "gerente_medico", "recepcion"].includes(sesion.rol ?? "")} />
    </div>
  );
}
