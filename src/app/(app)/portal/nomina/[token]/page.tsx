import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TOKEN_DEPURACION, venceTexto, type VistaDepuracion } from "@/lib/depurar-nomina";
import { URL_PUBLICA } from "@/lib/invitaciones";
import { puedePortal } from "@/lib/permisos-portal";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ListaNomina } from "../../../../nomina/[token]/lista";
import { CopiarEnlaceNomina } from "../controles";

export const metadata: Metadata = { title: "Revisión de nómina", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function RevisarNominaPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sesion = await obtenerSesion();
  if (!TOKEN_DEPURACION.test(token) || sesion.rol !== "gerente_empresa" || sesion.demo || !puedePortal(sesion, "nomina")) notFound();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("ver_depuracion_nomina", { p_token: token, p_dispositivo: null });
  const vista = data as VistaDepuracion | null;
  if (!error && vista?.acceso !== "ok") notFound();

  return (
    <section className="mx-auto max-w-6xl space-y-4 pb-32">
      <Button asChild variant="ghost" size="sm"><Link href="/portal/nomina"><ArrowLeft /> Volver a nómina</Link></Button>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Revisión de nómina</h1>
          {vista?.empresa && <p className="text-sm font-medium">{vista.empresa}</p>}
          {vista?.estado === "vigente" && !vista.enviado_en && (
            <p className="text-sm text-muted-foreground">Marca quién sigue o ya no está y agrega a quien falte. El borrador se guarda hasta el {venceTexto(vista.vence)}.</p>
          )}
        </div>
        {vista?.estado === "vigente" && !vista.enviado_en && <CopiarEnlaceNomina enlace={`${URL_PUBLICA}/portal/nomina/${token}`} />}
      </div>
      {error ? <p role="status">La revisión requiere conexión a internet. Vuelve a intentarlo.</p>
        : vista?.estado === "aplicado" ? <p role="status">El servicio médico ya revisó esta actualización.</p>
          : vista?.estado === "anulado" ? <p role="status">El enlace fue anulado.</p>
            : vista?.enviado_en ? <p role="status" className="text-ok-texto">Actualización enviada. El servicio médico debe confirmar los cambios.</p>
              : vista?.estado === "vencido" ? <p role="status">El enlace venció. Vuelve a «Actualizar nómina» para continuar.</p>
                : vista && <ListaNomina token={token} vista={vista} portal />}
    </section>
  );
}
