import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerCobro, tasasBcv } from "@/lib/facturacion";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { siguienteNumero } from "@/lib/facturacion-tipos";
import { FacturaFormaLibre } from "./factura-forma-libre";
import { CONDICION_PAGO_BCV } from "@/lib/mensajes";

export const metadata: Metadata = { title: "Factura" };
export const dynamic = "force-dynamic";

// Factura sobre el talonario de forma libre: SIN membrete (ya viene impreso). Solo número, cliente, renglones y totales.
export default async function ImprimirFactura({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, sesion] = await Promise.all([obtenerCobro(id), obtenerSesion()]);
  if (!c || !sesion.orgId || c.tipo !== "cobro") notFound();
  const supabase = await crearClienteServidor();
  const [{ data: emp }, { data: previas }, { data: org }, tasas] = await Promise.all([
    supabase.from("empresas").select("direccion, telefono").eq("id", c.empresaId).single(),
    // Para proponer el siguiente número del talonario
    supabase.from("cobros").select("numero_factura_fiscal").not("numero_factura_fiscal", "is", null).order("numero", { ascending: false }).limit(200),
    // Datos para el pago propios de la factura (Configuración › Organización › Documentos)
    supabase.from("organizaciones").select("ajustes").eq("id", sesion.orgId).maybeSingle(),
    // Tasas BCV para que la factura tome la de su fecha de emisión (aunque se mueva la fecha unas semanas)
    tasasBcv(sumarDias(c.fecha, -40)),
  ]);
  const editable = !sesion.demo && ["administrador", "gerente_medico", "recepcion"].includes(sesion.rol ?? "");
  return (
    <FacturaFormaLibre
      cobro={c}
      direccion={(emp?.direccion as string | null) ?? ""}
      telefono={(emp?.telefono as string | null) ?? ""}
      sugerido={c.numeroFacturaFiscal ? "" : siguienteNumero((previas ?? []).map((p) => p.numero_factura_fiscal as string))}
      editable={editable}
      tasas={tasas}
      hoy={hoyCaracas()}
      relacion={c.items.some((i) => i.consultaId) ? `/imprimir/atendidos?cobro=${c.id}` : null}
      datosPago={String((org?.ajustes as { factura_datos_pago?: string | null } | null)?.factura_datos_pago ?? "").trim()}
      // La misma condición de pago de la nota de cobro (Configuración › Organización › Documentos); vacío = no se imprime
      condiciones={String((org?.ajustes as { cobro_condiciones?: string | null } | null)?.cobro_condiciones ?? CONDICION_PAGO_BCV).trim()}
    />
  );
}
