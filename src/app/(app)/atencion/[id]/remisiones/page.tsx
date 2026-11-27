import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { obtenerConsulta } from "@/lib/consultas";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AltaRemision, MovimientosRemision, type Remision } from "./remisiones";

export const metadata: Metadata = { title: "Remisiones a prestadores" };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const [sesion, { id }] = await Promise.all([obtenerSesion(), params]);
  if (sesion.demo || !sesion.clinico || sesion.rol === "enfermeria") notFound();
  const consulta = await obtenerConsulta(id);
  if (!consulta) notFound();
  const { data, error } = await (await crearClienteServidor()).rpc("listar_remisiones_examenes", { p_consulta: id });
  const examenes = consulta.datos.paraclinicos.map(({ id: examenId, nombre }) => ({ id: examenId, nombre }));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={"/atencion/" + id + "?paso=paraclinicos"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Paraclínicos
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Remisiones a prestadores</h1>
        <p className="text-muted-foreground">{consulta.trabajador.nombre}</p>
      </div>
      {error ? <p role="alert" className="text-alerta-texto">{error.code === "offline" ? "Las remisiones a prestadores requieren internet." : "No se pudieron cargar las remisiones."}</p> : (
        <>
          {consulta.datos.estado === "borrador"
            ? <p className="text-sm text-muted-foreground">Cierra la consulta para preparar una remisión.</p>
            : examenes.length > 0 && <AltaRemision consulta={id} examenes={examenes} />}
          {(data as Remision[] ?? []).map((r) => <MovimientosRemision key={r.id} consulta={id} remision={r} />)}
        </>
      )}
    </div>
  );
}
