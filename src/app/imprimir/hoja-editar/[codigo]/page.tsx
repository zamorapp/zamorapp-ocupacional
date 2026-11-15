import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { documentoDePrueba } from "@/lib/documentos-prueba";
import { escribirCambios, leerCambios } from "@/lib/cambios-hoja";
import { hojaEditable } from "@/lib/hojas-version";
import { versionesHojas } from "@/lib/hojas-version-servidor";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { PlanAlimentacion } from "../../indicaciones";
import { Bienestar } from "../../bienestar";
import { BarraVersion } from "./barra-version";

export const metadata: Metadata = { title: "Editar hoja para el paciente" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ codigo: string }>; searchParams: Promise<{ c?: string }> };

// Leer y editar una hoja para el paciente y guardarla como versión del servicio. Los cambios viajan en ?c= mientras
// se edita (igual que en la consulta); «Guardar como mi versión» los deja en la base.
export default async function EditarHoja({ params, searchParams }: Props) {
  const [{ codigo }, { c }] = await Promise.all([params, searchParams]);
  const h = hojaEditable(codigo);
  const sesion = await obtenerSesion();
  if (!h || sesion.demo || !sesion.orgId) notFound();
  const versiones = await versionesHojas(await crearClienteServidor());
  const guardada = escribirCambios(versiones[codigo] ?? {});
  // Sin ?c= se abre con la versión guardada: así cada cambio nuevo se suma a ella y no la reemplaza
  if (c === undefined && guardada) redirect(`/imprimir/hoja-editar/${codigo}?c=${guardada}`);
  const cambios = leerCambios(c);
  const d = documentoDePrueba("normal");
  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraVersion codigo={codigo} nombre={h.nombre} guardada={guardada} puedeGuardar={["administrador", "gerente_medico"].includes(sesion.rol ?? "")} />
      {h.tipo === "dieta"
        ? <PlanAlimentacion d={d} dieta={h.clave} planes={[]} cambios={cambios} />
        : <Bienestar d={d} temas={[h.clave]} cambios={cambios} />}
    </div>
  );
}
