"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Cobro, ItemCobro, Servicio } from "@/lib/facturacion-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas, sumarDias } from "@/lib/fecha";

export type Resultado = { ok: boolean; mensaje: string };

async function contexto() {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "En modo demo no se guardan datos." } as const;
  if (!["administrador", "gerente_medico", "recepcion"].includes(sesion.rol ?? "")) return { error: "Tu rol no permite facturar." } as const;
  return { sesion, supabase: await crearClienteServidor() } as const;
}

export async function guardarServicio(s: Servicio): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!s.nombre.trim()) return { ok: false, mensaje: "Escribe el nombre del servicio." };
  const campos = {
    codigo: s.codigo || null,
    nombre: s.nombre.trim(),
    categoria: s.categoria,
    unidad: s.unidad,
    precio_usd: s.precioUsd || 0,
    motivos: s.motivos.trim().toUpperCase() || null,
    activo: s.activo,
  };
  const { error } = s.id
    ? await c.supabase.from("servicios").update(campos).eq("id", s.id)
    : await c.supabase.from("servicios").insert({ ...campos, org_id: c.sesion.orgId!, orden: 100 });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/facturacion");
  return { ok: true, mensaje: "Servicio guardado." };
}

export async function guardarTasa(fecha: string, tasa: number): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!(tasa > 0)) return { ok: false, mensaje: "Escribe una tasa válida." };
  const { error } = await c.supabase.from("tasas_bcv").upsert({ org_id: c.sesion.orgId!, fecha, tasa }, { onConflict: "org_id,fecha" });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/facturacion");
  return { ok: true, mensaje: "Tasa guardada." };
}

export async function crearCobro(datos: { empresaId: string; desde: string; hasta: string; tasaBcv: number | null; items: ItemCobro[] }): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const items = datos.items.filter((i) => i.descripcion.trim());
  if (!items.length) return { ok: false, mensaje: "Agrega al menos un renglón." };
  const { data, error } = await c.supabase
    .from("cobros")
    .insert({ org_id: c.sesion.orgId!, empresa_id: datos.empresaId, desde: datos.desde, hasta: datos.hasta, tasa_bcv: datos.tasaBcv })
    .select("id")
    .single();
  if (error) return { ok: false, mensaje: error.message };
  const { error: e2 } = await c.supabase.from("cobro_items").insert(
    items.map((i, k) => ({
      cobro_id: data.id,
      org_id: c.sesion.orgId!,
      servicio_id: i.servicioId,
      consulta_id: i.consultaId,
      descripcion: i.descripcion.trim(),
      detalle: i.detalle || null,
      cantidad: i.cantidad,
      precio_usd: i.precioUsd,
      orden: k,
    })),
  );
  if (e2) {
    await c.supabase.from("cobros").delete().eq("id", data.id);
    return { ok: false, mensaje: e2.code === "23505" ? "Alguna atención ya está en otra nota de cobro." : e2.message };
  }
  revalidatePath("/facturacion");
  redirect(`/facturacion/${data.id}`);
}

export async function actualizarCobro(cobro: Cobro): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { error } = await c.supabase
    .from("cobros")
    .update({
      estado: cobro.estado,
      tasa_bcv: cobro.tasaBcv,
      iva_pct: cobro.ivaPct,
      igtf_pct: cobro.igtfPct,
      observacion: cobro.observacion || null,
      numero_factura_fiscal: cobro.numeroFacturaFiscal || null,
      fecha_pago: cobro.fechaPago,
      vence: cobro.vence,
    })
    .eq("id", cobro.id);
  if (error) return { ok: false, mensaje: error.message };
  // En borrador se pueden ajustar los renglones
  if (cobro.estado === "borrador") {
    await c.supabase.from("cobro_items").delete().eq("cobro_id", cobro.id);
    const { error: e2 } = await c.supabase.from("cobro_items").insert(
      cobro.items.filter((i) => i.descripcion.trim()).map((i, k) => ({
        cobro_id: cobro.id,
        org_id: c.sesion.orgId!,
        servicio_id: i.servicioId,
        consulta_id: i.consultaId,
        descripcion: i.descripcion.trim(),
        detalle: i.detalle || null,
        cantidad: i.cantidad,
        precio_usd: i.precioUsd,
        orden: k,
      })),
    );
    if (e2) return { ok: false, mensaje: e2.message };
  }
  revalidatePath("/facturacion");
  return { ok: true, mensaje: "Guardado." };
}

export async function eliminarCobro(id: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { error } = await c.supabase.from("cobros").delete().eq("id", id).eq("estado", "borrador");
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/facturacion");
  redirect("/facturacion");
}

// Presupuesto nuevo (vacío) para una empresa; los servicios se agregan en el editor
export async function crearPresupuesto(empresaId: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!empresaId) return { ok: false, mensaje: "Elige la empresa arriba." };
  const vence = sumarDias(hoyCaracas(), 15);
  const { data, error } = await c.supabase.from("cobros").insert({ org_id: c.sesion.orgId!, empresa_id: empresaId, tipo: "presupuesto", vence }).select("id").single();
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/facturacion");
  redirect(`/facturacion/${data.id}`);
}

// Un presupuesto aprobado pasa a nota de cobro (borrador) con los mismos renglones
export async function convertirPresupuesto(id: string): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data: p } = await c.supabase.from("cobros").select("*, cobro_items(*)").eq("id", id).eq("tipo", "presupuesto").single();
  if (!p) return { ok: false, mensaje: "Presupuesto no encontrado." };
  const { data: nuevo, error } = await c.supabase.from("cobros")
    .insert({ org_id: p.org_id, empresa_id: p.empresa_id, tipo: "cobro", presupuesto_id: p.id, tasa_bcv: p.tasa_bcv, iva_pct: p.iva_pct, igtf_pct: p.igtf_pct, observacion: p.observacion })
    .select("id").single();
  if (error) return { ok: false, mensaje: error.message };
  const items = (p.cobro_items ?? []) as Record<string, unknown>[];
  if (items.length) {
    const { error: e2 } = await c.supabase.from("cobro_items").insert(items.map((i) => ({
      cobro_id: nuevo.id, org_id: p.org_id, servicio_id: i.servicio_id, descripcion: i.descripcion, detalle: i.detalle, cantidad: i.cantidad, precio_usd: i.precio_usd, orden: i.orden,
    })));
    if (e2) return { ok: false, mensaje: e2.message };
  }
  await c.supabase.from("cobros").update({ estado: "convertido" }).eq("id", id);
  revalidatePath("/facturacion");
  redirect(`/facturacion/${nuevo.id}`);
}
