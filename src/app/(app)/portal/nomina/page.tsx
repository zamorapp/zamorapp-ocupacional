import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { venceTexto, type EstadoNominaPortal } from "@/lib/depurar-nomina";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas, soloEmpresas } from "@/lib/empresas";
import { puedePortal } from "@/lib/permisos-portal";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearEnlaceNomina } from "./controles";

export const metadata: Metadata = { title: "Actualizar nómina", robots: { index: false, follow: false } };

export default async function NominaPortal({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const sesion = await obtenerSesion();
  if (sesion.rol !== "gerente_empresa" || !sesion.orgId || sesion.demo || !puedePortal(sesion, "nomina")) notFound();
  const [{ empresa: elegida }, visibles, activa] = await Promise.all([searchParams, listarEmpresas(), empresaActivaId()]);
  const empresas = soloEmpresas(visibles);
  const empresa = empresas.find((e) => e.id === (elegida ?? activa)) ?? (!elegida && empresas.length === 1 ? empresas[0] : null);
  if (elegida && !empresa) notFound();
  const { data, error } = empresa
    ? await (await crearClienteServidor()).rpc("nomina_portal", { p_org: sesion.orgId, p_empresa: empresa.id })
    : { data: null, error: null };
  if (error?.code === "42501") notFound();
  const estado = data as EstadoNominaPortal | null;

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm"><Link href="/portal"><ArrowLeft /> Volver al portal</Link></Button>
      <h1 className="text-2xl font-semibold">Actualizar nómina</h1>
      {empresas.length > 1 && (
        <nav aria-label="Empresa de la nómina" className="flex flex-wrap gap-2">
          {empresas.map((e) => (
            <Button key={e.id} asChild variant={empresa?.id === e.id ? "default" : "outline"} className="h-auto max-w-full whitespace-normal text-left">
              <Link href={`/portal/nomina?empresa=${e.id}`} aria-current={empresa?.id === e.id ? "page" : undefined}>{e.razonSocial}</Link>
            </Button>
          ))}
        </nav>
      )}
      {empresa ? (
        <div className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">{empresa.razonSocial}</h2>
          {estado?.estado === "disponible" ? (
            <>
              <p className="text-sm text-muted-foreground">Crea un enlace para revisar quién sigue en la empresa y proponer altas o salidas. El enlace dura siete días y requiere una cuenta de RR. HH. autorizada para esta empresa.</p>
              <CrearEnlaceNomina key={empresa.id} empresa={empresa.id} />
            </>
          ) : estado?.estado === "borrador" ? (
            <>
              <p className="text-sm text-muted-foreground">Hay una revisión en curso. Vence el {venceTexto(estado.vence)}.</p>
              <Button asChild><Link href={`/portal/nomina/${estado.token}`}>Continuar revisión</Link></Button>
            </>
          ) : estado?.estado === "enviada" ? (
            <p role="status" className="text-sm text-ok-texto">La actualización ya se envió y espera revisión del servicio médico.</p>
          ) : estado?.estado === "enlace_servicio" ? (
            <p className="text-sm text-muted-foreground">El servicio médico ya creó un enlace para esta empresa. Usa el enlace que te enviaron para continuar esa revisión.</p>
          ) : <p role="status" className="text-sm text-muted-foreground">La nómina requiere conexión a internet. Vuelve a intentarlo.</p>}
        </div>
      ) : <p className="text-sm text-muted-foreground">{empresas.length ? "Elige la empresa que quieres revisar." : "Tu cuenta no tiene empresas activas asignadas."}</p>}
    </section>
  );
}
