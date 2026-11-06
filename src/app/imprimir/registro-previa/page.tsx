import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronRight, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ahora, hoyCaracas } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { docsElegidos, filasRegistro, remitente, type EleccionRegistro, type VistaRegistro } from "@/lib/registro-documentos";
import { armarDocumentosRegistro, puedeFirmarRegistro } from "@/lib/registro-documentos-servidor";
import { HojasRegistro } from "@/app/registro/hojas";

export const metadata: Metadata = { title: "Vista previa del enlace" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ nombre?: string; empresa?: string; perfil?: string; motivo?: string; ta?: string; dieta?: string; bienestar?: string; tema?: string; firma?: string }> };
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

// Vista previa de «Enlace al paciente»: la pantalla final que verá el paciente y cada hoja, con un paciente de ejemplo.
// Arma lo elegido con la misma función que «Crear enlace»: lo que se ve aquí es lo que se envía.
export default async function VistaPreviaRegistro({ searchParams }: Props) {
  const q = await searchParams;
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !sesion.rol) notFound();
  const supabase = await crearClienteServidor();
  const eleccion: EleccionRegistro = {
    orden: uuid(q.perfil) ? { perfilId: q.perfil!, motivoId: uuid(q.motivo) } : null,
    controlTa: q.ta === "14" ? 14 : q.ta === "7" ? 7 : null,
    dieta: q.dieta && /^[a-z_-]{1,30}$/.test(q.dieta) ? q.dieta : null,
    bienestar: q.bienestar === "1",
    firma: q.firma === "1",
  };
  const documentos = await armarDocumentosRegistro(supabase, sesion, eleccion);
  const firma = typeof documentos !== "string" && Boolean(documentos.firma);
  const empresaId = uuid(q.empresa);
  const motivoId = typeof documentos !== "string" ? documentos.orden?.motivo_id : undefined;
  const [{ data: org }, { data: empresa }, { data: motivo }, { data: medico }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, logo, ajustes").eq("id", sesion.orgId).single(),
    empresaId ? supabase.from("empresas").select("razon_social, rif, logo, proyecto").eq("id", empresaId).maybeSingle() : Promise.resolve({ data: null }),
    motivoId ? supabase.from("lista_items").select("nombre, codigo, grupo").eq("id", motivoId).maybeSingle() : Promise.resolve({ data: null }),
    firma && puedeFirmarRegistro(sesion)
      ? supabase.from("perfiles").select("nombre_completo, cedula, mpps, colegio_medicos, registro_inpsasel, especialidad").eq("id", sesion.usuarioId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const nombre = q.nombre?.trim().slice(0, 120) || "Nombre del paciente";
  const [nombres, ...resto] = nombre.split(/\s+/);

  const error = typeof documentos === "string" ? documentos : !docsElegidos(documentos).length ? "Marca al menos un documento para ver cómo le llega." : null;
  const v: VistaRegistro | null = error || typeof documentos === "string" || !org ? null : {
    folio: "00000000-0000-4000-8000-000000000000",
    recibido: new Date(ahora()).toISOString(),
    documentos,
    persona: { cedula: "V-00000000", nombres, apellidos: resto.join(" ") || "Apellido", cargo: "Cargo", tipo: empresa ? "empresa" : "particular" },
    org: { ...org, ajustes: org.ajustes ?? {} },
    empresa: empresa as VistaRegistro["empresa"],
    motivo: motivo as VistaRegistro["motivo"],
    medico: medico as VistaRegistro["medico"],
    firmado: Boolean(medico),
  };
  // Un tema de bienestar suelto (desde «Hojas para el paciente»)
  if (v?.documentos.bienestar && q.tema && /^[a-z_-]{1,30}$/.test(q.tema)) v.documentos.bienestar = { tema: [q.tema] };
  const hoy = hoyCaracas();

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <div className="sticky top-0 z-10 mb-6 border-b bg-background/95 px-4 py-3 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[216mm] flex-wrap items-center gap-3">
          <Button variant="ghost" asChild><Link href="/atencion/hojas"><ArrowLeft /> Hojas para el paciente</Link></Button>
          <span className="flex min-w-0 flex-1 items-center gap-2 font-medium"><Eye className="size-4 text-primary" /> Vista previa: así le llega a {nombre}</span>
        </div>
        <p className="mx-auto mt-1 max-w-[216mm] text-xs text-muted-foreground">Con datos de ejemplo: el paciente verá su nombre, cédula y empresa. Cierra esta pestaña para volver.</p>
      </div>
      {!v ? (
        <p className="mx-auto max-w-md rounded-lg border bg-card p-5 text-center text-sm">{error ?? "No se pudo armar la vista previa."}</p>
      ) : (
        <>
          {/* La marca de agua se repite en cada hoja impresa: una muestra impresa nunca parece una orden real */}
          {/* Pantalla del celular del paciente al terminar */}
          <section className="mx-auto mb-8 w-full max-w-sm space-y-4 rounded-[2rem] border-8 border-neutral-800 bg-card p-5 shadow-lg print:hidden" aria-label="Pantalla del paciente">
            <div className="space-y-1 text-center">
              <CheckCircle2 className="mx-auto size-10 text-ok" />
              <p className="text-lg font-semibold">¡Listo, {nombres}!</p>
              <p className="text-sm text-muted-foreground">Puedes descargar lo que te envía <b className="text-foreground">{remitente(v)}</b>.</p>
            </div>
            <ul className="space-y-2">
              {filasRegistro(v.documentos).map((f) => (
                <li key={f.parte ?? f.tipo} className="flex min-h-12 items-center gap-3 rounded-xl border bg-background px-3 py-2 text-sm font-medium">
                  <FileText className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">{f.nombre}{f.detalle && <span className="block text-xs font-normal text-muted-foreground">{f.detalle}</span>}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </li>
              ))}
            </ul>
          </section>
          <div className="relative">
            <div aria-hidden className="pointer-events-none fixed inset-0 z-[5] flex items-center justify-center">
              <span className="-rotate-30 select-none text-center text-[12vw] font-black leading-none tracking-widest text-neutral-900/[.12] print:text-[96px]">MUESTRA<span className="block text-[4vw] print:text-[28px]">vista previa · sin validez</span></span>
            </div>
            {docsElegidos(v.documentos).map((t) => <HojasRegistro key={t} v={v} tipo={t} hoy={hoy} />)}
          </div>
        </>
      )}
    </div>
  );
}
