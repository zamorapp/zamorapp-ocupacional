import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listarEmpresas } from "@/lib/empresas";
import { bitacora, contarPendientes } from "@/lib/envios";
import { obtenerSesion } from "@/lib/sesion";
import { PestanasEnvios } from "../pestanas";
import { TablaBitacora } from "./tabla-bitacora";

export const metadata: Metadata = { title: "Bitácora de envíos" };
export const dynamic = "force-dynamic";
// Reintentar regenera el PDF y vuelve a mandar varios correos
export const maxDuration = 60;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default async function Bitacora({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sesion = await obtenerSesion();
  if (!sesion.clinico) notFound();
  const p = await searchParams;
  const filtros = {
    empresaId: p.empresa || undefined,
    estado: p.estado || undefined,
    canal: p.canal || undefined,
    desde: p.desde && FECHA.test(p.desde) ? p.desde : undefined,
    hasta: p.hasta && FECHA.test(p.hasta) ? p.hasta : undefined,
  };
  const [empresas, filas, pendientes] = await Promise.all([listarEmpresas(), bitacora(filtros), contarPendientes()]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Envíos a empresas</h1>
        <p className="text-muted-foreground">Todo lo que salió, a quién y quién lo envió. Los correos que fallaron se reintentan con un toque.</p>
      </div>
      <PestanasEnvios pendientes={pendientes} />
      <TablaBitacora
        filas={filas}
        filtros={{ empresa: p.empresa ?? "", estado: p.estado ?? "", canal: p.canal ?? "", desde: filtros.desde ?? "", hasta: filtros.hasta ?? "" }}
        empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
      />
    </div>
  );
}
