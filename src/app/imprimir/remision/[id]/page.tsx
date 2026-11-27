import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerDocumento } from "@/lib/documentos";
import { ZONA } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { Bloque, Ficha, Hoja, Membrete, Pie } from "../../componentes";

export const metadata: Metadata = { title: "Orden para prestador" };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const [sesion, { id }] = await Promise.all([obtenerSesion(), params]);
  if (sesion.demo || !sesion.clinico || sesion.rol === "enfermeria" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) notFound();

  const { data } = await (await crearClienteServidor()).rpc("listar_remisiones_examenes", { p_remision: id }).maybeSingle();
  const remision = data as { consulta_id: string; prestador: string; creada_en: string; examenes: { id: string; nombre: string }[] } | null;
  if (!remision) notFound();
  const d = await obtenerDocumento(remision.consulta_id);
  if (!d) notFound();

  const fecha = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeZone: ZONA }).format(new Date(remision.creada_en));

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={"/atencion/" + remision.consulta_id + "/remisiones"} titulo="Orden para prestador" />
      <Hoja>
        <Membrete d={d} sinEmpresa />
        <h1 className="my-5 text-2xl font-extrabold">Orden para prestador</h1>
        <Ficha celdas={[
          { k: "Prestador", v: remision.prestador, ancho: 2 },
          { k: "Fecha", v: fecha },
          { k: "Referencia", v: id.slice(0, 8).toUpperCase() },
          { k: "Paciente", v: d.trabajador.nombre, ancho: 2 },
          { k: "Cédula", v: d.trabajador.cedula, ancho: 2 },
        ]} />
        <Bloque titulo="Exámenes solicitados">
          <ul className="list-disc space-y-1 pl-5">
            {remision.examenes.map((e) => <li key={e.id}>{e.nombre}</li>)}
          </ul>
        </Bloque>
        <Pie d={d} />
      </Hoja>
    </div>
  );
}
