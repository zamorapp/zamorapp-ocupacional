import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabaseConfigurado } from "@/lib/config";
import { obtenerSesion } from "@/lib/sesion";
import { puedeFirmarRegistro } from "@/lib/registro-documentos-servidor";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FirmarPdf } from "./firmar-pdf";

export const metadata: Metadata = { title: "Firmar y sellar PDF" };
export const dynamic = "force-dynamic";

// Solo el médico firmante, y solo con SU firma y SU sello: firma_sello() se pide con el id de la sesión.
// Ningún otro rol (enfermería, recepción, RR. HH.) entra aquí aunque la base les deje ver la firma para imprimir.
export default async function FirmarYSellar() {
  const sesion = await obtenerSesion();
  const puede = !sesion.demo && puedeFirmarRegistro(sesion);
  type Imagenes = { firma_url: string | null; sello_url: string | null };
  let imagenes: Imagenes | null = null;
  if (puede && supabaseConfigurado) {
    const supabase = await crearClienteServidor();
    const { data } = await supabase.rpc("firma_sello", { p_usuario: sesion.usuarioId }).maybeSingle();
    imagenes = (data as Imagenes | null) ?? null;
  }
  const firma = imagenes?.firma_url ?? null, sello = imagenes?.sello_url ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <Link href="/documentos" className="text-sm text-muted-foreground hover:underline">‹ Documentos</Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Firmar y sellar PDF</h1>
        <p className="text-muted-foreground">Sube cualquier PDF, mueve tu firma y tu sello donde van y descárgalo listo.</p>
      </div>
      {!puede ? (
        <Card className="p-6 text-muted-foreground">Esta función es solo del médico que firma. Tu rol no puede estampar firma ni sello.</Card>
      ) : !firma && !sello ? (
        <Card className="grid place-items-center gap-3 p-8 text-center">
          <PenLine className="size-8 text-muted-foreground" />
          <p>Todavía no has cargado tu firma ni tu sello.</p>
          <Button asChild><Link href="/configuracion/perfil">Cargarlos en Mi perfil</Link></Button>
        </Card>
      ) : (
        <FirmarPdf firma={firma} sello={sello} orgId={sesion.orgId ?? null} />
      )}
    </div>
  );
}
