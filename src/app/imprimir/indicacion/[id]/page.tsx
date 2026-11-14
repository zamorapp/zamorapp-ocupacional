import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { datosDeMedico, datosDeOrg, type AjustesDocumentos, type DatosDocumento } from "@/lib/documentos";
import { obtenerIndicacion } from "@/lib/indicaciones-datos";
import { faltantesMedicinas, textoFalta } from "@/lib/recipe";
import { ahora } from "@/lib/fecha";
import { BarraImpresion } from "../../barra";
import type { DatosHojaRecipe } from "../../documentos";
import { HojaIndicacion } from "../hoja";

export const metadata: Metadata = { title: "Indicación o récipe" };
export const dynamic = "force-dynamic";

// Indicación de enfermería o récipe emitido SIN consulta (Cesar, 10-nov). Mismo formato del récipe de la consulta
// (Res. MPPS 028/031): membrete, médico, paciente, firma y sello. La orden a enfermería lleva la casilla de cumplimiento.
export default async function ImprimirIndicacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !sesion.clinico || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const x = await obtenerIndicacion(id);
  if (!x) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: medico }, { data: t }] = await Promise.all([
    datosDeOrg(x.orgId),
    x.medicoId ? datosDeMedico(x.medicoId) : Promise.resolve({ data: null }),
    supabase.from("trabajadores").select("nombres, apellidos, cedula, fecha_nacimiento").eq("id", x.trabajadorId).single(),
  ]);
  if (!t) notFound();

  const d: DatosHojaRecipe & { impreso: { por: string; el: string } } = {
    org: { ...(org ?? { nombre: "", rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    medicoDatos: medico as DatosDocumento["medicoDatos"],
    sin: [],
    datos: { fecha: x.fecha },
    trabajador: { nombre: `${t.nombres} ${t.apellidos}`, cedula: t.cedula },
    extra: { fecha_nacimiento: t.fecha_nacimiento },
    impreso: { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(ahora())) },
  };
  const meds = x.tratamiento.filter((m) => m.medicina?.trim());
  const volver = `/pacientes/${x.trabajadorId}`;
  const titulo = x.tipo === "recipe" ? "Récipe" : x.tipo === "examenes" ? "Orden de exámenes" : "Orden de enfermería";

  // Lo que pide la Res. MPPS 028 al récipe: si falta, se dice qué y dónde se completa (nunca una hoja incompleta)
  const faltan: { texto: string; href: string | null }[] = [];
  if (x.tipo === "recipe") {
    const m = d.medicoDatos;
    if (!m?.nombre_completo || !m?.cedula || !m?.mpps) faltan.push({ texto: "nombre, cédula o Nº MPPS del médico", href: "/configuracion/perfil" });
    if (!d.org.nombre || !d.org.direccion || !d.org.rif) faltan.push({ texto: "nombre, dirección o RIF del centro", href: "/configuracion/organizacion" });
    if (!t.fecha_nacimiento) faltan.push({ texto: "fecha de nacimiento del paciente", href: volver });
    for (const f of faltantesMedicinas(meds)) faltan.push({ texto: textoFalta(f), href: null });
  }

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={volver} titulo={`${titulo} · ${d.trabajador.nombre}`} bloqueado={x.estado === "anulada" || faltan.length > 0} />
      {x.estado === "anulada" ? (
        <Aviso titulo="Esta indicación está anulada">{x.motivoAnulacion ? `Motivo: ${x.motivoAnulacion}. ` : ""}Emite una nueva desde la ficha del paciente.</Aviso>
      ) : faltan.length > 0 ? (
        <Aviso titulo="Para imprimir el récipe falta">
          <ul className="mt-1 list-disc pl-5">
            {faltan.map((f, i) => <li key={i}>{f.texto}{f.href && <> · <Link href={f.href} className="font-medium text-[#0b5d52] underline">Completar</Link></>}</li>)}
          </ul>
        </Aviso>
      ) : (
        <HojaIndicacion d={d} x={x} />
      )}
    </div>
  );
}

// Colores fijos de papel: la hoja es blanca también en tema oscuro (regla de las hojas de imprimir)
function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-white p-4 text-sm text-neutral-900 print:hidden">
      <p className="font-semibold text-red-700">{titulo}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
