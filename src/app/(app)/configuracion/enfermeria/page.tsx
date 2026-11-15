import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HeartPulse } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ajustesEnfermeria } from "@/lib/enfermeria";
import { obtenerSesion } from "@/lib/sesion";
import { Decisiones } from "../../enfermeria/decisiones";
import { Volver } from "../volver";

export const metadata: Metadata = { title: "Enfermería" };
export const dynamic = "force-dynamic";

// Las mismas dos decisiones de la pantalla Enfermería, también aquí (la gerencia las busca en Configuración)
export default async function ConfiguracionEnfermeria() {
  const sesion = await obtenerSesion();
  if (sesion.rol !== "administrador" && sesion.rol !== "gerente_medico") notFound();
  const ajustes = await ajustesEnfermeria();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Volver />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><HeartPulse className="size-6 text-primary" aria-hidden /> Enfermería</h1>
        <p className="text-muted-foreground">Cómo se cuenta lo que registra enfermería. Para invitar a la enfermera de una empresa: <Link href="/configuracion/usuarios" className="text-primary hover:underline">Usuarios</Link>, rol Enfermería y su empresa.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tus decisiones</CardTitle>
          <CardDescription>Cámbialas cuando quieras; no se pierde ningún dato.</CardDescription>
        </CardHeader>
        <CardContent>
          <Decisiones editable={!sesion.demo} valores={{ enfermeria_unida: ajustes.enfermeria_unida === true, enfermeria_vigilancia: ajustes.enfermeria_vigilancia === true, enfermeria_tasas: ajustes.enfermeria_tasas === true }} />
        </CardContent>
      </Card>
    </div>
  );
}
