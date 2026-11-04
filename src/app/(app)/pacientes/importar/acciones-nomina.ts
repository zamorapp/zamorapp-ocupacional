"use server";

import { revalidatePath } from "next/cache";
import { invalidarEmpresas } from "@/lib/empresas";
import { olvidar } from "@/lib/memo";
import { resolverCatalogos, resolverTiposPaciente } from "@/lib/catalogos-trabajador";
import { claveCedula } from "@/lib/depurar";
import { hoyCaracas } from "@/lib/fecha";
import { type Actual, type CampoNomina, type FilaNomina, planNomina } from "@/lib/nomina";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Actualizar la nómina con la plantilla de RR. HH. (Cesar, 04-nov-2026). Solo administrador y personal de salud;
// la base lo vuelve a exigir (aplicar_nomina) y solo en las empresas que el usuario ve.

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;
type R<T = object> = { ok: boolean; mensaje: string } & Partial<T>;

const UUID = /^[0-9a-f-]{36}$/i;
const COLS = `id, cedula, estado, empresa_id, nombres, apellidos, sexo, fecha_nacimiento, fecha_ingreso, turno, telefono, correo, direccion, ficha,
  empresas(razon_social), puestos(nombre), dependencias(nombre), tipo:lista_items(nombre)`;
type FilaBD = {
  id: string; cedula: string; estado: string; empresa_id: string; nombres: string; apellidos: string; sexo: string | null;
  fecha_nacimiento: string | null; fecha_ingreso: string | null; turno: string | null; telefono: string | null; correo: string | null;
  direccion: string | null; ficha: string | null; empresas: { razon_social: string } | null; puestos: { nombre: string } | null;
  dependencias: { nombre: string } | null; tipo: { nombre: string } | null;
};

const aActual = (t: FilaBD): Actual => ({
  id: t.id, cedula: t.cedula, estado: t.estado, empresaId: t.empresa_id, empresa: t.empresas?.razon_social ?? "",
  nombres: t.nombres ?? "", apellidos: t.apellidos ?? "", sexo: t.sexo ?? "", fechaNacimiento: t.fecha_nacimiento ?? "",
  fechaIngreso: t.fecha_ingreso ?? "", cargo: t.puestos?.nombre ?? "", dependencia: t.dependencias?.nombre ?? "", turno: t.turno ?? "",
  tipo: t.tipo?.nombre ?? "", telefono: t.telefono ?? "", correo: t.correo ?? "", direccion: t.direccion ?? "", ficha: t.ficha ?? "",
});

async function permiso(): Promise<{ error: string } | { orgId: string }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { error: "Conecta Supabase para actualizar la nómina." };
  if (!(sesion.clinico || sesion.rol === "administrador")) return { error: "Solo el administrador o el personal de salud actualizan la nómina." };
  return { orgId: sesion.orgId };
}

// Los de la empresa que están en la nómina (activo, reposo, aspirante), de 1.000 en 1.000
async function enNomina(supabase: Supabase, empresaId: string, cedulas?: string[]): Promise<Actual[]> {
  const salida: Actual[] = [];
  for (let d = 0; ; d += 1000) {
    let q = supabase.from("trabajadores").select(COLS).eq("empresa_id", empresaId).in("estado", ["activo", "reposo", "aspirante"]).order("id").range(d, d + 999);
    if (cedulas) q = q.in("cedula", cedulas);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    salida.push(...((data ?? []) as unknown as FilaBD[]).map(aActual));
    if (!data || data.length < 1000) return salida;
  }
}

// Las mismas cédulas en otra empresa o fuera de la nómina: van a «Revisar» (pasar o reingresar es decisión de Cesar)
async function fueraDeNomina(supabase: Supabase, empresaId: string, cedulas: string[]): Promise<Actual[]> {
  const partes: string[][] = [];
  for (let i = 0; i < cedulas.length; i += 300) partes.push(cedulas.slice(i, i + 300));
  const salida: Actual[] = [];
  // De cinco en cinco pedidos a la vez: una nómina de 1.000 personas son 7 pedidos cortos
  for (let i = 0; i < partes.length; i += 5) {
    const r = await Promise.all(partes.slice(i, i + 5).map((parte) => supabase.from("trabajadores").select(COLS).in("cedula", parte)));
    for (const { data, error } of r) {
      if (error) throw new Error(error.message);
      for (const t of (data ?? []) as unknown as FilaBD[]) {
        if (t.empresa_id === empresaId && ["activo", "reposo", "aspirante"].includes(t.estado)) continue;
        salida.push(aActual(t));
      }
    }
  }
  return salida;
}

// La cédula se guarda como la escribió la base (V-123…); la planilla puede traerla de otra forma
const variantes = (filas: Pick<FilaNomina, "cedula">[]) => [...new Set(filas.flatMap((f) => {
  const k = claveCedula(f.cedula);
  return k ? [`${k[0]}-${k.slice(1)}`, k.slice(1)] : [];
}))];

export type DatosNomina = { actuales: Actual[]; otros: Actual[]; turnos: string[] };

/** Lo que la pantalla necesita para armar la vista previa de la planilla subida. */
export async function datosNomina(empresaId: string, cedulas: string[]): Promise<R<DatosNomina>> {
  const p = await permiso();
  if ("error" in p) return { ok: false, mensaje: p.error };
  if (!UUID.test(empresaId)) return { ok: false, mensaje: "Elige la empresa." };
  const supabase = await crearClienteServidor();
  try {
    const [actuales, otros, { data: turnos }] = await Promise.all([
      enNomina(supabase, empresaId),
      fueraDeNomina(supabase, empresaId, variantes(cedulas.slice(0, 10000).map((cedula) => ({ cedula })))),
      supabase.from("lista_items").select("nombre").eq("org_id", p.orgId).eq("lista", "turno").eq("activo", true),
    ]);
    return { ok: true, mensaje: "", actuales, otros, turnos: (turnos ?? []).map((t) => t.nombre) };
  } catch (e) {
    return { ok: false, mensaje: "No se pudo leer la nómina actual: " + (e as Error).message };
  }
}

export type Opciones = { identidad: boolean; excluir: string[] };
export type Parte = { lote: string; cambios: number; nuevos: number; inactivados: number };

const COLUMNA: Record<Exclude<CampoNomina, "cargo" | "dependencia" | "tipo">, string> = {
  apellidos: "apellidos", nombres: "nombres", sexo: "sexo", fechaNacimiento: "fecha_nacimiento", fechaIngreso: "fecha_ingreso",
  turno: "turno", telefono: "telefono", correo: "correo", direccion: "direccion", ficha: "ficha",
};

/**
 * Aplica una parte de la planilla (la pantalla la manda de a pedazos para no pasar los 8 s de la nube). El servidor
 * vuelve a comparar esas filas con la base: solo se escribe lo que la vista previa mostró, nunca lo que mande el navegador.
 */
export async function aplicarParteNomina(
  empresaId: string, lote: string | null, archivo: string, filas: FilaNomina[], opciones: Opciones, inactivar: string[], motivo: string,
): Promise<R<{ parte: Parte }>> {
  const p = await permiso();
  if ("error" in p) return { ok: false, mensaje: p.error };
  if (!UUID.test(empresaId) || (lote && !UUID.test(lote))) return { ok: false, mensaje: "Datos no válidos." };
  if (filas.length > 250 || inactivar.length > 500) return { ok: false, mensaje: "Parte demasiado grande." };
  const supabase = await crearClienteServidor();
  try {
    const validas = filas.filter((f) => f.valida).map((f) => ({ ...f, avisos: [] as string[] }));
    const [actuales, otros, { data: turnos }] = await Promise.all([
      validas.length ? enNomina(supabase, empresaId, variantes(validas)) : Promise.resolve([]),
      validas.length ? fueraDeNomina(supabase, empresaId, variantes(validas)) : Promise.resolve([]),
      supabase.from("lista_items").select("nombre").eq("org_id", p.orgId).eq("lista", "turno").eq("activo", true),
    ]);
    const plan = planNomina(validas, actuales, otros, (turnos ?? []).map((t) => t.nombre));
    const excluir = new Set(opciones.excluir);
    const cambios = plan.cambios
      .filter((c) => !excluir.has(c.id))
      .map((c) => ({ ...c, difs: c.difs.filter((d) => d.tipo !== "identidad" || opciones.identidad) }))
      .filter((c) => c.difs.length);
    const nuevos = plan.nuevos.filter((n) => !excluir.has(n.cedula));

    // Cargos, departamentos y tipos nuevos se crean en la empresa (igual que al registrar a mano)
    const cargos = [...cambios.flatMap((c) => c.difs.filter((d) => d.campo === "cargo").map((d) => d.despues)), ...nuevos.map((n) => n.datos.cargo ?? "")].filter(Boolean);
    const deps = [...cambios.flatMap((c) => c.difs.filter((d) => d.campo === "dependencia").map((d) => d.despues)), ...nuevos.map((n) => n.datos.dependencia ?? "")].filter(Boolean);
    const tiposTxt = [...cambios.flatMap((c) => c.difs.filter((d) => d.campo === "tipo").map((d) => d.despues)), ...nuevos.map((n) => n.datos.tipo ?? "")].filter(Boolean);
    const cat = await resolverCatalogos(supabase, p.orgId, empresaId, deps, cargos);
    const tipos = await resolverTiposPaciente(supabase, p.orgId, tiposTxt);
    const columna = (campo: CampoNomina, v: string): [string, string | null] =>
      campo === "cargo" ? ["puesto_id", cat.puesto(v)] : campo === "dependencia" ? ["dependencia_id", cat.dependencia(v)]
        : campo === "tipo" ? ["tipo_paciente_id", tipos(v)] : [COLUMNA[campo], v];

    const pCambios = cambios.map((c) => ({ id: c.id, campos: Object.fromEntries(c.difs.map((d) => columna(d.campo, d.despues)).filter(([, v]) => v)) }));
    const pNuevos = nuevos.map((n) => ({
      cedula: n.cedula,
      ...Object.fromEntries((Object.entries(n.datos) as [CampoNomina, string][]).map(([k, v]) => columna(k, v)).filter(([, v]) => v)),
    }));
    const pInactivar = [...new Set(inactivar.filter((id) => UUID.test(id)))];
    if (!pCambios.length && !pNuevos.length && !pInactivar.length && lote) return { ok: true, mensaje: "", parte: { lote, cambios: 0, nuevos: 0, inactivados: 0 } };

    const { data, error } = await supabase.rpc("aplicar_nomina", {
      p_lote: lote, p_empresa: empresaId, p_archivo: archivo.slice(0, 200), p_cambios: pCambios, p_nuevos: pNuevos,
      p_inactivar: pInactivar, p_motivo: motivo.trim().slice(0, 200) || null,
    });
    if (error) {
      return {
        ok: false,
        mensaje: error.code === "42501" ? "Solo el administrador o el personal de salud actualizan la nómina de esta empresa."
          : /fetch|internet|503/i.test(error.message) ? "Para actualizar la nómina hace falta internet. No se guardó esta parte."
          : "No se pudo guardar: " + error.message,
      };
    }
    return { ok: true, mensaje: "", parte: data as Parte };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  } finally {
    invalidarEmpresas();
    revalidatePath("/", "layout");
    olvidar("");
  }
}

export type Deshecho = { cambios: number; cambios_quedan: number; nuevos: number; nuevos_quedan: number; reactivados: number; inactivos_quedan: number };

export async function deshacerNomina(lote: string): Promise<R<{ deshecho: Deshecho }>> {
  const p = await permiso();
  if ("error" in p) return { ok: false, mensaje: p.error };
  if (!UUID.test(lote)) return { ok: false, mensaje: "Datos no válidos." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("deshacer_nomina", { p_lote: lote });
  invalidarEmpresas();
  revalidatePath("/", "layout");
  olvidar("");
  if (error) return { ok: false, mensaje: "No se pudo deshacer: " + error.message };
  const d = data as Deshecho;
  const quedan = d.cambios_quedan + d.nuevos_quedan + d.inactivos_quedan;
  return {
    ok: true,
    deshecho: d,
    mensaje: quedan
      ? `Se deshizo casi todo. ${quedan} ${quedan === 1 ? "registro quedó" : "registros quedaron"} como está${quedan === 1 ? "" : "n"} porque alguien ${quedan === 1 ? "lo" : "los"} cambió o usó después.`
      : "Listo: la nómina quedó como estaba antes.",
  };
}

/** Actualizaciones de hoy de esta empresa que todavía se pueden deshacer. */
export async function actualizacionesDeHoy(empresaId: string): Promise<{ id: string; archivo: string | null; creado_en: string }[]> {
  const p = await permiso();
  if ("error" in p || !UUID.test(empresaId)) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("nomina_actualizaciones").select("id, archivo, creado_en")
    .eq("empresa_id", empresaId).eq("fecha", hoyCaracas()).is("deshecho_en", null).order("creado_en", { ascending: false }).limit(5);
  return data ?? [];
}
