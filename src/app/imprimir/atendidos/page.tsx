import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listarEmpresas } from "@/lib/empresas";
import { listarAtenciones, obtenerCobro } from "@/lib/facturacion";
import { edad } from "@/lib/pacientes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../barra";
import { HojaRelacion } from "./tabla";
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

  const volver = cobro ? `/imprimir/factura/${cobro.id}` : "/facturacion?vista=atendidos";

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={volver} titulo={`Relación de pacientes · ${empresa?.razonSocial ?? "Todas las empresas"}`} envio={empresa && (sesion.clinico || sesion.rol === "administrador") ? { documento: "atendidos", empresaId: empresa.id, empresa: empresa.razonSocial } : null} />
      <HojaRelacion
        org={org}
        empresa={empresa?.razonSocial ?? "Todas las empresas"}
        desde={desde}
        hasta={hasta}
        cobro={cobro ? { numero: cobro.numero, factura: cobro.numeroFacturaFiscal } : null}
        filas={atenciones.map((a) => { const t = porTrab.get(a.trabajadorId); return { id: a.id, trabajador: a.paciente, cedula: a.cedula, edad: edad(t?.fecha_nacimiento ?? null, a.fecha), sexo: t?.sexo ?? null, cargo: a.cargo, telefono: t?.telefono ?? null, fecha: a.fecha, evaluacion: a.motivo, aptitud: a.aptitud }; })}
      />
    </div>
  );
}
