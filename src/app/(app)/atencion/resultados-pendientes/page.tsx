import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, FileSearch, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ETIQUETA_ESTADO_CONSULTA, type EstadoConsulta } from "@/lib/consultas-tipos";
import { hoyCaracas } from "@/lib/fecha";
import { fecha } from "@/lib/pacientes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resultados por recibir" };

type Fila = {
  id: string;
  fecha: string;
  estado: EstadoConsulta;
  paciente: string;
  empresa: string;
  pendientes: number;
};

const RUTA = "/atencion/resultados-pendientes";
const TAMANO = 50;

export default async function Pagina({ searchParams }: { searchParams: Promise<{ despues?: string }> }) {
  const [{ despues }, sesion] = await Promise.all([searchParams, obtenerSesion()]);
  if (!sesion.clinico) notFound();

  const cursor = typeof despues === "string" ? despues.match(/^(\d{4}-\d{2}-\d{2})_([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i) : null;
  const dia = cursor?.[1];
  const fechaValida = dia && hoyCaracas(dia + "T12:00:00Z") === dia;
  const paginada = Boolean(fechaValida && cursor);
  const { data, error } = sesion.demo
    ? { data: [], error: null }
    : await (await crearClienteServidor()).rpc("listar_consultas_resultados_pendientes", {
      p_fecha: paginada ? dia : null,
      p_consulta: paginada ? cursor?.[2] : null,
    });
  const filas = ((data ?? []) as Fila[]).slice(0, TAMANO);
  const ultima = filas.at(-1);
  const siguiente = ultima && (data?.length ?? 0) > TAMANO ? RUTA + "?despues=" + ultima.fecha + "_" + ultima.id : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/panel" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Inicio
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Resultados por recibir</h1>
          <p className="text-muted-foreground">Exámenes pendientes de los últimos 60 días, desde los más antiguos.</p>
        </div>
        {sesion.rol !== "enfermeria" && !sesion.demo && <Button variant="outline" asChild>
          <Link href="/atencion/resultados-lote"><ScanText /> Resultados por lote</Link>
        </Button>}
      </div>

      <Card className="overflow-hidden py-0">
        {error ? (
          <p role="alert" className="p-5 text-sm text-alerta-texto">No se pudieron cargar las consultas pendientes. Vuelve a intentarlo.</p>
        ) : filas.length ? (
          <ul className="divide-y">
            {filas.map((f) => (
              <li key={f.id}>
                <Link href={"/atencion/" + f.id + "?paso=paraclinicos"} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{f.paciente}</p>
                    <p className="text-sm text-muted-foreground">{[f.empresa, fecha(f.fecha), ETIQUETA_ESTADO_CONSULTA[f.estado]].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-sm">
                    <span className="rounded-full bg-aviso/15 px-2.5 py-1 text-aviso-texto">{f.pendientes} pendiente{f.pendientes === 1 ? "" : "s"}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid justify-items-center gap-2 p-10 text-center text-muted-foreground">
            <FileSearch className="size-7" />
            <p>{paginada ? "No hay más consultas con resultados pendientes." : "No hay resultados pendientes en este período."}</p>
          </div>
        )}
      </Card>

      {(paginada || siguiente) && <div className="flex flex-wrap justify-between gap-2">
        {paginada && <Button variant="outline" asChild><Link href={RUTA}>Volver al inicio de la lista</Link></Button>}
        {siguiente && <Button variant="outline" asChild><Link href={siguiente}>Ver más consultas</Link></Button>}
      </div>}
    </div>
  );
}
