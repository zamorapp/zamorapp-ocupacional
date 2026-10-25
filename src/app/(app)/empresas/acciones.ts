"use server";

import { revalidatePath } from "next/cache";
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
  };

  const supabase = await crearClienteServidor();
  const { error } = id
    ? await supabase.from("empresas").update(campos).eq("id", id)
    : await supabase.from("empresas").insert({ ...campos, org_id: c.sesion.orgId! });
  if (error) {
    return { ok: false, mensaje: error.code === "23505" ? "Ya existe una empresa con ese RIF." : "No se pudo guardar: " + error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, mensaje: id ? "Datos actualizados." : `${razonSocial} registrada.` };
}

// Oculta (o vuelve a mostrar) el aviso de datos legales incompletos de una empresa
export async function ignorarAlertaLegal(id: string, ignorar: boolean): Promise<Resultado> {
  const c = await soloAdministrador();
  if ("error" in c) return { ok: false, mensaje: c.error! };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("empresas").update({ ignorar_alerta_legal: ignorar }).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "" };
}
