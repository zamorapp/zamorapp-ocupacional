import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listarEmpresas } from "@/lib/empresas";
import { listarAtenciones, obtenerCobro } from "@/lib/facturacion";
import { edad, ETIQUETA_APTITUD, type Aptitud } from "@/lib/pacientes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../barra";
import { fechaCorta, Hoja, Marca, Titular } from "../componentes";
import { TablaRelacion } from "./tabla";
import { hoyCaracas } from "@/lib/fecha";

export const metadata: Metadata = { title: "Relación de pacientes atendidos" };
export const dynamic = "force-dynamic";
// «Enviar a la empresa» genera el PDF de esta página en el servidor
export const maxDuration = 60;

type Props = { searchParams: Promise<{ empresa?: string; desde?: string; hasta?: string; cobro?: string }> };


// Relación administrativa para acompañar la factura (Cesar, 12-nov-2026): una fila por trabajador con nombre, cédula,
// edad, sexo, cargo, teléfono, fecha, evaluación y resultado. Sin diagnósticos ni cuadros de morbilidad.
// Apaisada y con filas bajas para que entren 20 o más trabajadores por hoja en jornadas grandes.
// ?cobro=<id>: solo los trabajadores de esa nota de cobro (la que se facturó), con su Nº de factura.
export default async function Atendidos({ searchParams }: Props) {
  const q = await searchParams;
  const hoy = hoyCaracas();
  const sesion = await obtenerSesion();
  const cobro = q.cobro ? await obtenerCobro(q.cobro) : null;
  if (q.cobro && !cobro) notFound();
  const empresaId = cobro?.empresaId ?? q.empresa ?? null;
  const desde = cobro?.desde ?? q.desde ?? hoy.slice(0, 8) + "01";
  const hasta = cobro?.hasta ?? q.hasta ?? hoy;
  const enCobro = cobro ? new Set(cobro.items.map((i) => i.consultaId).filter(Boolean)) : null;
  const [todas, empresas] = await Promise.all([listarAtenciones(empresaId, desde, hasta), listarEmpresas(true)]);
  const atenciones = enCobro ? todas.filter((a) => enCobro.has(a.id)) : todas;
  const empresa = empresas.find((e) => e.id === empresaId);
  const supabase = await crearClienteServidor();
  const ids = [...new Set(atenciones.map((a) => a.trabajadorId))];
  const [{ data: org }, { data: trab }] = await Promise.all([
    sesion.orgId ? supabase.from("organizaciones").select("nombre, rif, logo, ajustes").eq("id", sesion.orgId).single() : Promise.resolve({ data: null }),
    ids.length ? supabase.from("trabajadores").select("id, sexo, fecha_nacimiento, telefono").in("id", ids) : Promise.resolve({ data: [] }),
  ]);
  const porTrab = new Map((trab ?? []).map((t) => [t.id as string, t as { sexo: string | null; fecha_nacimiento: string | null; telefono: string | null }]));

  // Totales por resultado: lo que la empresa quiere saber de un vistazo
  const porResultado = new Map<string, number>();
  for (const a of atenciones) {
    const r = a.aptitud ? ETIQUETA_APTITUD[a.aptitud as Aptitud] : "Sin resultado";
    porResultado.set(r, (porResultado.get(r) ?? 0) + 1);
  }
  const volver = cobro ? `/imprimir/factura/${cobro.id}` : "/facturacion?vista=atendidos";

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={volver} titulo={`Relación de pacientes · ${empresa?.razonSocial ?? "Todas las empresas"}`} envio={empresa && (sesion.clinico || sesion.rol === "administrador") ? { documento: "atendidos", empresaId: empresa.id, empresa: empresa.razonSocial } : null} />
      <Hoja horizontal>
        <header className="mb-3 flex items-start justify-between gap-4 border-b-2 border-teal-700 pb-2">
          <div className="flex items-center gap-3">
            <Marca logo={org?.logo as string | null | undefined} nombre={org?.nombre ?? ""} />
            <div>
              <div className="text-base font-bold uppercase text-teal-800">{org?.nombre}</div>
              <Titular ajustes={org?.ajustes} />
              <div className="text-[10.5px] text-neutral-600">{org?.rif && `RIF ${org.rif}`}</div>
            </div>
          </div>
          <div className="text-right text-[12px]">
            <div className="font-bold uppercase">Relación de pacientes atendidos</div>
            <div>{empresa?.razonSocial ?? "Todas las empresas"}</div>
            <div className="text-[10.5px] text-neutral-600">
              Del {fechaCorta(desde)} al {fechaCorta(hasta)}
              {cobro && ` · Nota de cobro Nº ${cobro.numero}${cobro.numeroFacturaFiscal ? ` · Factura Nº ${cobro.numeroFacturaFiscal}` : ""}`}
            </div>
          </div>
        </header>

        <p className="mb-2 text-[11px]">
          <b>{atenciones.length}</b> {atenciones.length === 1 ? "trabajador evaluado" : "trabajadores evaluados"}
          {porResultado.size > 0 && ` · ${[...porResultado.entries()].map(([r, n]) => `${r}: ${n}`).join(" · ")}`}
        </p>

        <TablaRelacion filas={atenciones.map((a) => { const t = porTrab.get(a.trabajadorId); return { id: a.id, trabajador: a.paciente, cedula: a.cedula, edad: edad(t?.fecha_nacimiento ?? null, a.fecha), sexo: t?.sexo ?? null, cargo: a.cargo, telefono: t?.telefono ?? null, fecha: a.fecha, evaluacion: a.motivo, aptitud: a.aptitud }; })} />
        {atenciones.length === 0 && <p className="mt-6 text-center text-neutral-500">Sin pacientes atendidos en el período.</p>}
        <p className="mt-4 text-[10px] italic text-neutral-600">Documento administrativo: no contiene diagnósticos ni datos clínicos.</p>
      </Hoja>
    </div>
  );
}
