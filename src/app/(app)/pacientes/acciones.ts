"use server";

import { revalidatePath } from "next/cache";
import { invalidarEmpresas } from "@/lib/empresas";
// Los reportes recuerdan sus cálculos unos minutos: cada cambio clínico los borra
import { olvidar } from "@/lib/memo";
import { claveCargo } from "@/lib/cargos";
import { hoyCaracas } from "@/lib/fecha";
import { lateralidadValida, normalizarLateralidad } from "@/lib/lateralidad";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { FilaImportada } from "@/lib/importar";

// existente: la cédula ya es de un trabajador inactivo o egresado (la pantalla ofrece abrir su ficha para reingresarlo)
export type Resultado = { ok: boolean; mensaje: string; id?: string; existente?: string };

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

function normalizarCedula(v: string) {
  const m = v.toUpperCase().replace(/[.\s]/g, "").match(/^([VEP])?-?(\d{5,9})$/);
  return m ? `${m[1] ?? "V"}-${m[2]}` : null;
}

// Busca por nombre o crea la dependencia y el puesto dentro de la empresa; devuelve sus ids. El nombre se compara
// sin mayúsculas, acentos, signos ni «de/del/la…» (claveCargo, igual que la base): «ADMINISTRACION CONTRATO» usa
// «Administración de contrato». Un cargo unido a otro (alias, Configuración › Unir cargos) lleva al que quedó.
async function resolverCatalogos(supabase: Supabase, orgId: string, empresaId: string, dependencias: string[], cargos: string[]) {
  const deps = new Map<string, string>();
  const puestos = new Map<string, string>();
  const clave = claveCargo;

  if (dependencias.length) {
    const { data } = await supabase.from("dependencias").select("id, nombre").eq("empresa_id", empresaId).eq("activa", true);
    for (const d of data ?? []) if (!deps.has(clave(d.nombre))) deps.set(clave(d.nombre), d.id);
    const nuevas = [...new Map(dependencias.map((d) => [clave(d), d.trim()])).values()].filter((d) => !deps.has(clave(d)));
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
    const { data } = await supabase.from("puestos").select("id, nombre, activo, unido_a").eq("empresa_id", empresaId);
    const activos = new Set<string>();
    for (const p of data ?? []) if (p.activo && !puestos.has(clave(p.nombre))) { puestos.set(clave(p.nombre), p.id); activos.add(p.id); }
    for (const p of data ?? []) if (!p.activo && p.unido_a && activos.has(p.unido_a) && !puestos.has(clave(p.nombre))) puestos.set(clave(p.nombre), p.unido_a);
    const nuevos = [...new Map(cargos.map((c) => [clave(c), c.trim()])).values()].filter((c) => !puestos.has(clave(c)));
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
      if (error.code !== "23505") return { ok: false, mensaje: "No se pudo guardar: " + error.message };
      // Cédula ya registrada: se dice en qué empresa está. Si es de una inactiva (candidato que vuelve), se pasa
      // desde su ficha o el buscador conservando su historia, en vez de crearlo de nuevo.
      const { data: previo } = await supabase.from("trabajadores").select("id, nombres, apellidos, estado, empresas(razon_social, activa)").eq("cedula", cedula).maybeSingle();
      const e = previo?.empresas as unknown as { razon_social: string; activa: boolean } | null;
      if (!previo || !e) return { ok: false, mensaje: "Ya existe un paciente con esa cédula." };
      // Inactivo o egresado que vuelve: se abre su ficha para «Reingresar» con sus datos (empieza de cero)
      if (previo.estado === "inactivo" || previo.estado === "egresado")
        return { ok: false, existente: previo.id, mensaje: `${previo.nombres} ${previo.apellidos} ya está registrado (${previo.estado === "inactivo" ? "inactivo" : "egresado"}, último en ${e.razon_social}). Abre su ficha y pulsa «Reingresar»: sus datos se conservan y empieza un período nuevo.` };
      return {
        ok: false,
        mensaje: e.activa
          ? `Esa cédula ya es de ${previo.nombres} ${previo.apellidos} (${e.razon_social}). Búscalo con Ctrl+K.`
          : `Esa cédula ya es de ${previo.nombres} ${previo.apellidos}, de ${e.razon_social} (empresa inactiva). Búscalo con Ctrl+K y pásalo a esta empresa: su historia va con él.`,
      };
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

// ─── Inactivos (Cesar, 31-oct): ya no están en la empresa pero nunca tuvieron egreso (p. ej. los del SAME) ───
// No es un egreso: salen de conteos, estadísticas y alertas; sus datos y su historia quedan. Si vuelven, se reingresan.
export type Candidato = { id: string; cedula: string; nombres: string; apellidos: string; empresa: string; cargo: string | null; fechaIngreso: string | null; ultimaConsulta: string | null };
export type Inactivados = { items: { id: string; estado: string }[]; fecha: string };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function refrescarTrabajadores() {
  invalidarEmpresas();
  revalidatePath("/", "layout");
  olvidar("");
}

// Trabajadores activos, en reposo o aspirantes sin ninguna consulta desde «desde» (solo datos laborales)
export async function candidatosInactivar(empresaId: string | null, desde: string): Promise<Resultado & { candidatos?: Candidato[] }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "Conecta Supabase para usar esta función." };
  if (!FECHA.test(desde)) return { ok: false, mensaje: "Elige una fecha válida." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("candidatos_inactivar", { p_empresa: empresaId || null, p_desde: desde });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Solo el administrador o el personal de salud pueden depurar trabajadores." : "No se pudo armar la lista: " + error.message };
  const filas = (data ?? []) as { id: string; cedula: string; nombres: string; apellidos: string; empresa: string; cargo: string | null; fecha_ingreso: string | null; ultima_consulta: string | null }[];
  return {
    ok: true,
    mensaje: `${filas.length} trabajadores sin consulta desde esa fecha.`,
    candidatos: filas.map((f) => ({ id: f.id, cedula: f.cedula, nombres: f.nombres, apellidos: f.apellidos, empresa: f.empresa, cargo: f.cargo, fechaIngreso: f.fecha_ingreso, ultimaConsulta: f.ultima_consulta })),
  };
}

// Inactiva uno (desde la ficha) o muchos (Depurar). Devuelve el estado anterior de cada uno para «Deshacer».
export async function inactivarTrabajadores(ids: string[], fecha: string, motivo: string): Promise<Resultado & { hecho?: Inactivados }> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  const validos = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!validos.length) return { ok: false, mensaje: "No elegiste a ningún trabajador." };
  if (!FECHA.test(fecha)) return { ok: false, mensaje: "Elige una fecha válida." };
  if (fecha > hoyCaracas()) return { ok: false, mensaje: "La fecha no puede ser futura." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("inactivar_trabajadores", { p_ids: validos, p_fecha: fecha, p_motivo: motivo.trim().slice(0, 200) || null });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Solo el administrador o el personal de salud pueden inactivar trabajadores." : "No se pudo inactivar: " + error.message };
  const items = (data ?? []) as Inactivados["items"];
  refrescarTrabajadores();
  if (!items.length) return { ok: false, mensaje: "Nadie cambió: ya estaban inactivos o egresados, o tu usuario no puede modificarlos." };
  const faltan = validos.length - items.length;
  return {
    ok: true,
    hecho: { items, fecha },
    mensaje: `${items.length === 1 ? "1 trabajador quedó inactivo" : `${items.length} trabajadores quedaron inactivos`}. Sus datos y su historia se conservan.`
      + (faltan > 0 ? ` ${faltan} no cambiaron (ya estaban inactivos o egresados).` : ""),
  };
}

export async function deshacerInactivar(hecho: Inactivados): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!FECHA.test(hecho.fecha)) return { ok: false, mensaje: "No se pudo deshacer: datos no válidos." };
  // La base solo acepta estos estados y solo toca a quien sigue inactivo con esa misma fecha
  const items = hecho.items.filter((i) => /^[0-9a-f-]{36}$/i.test(i.id) && ["activo", "reposo", "aspirante"].includes(i.estado));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("deshacer_inactivar", { p_items: items, p_fecha: hecho.fecha });
  if (error) return { ok: false, mensaje: "No se pudo deshacer: " + error.message };
  refrescarTrabajadores();
  const n = Number(data ?? 0);
  return { ok: true, mensaje: n === items.length ? "Listo, quedaron como estaban." : `Se devolvieron ${n} de ${items.length} (los demás ya habían cambiado).` };
}

// Reingreso (misma u otra empresa): conserva los datos personales y empieza un período NUEVO desde la fecha de ingreso.
// La aptitud, los vencimientos y las alertas del período anterior no cuentan (orden de Cesar, 31-oct); las consultas
// viejas siguen en su historia. El período anterior queda en el historial de empresas (lo anota la base).
export async function reingresarTrabajador(trabajadorId: string, empresaId: string, fechaIngreso: string, cargo: string): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (!empresaId) return { ok: false, mensaje: "Elige la empresa a la que reingresa." };
  if (!FECHA.test(fechaIngreso)) return { ok: false, mensaje: "Elige la fecha de ingreso." };
  if (fechaIngreso > hoyCaracas()) return { ok: false, mensaje: "La fecha de ingreso no puede ser futura." };
  const supabase = await crearClienteServidor();
  const [{ data: destino }, { data: t }] = await Promise.all([
    supabase.from("empresas").select("razon_social, activa").eq("id", empresaId).maybeSingle(),
    supabase.from("trabajadores").select("estado, periodo_desde, fecha_inactivo, fecha_egreso, nombres, apellidos").eq("id", trabajadorId).maybeSingle(),
  ]);
  if (!t) return { ok: false, mensaje: "Paciente no encontrado." };
  if (!destino?.activa) return { ok: false, mensaje: "Esa empresa no está activa. Elige una empresa activa." };
  if (t.estado !== "inactivo" && t.estado !== "egresado") return { ok: false, mensaje: `${t.nombres} ${t.apellidos} no está inactivo ni egresado.` };
  if (t.periodo_desde && fechaIngreso <= t.periodo_desde)
    return { ok: false, mensaje: `La fecha de ingreso debe ser posterior al inicio de su período anterior (${t.periodo_desde.split("-").reverse().join("/")}).` };
  const salida = t.estado === "inactivo" ? t.fecha_inactivo : t.fecha_egreso;
  if (salida && fechaIngreso < salida)
    return { ok: false, mensaje: `La fecha de ingreso no puede ser anterior a su salida (${salida.split("-").reverse().join("/")}).` };
  try {
    const cat = await resolverCatalogos(supabase, sesion.orgId, empresaId, [], cargo.trim() ? [cargo] : []);
    // Sin pedir la fila de vuelta (columnas de salud ocultas, #41): basta el conteo para saber si la RLS lo dejó
    const { count, error } = await supabase
      .from("trabajadores")
      .update({
        empresa_id: empresaId, estado: "activo", fecha_ingreso: fechaIngreso, periodo_desde: fechaIngreso, fecha_egreso: null,
        puesto_id: cat.puesto(cargo.trim() || null), fecha_ingreso_cargo: cargo.trim() ? fechaIngreso : null, dependencia_id: null, sede_id: null,
      }, { count: "exact" })
      .eq("id", trabajadorId);
    if (error) return { ok: false, mensaje: error.code === "42501" ? "Solo el servicio de salud puede reingresar a un trabajador." : "No se pudo reingresar: " + error.message };
    if (!count) return { ok: false, mensaje: "Tu usuario no puede modificar a este trabajador." };
    refrescarTrabajadores();
    return { ok: true, mensaje: `${t.nombres} ${t.apellidos} reingresó a ${destino.razon_social}. Empieza sin evaluar: su aptitud cuenta desde la nueva evaluación de ingreso.` };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

export type PeriodoAnterior = { empresa: string; cargo: string | null; desde: string | null; hasta: string; cierre: "inactivo" | "egresado" | "traslado"; motivo: string | null };
export async function periodosDeTrabajador(trabajadorId: string): Promise<PeriodoAnterior[]> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return [];
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("trabajador_periodos").select("cargo, desde, hasta, cierre, motivo, empresas(razon_social)")
    .eq("trabajador_id", trabajadorId).order("hasta", { ascending: false }).limit(20);
  return (data ?? []).map((p) => ({
    empresa: (p.empresas as unknown as { razon_social: string } | null)?.razon_social ?? "Empresa",
    cargo: p.cargo, desde: p.desde, hasta: p.hasta, cierre: p.cierre as PeriodoAnterior["cierre"], motivo: p.motivo,
  }));
}

// Ficha del trabajador desde la consulta («Generales» › Datos del trabajador). El cargo o la dependencia nuevos se
// crean en la empresa del trabajador; si viene la consulta y sigue abierta, también queda con ese cargo y dependencia
// (de ahí salen los riesgos del puesto, la vigilancia y los informes). Al cambiar de cargo, la base guarda el anterior
// en el historial (cargos_historial) y, si no se indicó otra, la antigüedad del nuevo empieza hoy.
const CAMPOS_FICHA = ["sexo", "fecha_nacimiento", "estado_civil", "lugar_nacimiento", "nivel_educativo", "profesion", "telefono", "correo",
  "direccion", "fecha_ingreso", "fecha_ingreso_cargo", "turno", "lateralidad", "tipo_paciente_id", "ficha"] as const;
export type FichaTrabajador = Record<(typeof CAMPOS_FICHA)[number] | "cargo" | "dependencia", string>;

// Nombre del campo de la ficha para cada regla de la base (check «trabajadores_<campo>_check»)
const ETIQUETA_CAMPO: Record<string, string> = {
  lateralidad: "Lateralidad", sexo: "Sexo", estado_civil: "Estado civil", nivel_educativo: "Nivel educativo", turno: "Turno",
  fecha_nacimiento: "Fecha de nacimiento", fecha_ingreso: "Ingreso a la empresa", fecha_ingreso_cargo: "Ingreso al cargo", correo: "Correo",
};
// Un rechazo de la base nunca llega en inglés técnico: dice qué campo y que NO se guardó nada (30-oct: Cesar creyó que sí)
// mensaje empieza con FICHA_NO_GUARDADA (la pantalla lo pone en negrita) y campo marca en rojo el que falló
const FICHA_NO_GUARDADA = "No se guardó la ficha.";
function fichaRechazada(e: { code?: string; message: string }): ResultadoFicha {
  const campo = /trabajadores_([a-z_]+?)_check/.exec(e.message)?.[1] ?? /column "([a-z_]+)"/.exec(e.message)?.[1];
  const nombre = campo ? ETIQUETA_CAMPO[campo] ?? campo : null;
  if (e.code === "23514" || e.code === "22P02" || e.code === "23502")
    return { ok: false, campo, mensaje: `${FICHA_NO_GUARDADA} El valor de «${nombre ?? "un campo"}» no es válido. Corrígelo y vuelve a guardar; lo que escribiste sigue en pantalla.` };
  return { ok: false, mensaje: `${FICHA_NO_GUARDADA} ${e.message}. Lo que escribiste sigue en pantalla: vuelve a guardar.` };
}
export type ResultadoFicha = Resultado & { campo?: string };

export async function actualizarDatosTrabajador(trabajadorId: string, consultaId: string | null, datos: FormData): Promise<ResultadoFicha> {
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
    ficha.lateralidad = normalizarLateralidad(ficha.lateralidad);
    if (!lateralidadValida(ficha.lateralidad)) return fichaRechazada({ code: "23514", message: "trabajadores_lateralidad_check" });
    // Cargo nuevo sin cambiar la fecha de ingreso al cargo: empieza hoy (en el escritorio el disparador corre en la nube)
    if (t.puesto_id && ubicacion.puesto_id !== t.puesto_id && ficha.fecha_ingreso_cargo === t.fecha_ingreso_cargo) ficha.fecha_ingreso_cargo = hoy;
    const { error } = await supabase
      .from("trabajadores")
      .update({ ...ficha, ...ubicacion, sexo: ficha.sexo as "F" | "M" | null })
      .eq("id", trabajadorId);
    if (error) return fichaRechazada(error);
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
  // Quién mira: el borrador sin guardar se guarda con su usuario
  uid: string;
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
    supabase.from("puestos").select("nombre").eq("empresa_id", fila.empresa_id).eq("activo", true).order("nombre"),
    supabase.from("dependencias").select("nombre").eq("empresa_id", fila.empresa_id).eq("activa", true).order("nombre"),
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
    uid: sesion.usuarioId,
  };
}
