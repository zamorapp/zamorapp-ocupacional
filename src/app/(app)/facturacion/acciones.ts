"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Cobro, ItemCobro, Servicio } from "@/lib/facturacion-tipos";
import { limpiarNumeroFactura } from "@/lib/facturacion-tipos";
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
  if (!(tasa > 0) || tasa >= 10_000_000) return { ok: false, mensaje: "Escribe una tasa válida." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, mensaje: "Fecha no válida." };
  // Cordura: si se aleja más de 30 % de la tasa conocida más cercana, casi seguro está mal escrita (06-nov: «896.1225»
  // quedó en 8.961.225). Se avisa con la cifra leída para que la corrija.
  const [{ data: antes }, { data: despues }] = await Promise.all([
    c.supabase.from("tasas_bcv").select("tasa").lt("fecha", fecha).order("fecha", { ascending: false }).limit(1).maybeSingle(),
    c.supabase.from("tasas_bcv").select("tasa").gt("fecha", fecha).order("fecha").limit(1).maybeSingle(),
  ]);
  const ref = Number(antes?.tasa ?? despues?.tasa ?? 0);
  const cifra = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 4 });
  if (ref > 0 && (tasa > ref * 1.3 || tasa < ref * 0.7))
    return { ok: false, mensaje: `Se leyó ${cifra(tasa)} y la tasa conocida más cercana es ${cifra(ref)}. Revisa la cifra (usa coma para los decimales: 896,1225).` };
  // Escrita a mano: manda sobre la automática (el latido nunca pisa una tasa «manual»)
  const { error } = await c.supabase.from("tasas_bcv").upsert({ org_id: c.sesion.orgId!, fecha, tasa, fuente: "manual" }, { onConflict: "org_id,fecha" });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/facturacion");
  return { ok: true, mensaje: "Tasa guardada." };
}

// siguiente: "factura" (desde «¿Quieres facturar este período?») abre de una vez la factura del talonario
export async function crearCobro(datos: { empresaId: string; desde: string; hasta: string; tasaBcv: number | null; items: ItemCobro[] }, siguiente: "nota" | "factura" = "nota"): Promise<Resultado> {
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
  redirect(siguiente === "factura" ? `/imprimir/factura/${data.id}` : `/facturacion/${data.id}`);
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

// Factura que no cabe en una hoja del talonario: la nota se divide en dos notas de cobro, cada una con sus renglones y su
// propio total (la segunda NO es continuación de la primera). Los renglones `mover` pasan a una nota nueva con la misma
// empresa, período, tasa e impuestos. Solo si la nota aún no tiene Nº de factura y no está pagada ni anulada: así el
// registro de facturas queda igual que el papel. La nota nueva toma el siguiente Nº del talonario al imprimirla.
export async function dividirCobro(id: string, mover: string[]): Promise<Resultado & { nuevoId?: string; numero?: number }> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const { data: n } = await c.supabase.from("cobros").select("*, cobro_items(id)").eq("id", id).eq("tipo", "cobro").maybeSingle();
  if (!n) return { ok: false, mensaje: "Nota de cobro no encontrada." };
  if (n.estado === "pagada" || n.estado === "anulada") return { ok: false, mensaje: "Una nota pagada o anulada no se divide." };
  if (n.numero_factura_fiscal) return { ok: false, mensaje: `Esta nota ya tiene la factura Nº ${n.numero_factura_fiscal}. Quita el número para dividirla.` };
  const propios = new Set(((n.cobro_items ?? []) as { id: string }[]).map((i) => i.id));
  const ids = [...new Set(mover)].filter((i) => propios.has(i));
  if (!ids.length || ids.length !== new Set(mover).size || ids.length >= propios.size) return { ok: false, mensaje: "No se pudo dividir: los renglones cambiaron. Recarga la página." };
  const { data: nueva, error } = await c.supabase.from("cobros")
    .insert({ org_id: n.org_id, empresa_id: n.empresa_id, tipo: "cobro", estado: n.estado, fecha: n.fecha, desde: n.desde, hasta: n.hasta, tasa_bcv: n.tasa_bcv, iva_pct: n.iva_pct, igtf_pct: n.igtf_pct, observacion: n.observacion, vence: n.vence, presupuesto_id: n.presupuesto_id })
    .select("id, numero").single();
  if (error) return { ok: false, mensaje: error.message };
  const { data: movidos, error: e2 } = await c.supabase.from("cobro_items").update({ cobro_id: nueva.id }).in("id", ids).eq("cobro_id", id).select("id");
  if (e2 || movidos?.length !== ids.length) {
    // Sin renglones a medias: si no se movieron todos, se regresan y se borra la nota nueva
    await c.supabase.from("cobro_items").update({ cobro_id: id }).eq("cobro_id", nueva.id);
    const { error: e3 } = await c.supabase.from("cobros").delete().eq("id", nueva.id);
    const motivo = e2?.message ?? "No se pudo dividir: tu rol no puede mover los renglones.";
    return { ok: false, mensaje: e3 ? `${motivo} Quedó una nota vacía #${nueva.numero}: anúlala.` : motivo };
  }
  revalidatePath("/facturacion");
  return { ok: true, mensaje: `Dividida: los últimos ${ids.length} renglones pasaron a la nota de cobro #${nueva.numero}.`, nuevoId: nueva.id as string, numero: nueva.numero as number };
}

// Nº de la factura de forma libre (talonario de imprenta autorizada): se escribe al imprimir y queda en la nota de cobro.
// Solo dígitos y guiones (p. ej. 000123 o 00-000123); vacío lo quita. Avisa si ese número ya está en otra nota.
// La factura se imprime con la tasa BCV de su fecha de emisión: se anota en la nota de cobro para que el registro y lo
// impreso digan lo mismo (el cambio queda en la bitácora por bit_cobros).
export async function guardarTasaCobro(id: string, tasa: number): Promise<Resultado> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (!(tasa > 0) || tasa >= 10_000_000) return { ok: false, mensaje: "Escribe una tasa válida." };
  // Nunca en una nota pagada (su tasa es la del pago) ni anulada
  const { data: filas, error } = await c.supabase.from("cobros").update({ tasa_bcv: tasa }).eq("id", id).not("estado", "in", "(pagada,anulada)").select("id");
  if (error) return { ok: false, mensaje: error.message };
  if (!filas?.length) return { ok: false, mensaje: "No se guardó la tasa: la nota está pagada o anulada, no existe o tu rol no puede cambiarla." };
  revalidatePath("/facturacion");
  return { ok: true, mensaje: "Tasa anotada en la nota de cobro." };
}

export async function guardarNumeroFactura(id: string, numero: string): Promise<Resultado & { numero?: string }> {
  const c = await contexto();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const n = limpiarNumeroFactura(numero);
  if (n && !/^[0-9A-Za-z-]{1,20}$/.test(n)) return { ok: false, mensaje: "Usa solo números (y guiones si tu talonario los lleva)." };
  if (n) {
    const { data: otra } = await c.supabase.from("cobros").select("numero").eq("numero_factura_fiscal", n).neq("id", id).limit(1).maybeSingle();
    if (otra) return { ok: false, mensaje: `La factura Nº ${n} ya está en la nota de cobro #${otra.numero}.` };
  }
  // El cambio (número anterior y nuevo) queda en la bitácora por el disparador bit_cobros (antes/despues completos)
  const { data: filas, error } = await c.supabase.from("cobros").update({ numero_factura_fiscal: n || null }).eq("id", id).eq("tipo", "cobro").select("id");
  if (error) return { ok: false, mensaje: error.message };
  // Con RLS un update sin permiso no falla: simplemente no toca filas
  if (!filas?.length) return { ok: false, mensaje: "No se guardó el número: la nota no existe o tu rol no puede cambiarla." };
  revalidatePath("/facturacion");
  return { ok: true, mensaje: n ? `Factura Nº ${n} guardada en la nota de cobro.` : "Número quitado.", numero: n };
}
