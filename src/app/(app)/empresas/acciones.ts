"use server";

import { revalidatePath } from "next/cache";
import { invalidarEmpresas } from "@/lib/empresas";
import { AVISOS_EMPRESA } from "@/lib/empresas-avisos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string };

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

function normalizarRif(v: string) {
  const m = v.toUpperCase().replace(/[\s.]/g, "").match(/^([JGVEPC])-?(\d{8})-?(\d)$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function soloAdministrador() {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { error: "En modo demo no se guardan datos." } as const;
  if (!sesion.orgId || sesion.rol !== "administrador") return { error: "Solo un administrador puede modificar empresas." } as const;
  return { sesion } as const;
}

// Crea la empresa o, si viene "id", actualiza sus datos
export async function guardarEmpresa(_: Resultado | null, datos: FormData): Promise<Resultado> {
  const c = await soloAdministrador();
  if ("error" in c) return { ok: false, mensaje: c.error! };

  const id = texto(datos, "id");
  const razonSocial = texto(datos, "razon_social");
  const rif = normalizarRif(String(datos.get("rif") ?? ""));
  if (!razonSocial) return { ok: false, mensaje: "Escribe la razón social." };
  if (!rif) return { ok: false, mensaje: "RIF inválido. Ejemplo: J-30123456-7" };

  const campos = {
    razon_social: razonSocial,
    rif,
    nil: texto(datos, "nil"),
    actividad_economica: texto(datos, "actividad"),
    estado: texto(datos, "estado"),
    municipio: texto(datos, "municipio"),
    direccion: texto(datos, "direccion"),
    telefono: texto(datos, "telefono"),
    correo: texto(datos, "correo"),
    servicio_sst_tipo: texto(datos, "servicio_sst"),
    servicio_sst_fecha_registro: texto(datos, "servicio_sst_registro"),
    psst_fecha_registro: texto(datos, "psst_registro"),
    parroquia: texto(datos, "parroquia"),
    sector: texto(datos, "sector"),
    mes_inicio_gestion: Math.min(12, Math.max(1, Number(datos.get("mes_inicio_gestion")) || 1)),
    periodicidad_meses: Math.min(60, Math.max(1, Number(datos.get("periodicidad_meses")) || 12)),
    dias_aviso_examen: Math.min(180, Math.max(0, Number(datos.get("dias_aviso_examen") ?? 30) || 0)),
    dias_post_vacacional: Math.min(60, Math.max(0, Number(datos.get("dias_post_vacacional") ?? 5) || 0)),
    // Casilla marcada = aviso encendido; se guardan los apagados. Solo si el formulario trae las casillas
    // (marca «avisos_en_formulario»): otro formulario sin ellas no apaga nada sin querer.
    ...(datos.get("avisos_en_formulario") === "1" ? {
      avisos_apagados: AVISOS_EMPRESA.map((a) => a.clave).filter((k) => datos.get(`aviso_${k}`) !== "on"),
      ignorar_alerta_legal: datos.get("aviso_datos_legales") !== "on",
    } : {}),
  };

  const supabase = await crearClienteServidor();
  // El id de la nueva se crea aquí para colgarle sus dependencias sin pedir la fila de vuelta
  const empresaId = id ?? crypto.randomUUID();
  const { error } = id
    ? await supabase.from("empresas").update(campos).eq("id", id)
    : await supabase.from("empresas").insert({ ...campos, id: empresaId, org_id: c.sesion.orgId! });
  if (error) {
    return { ok: false, mensaje: error.code === "23505" ? "Ya existe una empresa con ese RIF." : "No se pudo guardar: " + error.message };
  }
  // Dependencias o departamentos, una por línea (como en el SAME): solo se agregan las que la empresa no tiene
  const lineas = [...new Map(String(datos.get("dependencias") ?? "").split(/\r?\n/).map((d) => d.trim().replace(/\s+/g, " "))
    .filter(Boolean).map((d) => [d.toLocaleLowerCase("es"), d])).entries()];
  let nuevas = 0;
  if (lineas.length) {
    const { data: hay } = await supabase.from("dependencias").select("nombre").eq("empresa_id", empresaId);
    const ya = new Set((hay ?? []).map((d) => d.nombre.trim().toLocaleLowerCase("es")));
    const filas = lineas.filter(([k]) => !ya.has(k)).map(([, nombre]) => ({ org_id: c.sesion.orgId!, empresa_id: empresaId, nombre }));
    if (filas.length) {
      const { error: e } = await supabase.from("dependencias").insert(filas);
      if (e) return { ok: false, mensaje: `${razonSocial} se guardó, pero no sus dependencias: ${e.message}` };
      nuevas = filas.length;
    }
  }
  invalidarEmpresas();
  revalidatePath("/", "layout");
  const deps = nuevas ? ` ${nuevas === 1 ? "1 dependencia agregada" : `${nuevas} dependencias agregadas`}.` : "";
  return { ok: true, mensaje: (id ? "Datos actualizados." : `${razonSocial} registrada.`) + deps };
}

// Oculta (o vuelve a mostrar) el aviso de datos legales incompletos de una empresa
export async function ignorarAlertaLegal(id: string, ignorar: boolean): Promise<Resultado> {
  const c = await soloAdministrador();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("empresas").update({ ignorar_alerta_legal: ignorar }).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  invalidarEmpresas();
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "" };
}

// Pausar (o reactivar) todos los avisos de una empresa de un toque: las que no se atienden por un tiempo.
// Vale en la web, el escritorio y el celular (se guarda en la empresa). Los plazos legales de accidentes siguen avisando.
export async function pausarAvisos(id: string, pausar: boolean): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("pausar_avisos_empresa", { p_empresa: id, p_pausar: pausar });
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Solo el administrador o el gerente médico pausan avisos." : error.message };
  invalidarEmpresas();
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "" };
}

const LOGO_VALIDO = /^data:image\/(png|jpeg|webp);base64,/;

// Logo de la empresa para el membrete de sus informes (null lo quita)
export async function guardarLogoEmpresa(id: string, logo: string | null): Promise<Resultado> {
  const c = await soloAdministrador();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  if (logo && (!LOGO_VALIDO.test(logo) || logo.length > 600_000)) return { ok: false, mensaje: "La imagen no es válida o es muy grande." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("empresas").update({ logo }).eq("id", id);
  if (error) return { ok: false, mensaje: "No se pudo guardar: " + error.message };
  revalidatePath(`/empresas/${id}`);
  return { ok: true, mensaje: logo ? "Logo guardado. Ya sale en los informes de esta empresa." : "Logo quitado." };
}
