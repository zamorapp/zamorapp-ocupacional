import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listarEmpresas } from "@/lib/empresas";
import { anioCaracas } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CUBETA_VIGILANCIA_PROYECTOS, datosBorradorProyecto, ROLES_VIGILANCIA_PROYECTOS } from "@/lib/vigilancia-proyectos";
import { SubirBorrador } from "./subir-borrador";

export const metadata = { title: "Vigilancia por proyecto" };
export const dynamic = "force-dynamic";

export default async function VigilanciaProyectos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !ROLES_VIGILANCIA_PROYECTOS.includes(sesion.rol ?? "")) notFound();
  const empresa = (await listarEmpresas(true)).find((e) => e.id === id && !e.esParticular);
  if (!empresa) notFound();

  const ruta = `/empresas/${id}/vigilancia-proyectos`;
  const carpeta = `${sesion.orgId}/${id}`;
  const cubeta = (await crearClienteServidor()).storage.from(CUBETA_VIGILANCIA_PROYECTOS);
  const contratos = new Map<string, { archivo: string; nombre: string }[]>();
  const lote = 100;
  let errorLista = false;
  for (let offset = 0; ; offset += lote) {
    const { data, error } = await cubeta.list(carpeta, { limit: lote, offset, sortBy: { column: "name", order: "desc" } });
    if (error) {
      errorLista = true;
      break;
    }
    for (const item of data) {
      const borrador = item.id && datosBorradorProyecto(item.name);
      if (!borrador) continue;
      const archivos = contratos.get(borrador.contrato) ?? [];
      archivos.push({ archivo: item.name, nombre: borrador.nombre });
      contratos.set(borrador.contrato, archivos);
    }
    if (data.length < lote) break;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/empresas/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 shrink-0" /> {empresa.razonSocial}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Vigilancia por proyecto</h1>
      {errorLista && <p role="alert" className="text-sm text-destructive">No se pudo cargar la lista completa. Revisa la conexión y recarga la página.</p>}
      {!errorLista && contratos.size === 0 && <p className="text-sm text-muted-foreground">Todavía no hay borradores por contrato.</p>}
      {[...contratos].map(([contrato, archivos]) => (
        <Card key={contrato}>
          <CardHeader><CardTitle>Contrato {contrato}</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {archivos.map(({ archivo, nombre }) => (
                <li key={archivo} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="size-4 text-muted-foreground" aria-hidden />
                    <span>{nombre} <span className="text-muted-foreground">· Borrador</span></span>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${ruta}/pdf/${encodeURIComponent(archivo)}`} target="_blank" rel="noopener" aria-label={`Abrir PDF del ${nombre}`}>Abrir PDF</a>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader><CardTitle>Agregar informe en borrador</CardTitle></CardHeader>
        <CardContent><SubirBorrador carpeta={carpeta} anioActual={anioCaracas()} /></CardContent>
      </Card>
    </div>
  );
}
