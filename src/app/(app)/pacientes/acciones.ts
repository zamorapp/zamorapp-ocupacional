"use server";

import { revalidatePath } from "next/cache";
import { invalidarEmpresas } from "@/lib/empresas";
// Los reportes recuerdan sus cálculos unos minutos: cada cambio clínico los borra
import { olvidar } from "@/lib/memo";
import { hoyCaracas } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { FilaImportada } from "@/lib/importar";

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

// Dependencias o departamentos de una empresa, para sugerirlas al registrar a un trabajador
export async function dependenciasDeEmpresa(empresaId: string): Promise<string[]> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !empresaId) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("dependencias").select("nombre").eq("empresa_id", empresaId).eq("activa", true).order("nombre");
  return (data ?? []).map((d) => d.nombre);
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
  const nacimiento = texto(datos, "fecha_nacimiento");
  if (nacimiento && nacimiento > hoyCaracas()) return { ok: false, mensaje: "La fecha de nacimiento no puede ser futura." };

  const supabase = await crearClienteServidor();
  try {
    const cat = await resolverCatalogos(
      supabase, sesion.orgId, empresaId,
      [texto(datos, "dependencia")].filter(Boolean) as string[],
      [texto(datos, "cargo")].filter(Boolean) as string[],
    );
    // El id se crea aquí y se inserta sin pedir la fila de vuelta: con las columnas de salud ocultas (#41), pedir la
    // representación de la fila nueva da 42501 en PostgREST según el rol y la versión (web y escritorio)
    const id = crypto.randomUUID();
    const { error } = await supabase
      .from("trabajadores")
      .insert({
        id,
        org_id: sesion.orgId,
        empresa_id: empresaId,
        cedula,
        nombres,
        apellidos,
        sexo: texto(datos, "sexo"),
        fecha_nacimiento: nacimiento,
        profesion: texto(datos, "profesion"),
        fecha_ingreso: texto(datos, "fecha_ingreso"),
        tipo_paciente_id: texto(datos, "tipo_paciente_id"),
        turno: texto(datos, "turno"),
        telefono: texto(datos, "telefono"),
        correo: texto(datos, "correo"),
        dependencia_id: cat.dependencia(texto(datos, "dependencia")),
        puesto_id: cat.puesto(texto(datos, "cargo")),
        estado: (texto(datos, "estado") ?? "activo") as "activo",
      });
    if (error) {
      return { ok: false, mensaje: error.code === "23505" ? "Ya existe un paciente con esa cédula." : "No se pudo guardar: " + error.message };
    }
    invalidarEmpresas();
    revalidatePath("/", "layout");
    olvidar("");
    return { ok: true, mensaje: `${nombres} ${apellidos} registrado.`, id };
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
        invalidarEmpresas();
        revalidatePath("/", "layout");
        olvidar("");
        return { ok: false, mensaje: `Se guardaron ${guardados}. Error en el lote siguiente: ${error.code === "23505" ? "hay cédulas que ya existen" : error.message}` };
      }
      guardados += lote.length;
    }
    invalidarEmpresas();
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
    invalidarEmpresas();
    revalidatePath("/", "layout");
    olvidar("");
  }
  const n = Number(data ?? 0);
  return { ok: true, cantidad: n, mensaje: aplicar ? `${n} trabajadores marcados como egresados.` : `${n} trabajadores sin consulta desde esa fecha.` };
}

// Ficha del trabajador desde la consulta («Generales» › Datos del trabajador). El cargo o la dependencia nuevos se
// crean en la empresa del trabajador; si viene la consulta y sigue abierta, también queda con ese cargo y dependencia
// (de ahí salen los riesgos del puesto, la vigilancia y los informes). Al cambiar de cargo, la base guarda el anterior
// en el historial (cargos_historial) y, si no se indicó otra, la antigüedad del nuevo empieza hoy.
const CAMPOS_FICHA = ["sexo", "fecha_nacimiento", "estado_civil", "lugar_nacimiento", "nivel_educativo", "profesion", "telefono", "correo",
  "direccion", "fecha_ingreso", "fecha_ingreso_cargo", "turno", "lateralidad", "tipo_paciente_id", "ficha"] as const;
export type FichaTrabajador = Record<(typeof CAMPOS_FICHA)[number] | "cargo" | "dependencia", string>;

export async function actualizarDatosTrabajador(trabajadorId: string, consultaId: string | null, datos: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!sesion.orgId) return { ok: false, mensaje: "Tu usuario no tiene organización asignada." };

  const supabase = await crearClienteServidor();
  const { data: t } = await supabase.from("trabajadores").select("empresa_id, puesto_id, fecha_ingreso_cargo").eq("id", trabajadorId).maybeSingle();
  if (!t) return { ok: false, mensaje: "Paciente no encontrado." };
  const cargo = texto(datos, "cargo");
  const dependencia = texto(datos, "dependencia");
  const hoy = hoyCaracas();
  for (const [k, n] of [["fecha_nacimiento", "nacimiento"], ["fecha_ingreso", "ingreso a la empresa"], ["fecha_ingreso_cargo", "ingreso al cargo"]] as const) {
    const f = texto(datos, k);
    if (f && f > hoy) return { ok: false, mensaje: `La fecha de ${n} no puede ser futura.` };
  }
  try {
    const cat = await resolverCatalogos(supabase, sesion.orgId, t.empresa_id, dependencia ? [dependencia] : [], cargo ? [cargo] : []);
    const ubicacion = { puesto_id: cat.puesto(cargo), dependencia_id: cat.dependencia(dependencia) };
    const ficha = Object.fromEntries(CAMPOS_FICHA.map((k) => [k, texto(datos, k)])) as Record<(typeof CAMPOS_FICHA)[number], string | null>;
    // Cargo nuevo sin cambiar la fecha de ingreso al cargo: empieza hoy (en el escritorio el disparador corre en la nube)
    if (t.puesto_id && ubicacion.puesto_id !== t.puesto_id && ficha.fecha_ingreso_cargo === t.fecha_ingreso_cargo) ficha.fecha_ingreso_cargo = hoy;
    const { error } = await supabase
      .from("trabajadores")
      .update({ ...ficha, ...ubicacion, sexo: ficha.sexo as "F" | "M" | null })
      .eq("id", trabajadorId);
    if (error) return { ok: false, mensaje: "No se pudo guardar: " + error.message };
    if (consultaId) {
      // Solo la consulta en curso de este trabajador; una firmada no cambia (la base también lo impide)
      await supabase.from("consultas").update(ubicacion).eq("id", consultaId).eq("trabajador_id", trabajadorId).neq("estado", "firmada");
    }
    revalidatePath("/", "layout");
    olvidar("");
    return { ok: true, mensaje: "Datos del trabajador guardados." };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

export type OpcionesFicha = {
  ficha: FichaTrabajador;
  cargos: string[];
  dependencias: string[];
  listas: Record<"estado_civil" | "nivel_educativo" | "turno" | "tipo_paciente", { id: string; nombre: string }[]>;
  historial: { cargo: string; desde: string | null; hasta: string }[];
  // «Hoy» del servidor (Caracas): la edad y la antigüedad no dependen de la fecha de Windows
  hoy: string;
};

// Ficha actual, cargos y dependencias de su empresa (para sugerir) y las listas editables, en una sola ida
export async function fichaDeTrabajador(trabajadorId: string): Promise<OpcionesFicha | null> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return null;
  const supabase = await crearClienteServidor();
  const { data: t } = await supabase
    .from("trabajadores")
    .select(`empresa_id, ${CAMPOS_FICHA.join(", ")}, puestos(nombre), dependencias(nombre)`)
    .eq("id", trabajadorId)
    .maybeSingle();
  if (!t) return null;
  const fila = t as unknown as Record<string, string | null> & { empresa_id: string; puestos: { nombre: string } | null; dependencias: { nombre: string } | null };
  const [{ data: p }, { data: d }, { data: items }, { data: h }] = await Promise.all([
    supabase.from("puestos").select("nombre").eq("empresa_id", fila.empresa_id).order("nombre"),
    supabase.from("dependencias").select("nombre").eq("empresa_id", fila.empresa_id).order("nombre"),
    supabase.from("lista_items").select("id, lista, nombre").eq("org_id", sesion.orgId).eq("activo", true)
      .in("lista", ["estado_civil", "nivel_educativo", "turno", "tipo_paciente"]).order("orden").order("nombre"),
    supabase.from("cargos_historial").select("cargo, desde, hasta").eq("trabajador_id", trabajadorId).order("hasta", { ascending: false }),
  ]);
  const listas: OpcionesFicha["listas"] = { estado_civil: [], nivel_educativo: [], turno: [], tipo_paciente: [] };
  for (const i of items ?? []) listas[i.lista as keyof typeof listas]?.push({ id: i.id, nombre: i.nombre });
  return {
    ficha: {
      ...(Object.fromEntries(CAMPOS_FICHA.map((k) => [k, fila[k] ?? ""])) as Record<(typeof CAMPOS_FICHA)[number], string>),
      cargo: fila.puestos?.nombre ?? "",
      dependencia: fila.dependencias?.nombre ?? "",
    },
    cargos: [...new Set((p ?? []).map((x) => x.nombre))],
    dependencias: [...new Set((d ?? []).map((x) => x.nombre))],
    listas,
    historial: h ?? [],
    hoy: hoyCaracas(),
  };
}
