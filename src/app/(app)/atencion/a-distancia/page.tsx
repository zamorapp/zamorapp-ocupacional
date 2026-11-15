import Link from "next/link";
import { ArrowLeft, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obtenerSesion } from "@/lib/sesion";
import { datosOrganizacion } from "@/lib/organizacion";
import { seguimientosDistancia } from "@/lib/telemedicina";
import { NOMBRE_MEDIO, plazoSala } from "@/lib/telemedicina-tipos";
import { hoyCaracas } from "@/lib/fecha";
import { SalaEspera } from "./sala";

export const metadata = { title: "Sala de espera a distancia" };
const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

// Telemedicina: quién espera volver después de una consulta a distancia, y lo archivado en los últimos 90 días
export default async function SalaDistancia() {
  const sesion = await obtenerSesion();
  if (!sesion.clinico) {
    return <p className="mx-auto max-w-3xl py-10 text-center text-sm text-muted-foreground">Esta lista es del personal de salud.</p>;
  }
  const [espera, archivados, org] = await Promise.all([seguimientosDistancia(), seguimientosDistancia(true), datosOrganizacion()]);
  const plazo = plazoSala(org.ajustes.seguimiento_distancia_dias);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/panel" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Inicio</Link>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Phone className="size-5 text-primary" aria-hidden /> Sala de espera a distancia <span className="ml-auto text-sm font-normal text-muted-foreground tabular-nums">{espera.length}</span></CardTitle>
          <CardDescription>
            Consultas por llamada, videollamada o WhatsApp que esperan que el paciente vuelva. Al vencer el plazo ({plazo} días, se cambia en
            Configuración › Organización › Plazos) pasan solas a Archivados y quedan en su historia.
          </CardDescription>
        </CardHeader>
        <CardContent><SalaEspera lista={espera} hoy={hoyCaracas()} servicio={org.nombre} /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Archivados (90 días)</CardTitle>
          <CardDescription>No volvieron en el plazo. Si vuelven, su ficha ofrece abrir el control enlazado.</CardDescription>
        </CardHeader>
        <CardContent>
          {archivados.length === 0 ? <p className="text-sm text-muted-foreground">Nada archivado.</p> : (
            <ul className="divide-y text-sm">
              {archivados.map((a) => (
                <li key={a.alertaId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Link href={`/pacientes/${a.trabajadorId}`} className="font-medium hover:underline">{a.paciente}</Link>
                  <span className="text-muted-foreground">{NOMBRE_MEDIO[a.medio]} · consulta del <span className="tabular-nums">{fechaCorta(a.fecha)}</span></span>
                  {a.controlId ? <Link href={`/atencion/${a.controlId}`} className="ml-auto text-primary hover:underline">Ver control</Link> : <span className="ml-auto text-muted-foreground">{a.respuesta}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
