"use server";

import { revalidatePath } from "next/cache";
// Los reportes recuerdan sus cálculos unos minutos: cada cambio clínico los borra
import { olvidar } from "@/lib/memo";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { FilaImportada } from "@/lib/importar";
import { type BusquedaPacientes, buscarTrabajadores } from "@/lib/pacientes-datos";

export type Resultado = { ok: boolean; mensaje: string; id?: string };

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

function normalizarCedula(v: string) {
  const m = v.toUpperCase().replace(/[.\s]/g, "").match(/^([VEP])?-?(\d{5,9})$/);
  return m ? `${m[1] ?? "V"}-${m[2]}` : null;
}

// Busca por nombre o crea la dependencia y el puesto dentro de la empresa; devuelve sus ids.
async function resolverCatalogos(supabase: Supabase, orgId: string, empresaId: string, dependencias: string[], cargos: string[]) {
  const deps = new Map<string, string>();
  const puestos = new Map<string, string>();
  const clave = (s: string) => s.trim().toLowerCase();

  if (dependencias.length) {
    const { data } = await supabase.from("dependencias").select("id, nombre").eq("empresa_id", empresaId);
    for (const d of data ?? []) deps.set(clave(d.nombre), d.id);
    const nuevas = [...new Set(dependencias.map((d) => d.trim()))].filter((d) => !deps.has(clave(d)));
    if (nuevas.length) {
      const { data: creadas, error } = await supabase
        .from("dependencias")
        .insert(nuevas.map((nombre) => ({ org_id: orgId, empresa_id: empresaId, nombre })))
        .select("id, nombre");
      if (error) throw new Error("No se pudieron crear las dependencias: " + error.message);
      for (const d of creadas ?? []) deps.set(clave(d.nombre), d.id);
    }
  }

  if (cargos.length) {
    const { data } = await supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId);
    for (const p of data ?? []) puestos.set(clave(p.nombre), p.id);
    const nuevos = [...new Set(cargos.map((c) => c.trim()))].filter((c) => !puestos.has(clave(c)));
    if (nuevos.length) {
      const { data: creados, error } = await supabase
        .from("puestos")
        .insert(nuevos.map((nombre) => ({ org_id: orgId, empresa_id: empresaId, nombre })))
        .select("id, nombre");
      if (error) throw new Error("No se pudieron crear los cargos: " + error.message);
      for (const p of creados ?? []) puestos.set(clave(p.nombre), p.id);
    }
  }

  return {
    dependencia: (n: string | null) => (n ? deps.get(clave(n)) ?? null : null),
    puesto: (n: string | null) => (n ? puestos.get(clave(n)) ?? null : null),
  };
}

// Tipo de paciente por nombre ("Empleado", "Obrero"…); si no existe en la lista se agrega
async function resolverTiposPaciente(supabase: Supabase, orgId: string, nombres: string[]) {
  const clave = (s: string) => s.trim().toLowerCase();
  const mapa = new Map<string, string>();
  const { data } = await supabase.from("lista_items").select("id, nombre").eq("org_id", orgId).eq("lista", "tipo_paciente");
  for (const t of data ?? []) mapa.set(clave(t.nombre), t.id);
  const nuevos = [...new Set(nombres.map((n) => n.trim()))].filter((n) => !mapa.has(clave(n)));
  if (nuevos.length) {
    const { data: creados } = await supabase
      .from("lista_items")
      .insert(nuevos.map((nombre, i) => ({ lista: "tipo_paciente", org_id: orgId, nombre, orden: 100 + i })))
      .select("id, nombre");
    for (const t of creados ?? []) mapa.set(clave(t.nombre), t.id);
  }
  return (n: string) => (n ? mapa.get(clave(n)) ?? null : null);
}

export async function crearPaciente(_: Resultado | null, datos: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!sesion.orgId) return { ok: false, mensaje: "Tu usuario no tiene organización asignada." };

  const empresaId = texto(datos, "empresa_id");
  const cedula = normalizarCedula(String(datos.get("cedula") ?? ""));
  const nombres = texto(datos, "nombres");
  const apellidos = texto(datos, "apellidos");
  if (!empresaId) return { ok: false, mensaje: "Elige la empresa." };
  if (!cedula) return { ok: false, mensaje: "Cédula inválida. Ejemplo: V-12345678" };
  if (!nombres || !apellidos) return { ok: false, mensaje: "Escribe nombres y apellidos." };

  const supabase = await crearClienteServidor();
  try {
    const cat = await resolverCatalogos(
      supabase, sesion.orgId, empresaId,
      [texto(datos, "dependencia")].filter(Boolean) as string[],
      [texto(datos, "cargo")].filter(Boolean) as string[],
    );
    const { data, error } = await supabase
      .from("trabajadores")
      .insert({
        org_id: sesion.orgId,
        empresa_id: empresaId,
        cedula,
        nombres,
        apellidos,
        sexo: texto(datos, "sexo"),
        fecha_nacimiento: texto(datos, "fecha_nacimiento"),
        fecha_ingreso: texto(datos, "fecha_ingreso"),
        tipo_paciente_id: texto(datos, "tipo_paciente_id"),
        turno: texto(datos, "turno"),
        telefono: texto(datos, "telefono"),
        correo: texto(datos, "correo"),
        dependencia_id: cat.dependencia(texto(datos, "dependencia")),
        puesto_id: cat.puesto(texto(datos, "cargo")),
        estado: (texto(datos, "estado") ?? "activo") as "activo",
      })
      .select("id")
      .single();
    if (error) {
      return { ok: false, mensaje: error.code === "23505" ? "Ya existe un paciente con esa cédula." : "No se pudo guardar: " + error.message };
    }
    revalidatePath("/", "layout");
    olvidar("");
    return { ok: true, mensaje: `${nombres} ${apellidos} registrado.`, id: data.id };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

export async function importarPacientes(empresaId: string, filas: FilaImportada[]): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { ok: true, mensaje: `${filas.length} pacientes listos. En modo demo no se guardan.` };
  if (!sesion.orgId) return { ok: false, mensaje: "Tu usuario no tiene organización asignada." };

  const validas = filas.filter((f) => f.errores.length === 0);
  if (!validas.length) return { ok: false, mensaje: "No hay filas válidas para importar." };

  const supabase = await crearClienteServidor();
  try {
    const cat = await resolverCatalogos(
      supabase, sesion.orgId, empresaId,
      validas.map((f) => f.dependencia).filter(Boolean),
      validas.map((f) => f.cargo).filter(Boolean),
    );
    const tipos = await resolverTiposPaciente(supabase, sesion.orgId, validas.map((f) => f.tipoPaciente).filter(Boolean));
    const registros = validas.map((f) => ({
      org_id: sesion.orgId!,
      empresa_id: empresaId,
      cedula: f.cedula,
      nombres: f.nombres,
      apellidos: f.apellidos,
      sexo: (f.sexo || null) as "F" | "M" | null,
      fecha_nacimiento: f.fechaNacimiento || null,
      fecha_ingreso: f.fechaIngreso || null,
      dependencia_id: cat.dependencia(f.dependencia || null),
      puesto_id: cat.puesto(f.cargo || null),
      direccion: f.direccion || null,
      telefono: f.telefono || null,
      correo: f.correo || null,
      lugar_nacimiento: f.lugarNacimiento || null,
      ficha: f.ficha || null,
      turno: f.turno || null,
      tipo_paciente_id: tipos(f.tipoPaciente),
      estado: f.estado as "activo",
    }));
    let guardados = 0;
    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500);
      const { error } = await supabase.from("trabajadores").insert(lote);
      if (error) {
        revalidatePath("/", "layout");
        olvidar("");
        return { ok: false, mensaje: `Se guardaron ${guardados}. Error en el lote siguiente: ${error.code === "23505" ? "hay cédulas que ya existen" : error.message}` };
      }
      guardados += lote.length;
    }
    revalidatePath("/", "layout");
    olvidar("");
    return { ok: true, mensaje: `${guardados} pacientes importados al expediente.` };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

// Depurar nómina: cuenta (aplicar = false) o marca como egresados a quienes no tienen consulta desde "desde"
export async function depurarNomina(empresaId: string | null, desde: string, aplicar: boolean): Promise<Resultado & { cantidad?: number }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para usar esta función." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return { ok: false, mensaje: "Elige una fecha válida." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("depurar_nomina", { p_empresa: empresaId || null, p_desde: desde, p_aplicar: aplicar });
  if (error) return { ok: false, mensaje: error.message.includes("permiso") ? "Solo el administrador o el personal de salud pueden depurar la nómina." : error.message };
  if (aplicar) {
    revalidatePath("/", "layout");
    olvidar("");
  }
  const n = Number(data ?? 0);
  return { ok: true, cantidad: n, mensaje: aplicar ? `${n} trabajadores marcados como egresados.` : `${n} trabajadores sin consulta desde esa fecha.` };
}

// Búsqueda y paginación de la lista de pacientes desde el navegador (sin recargar la pantalla)
export async function buscarPacientesLista(b: BusquedaPacientes) {
  await obtenerSesion(); // sin sesión: redirige a /login
  return buscarTrabajadores(b);
}
