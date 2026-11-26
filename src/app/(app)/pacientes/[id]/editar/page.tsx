import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { COLUMNAS_FICHA_PERSONAL, puedeEditarFichaPersonal, type DatosFichaPersonal } from "@/lib/ficha-personal";
import { hoyCaracas } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EditarFichaPersonal } from "./formulario";

export const metadata = { title: "Editar datos personales" };

export default async function EditarFicha({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, sesion] = await Promise.all([params, obtenerSesion()]);
  if (sesion.demo || !sesion.orgId || !puedeEditarFichaPersonal(sesion.rol) ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("trabajadores").select(COLUMNAS_FICHA_PERSONAL)
    .eq("id", id).eq("org_id", sesion.orgId).maybeSingle();
  if (error) throw new Error("No se pudo leer la ficha personal.");
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/pacientes/${id}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Volver a la ficha
      </Link>
      <h1 className="text-2xl font-semibold">Editar datos personales</h1>
      <EditarFichaPersonal id={id} datos={data as unknown as DatosFichaPersonal} hoy={hoyCaracas()} />
    </div>
  );
}
