"use server";

import { revalidatePath } from "next/cache";
import { invalidarSesion, obtenerSesion, type Rol } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string };

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;
const ROLES_EDITAN_LISTAS: Rol[] = ["administrador", "gerente_medico"];

async function contexto(roles?: Rol[]) {
  const sesion = await obtenerSesion();
  if (sesion.demo) throw new Error("En modo demo no se guardan datos.");
  if (!sesion.orgId) throw new Error("Tu usuario no tiene organización asignada.");
  if (roles && (!sesion.rol || !roles.includes(sesion.rol))) throw new Error("Tu rol no permite hacer este cambio.");
  return { sesion, supabase: await crearClienteServidor() };
}

function fallo(e: unknown): Resultado {
  return { ok: false, mensaje: (e as Error).message };
}

// ─── Listas ───────────────────────────────────────────
export async function guardarItem(_: Resultado | null, datos: FormData): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto(ROLES_EDITAN_LISTAS);
    const id = texto(datos, "id");
    const lista = texto(datos, "lista")!;
    const nombre = texto(datos, "nombre");
    if (!nombre) return { ok: false, mensaje: "Escribe el nombre." };
    const campos: Record<string, unknown> = { nombre, codigo: texto(datos, "codigo"), grupo: texto(datos, "grupo"), texto: texto(datos, "texto") };
    // Paraclínicos: unidad y rango de referencia (se combinan con lo que ya tenga datos, p. ej. códigos del SAME)
    if (lista === "paraclinico") {
      const numero = (k: string) => {
        const v = texto(datos, k);
        if (v === null) return null;
        const n = Number(v.replace(",", "."));
        if (!Number.isFinite(n)) throw new Error("El rango debe ser un número (usa coma o punto para los decimales).");
        return n;
      };
      const anterior = id ? (await supabase.from("lista_items").select("datos").eq("id", id).eq("org_id", sesion.orgId!).maybeSingle()).data?.datos : null;
      const r = { rango_min: numero("d_rango_min"), rango_max: numero("d_rango_max"), rango_min_f: numero("d_rango_min_f"), rango_max_f: numero("d_rango_max_f") };
      if (r.rango_min !== null && r.rango_max !== null && r.rango_min > r.rango_max) return { ok: false, mensaje: "El mínimo no puede ser mayor que el máximo." };
      campos.datos = { ...((anterior as Record<string, unknown>) ?? {}), tipo: texto(datos, "d_tipo") === "informe" ? "informe" : "numero", unidad: texto(datos, "d_unidad") ?? "", ...r };
    }

    if (id) {
      const { error } = await supabase.from("lista_items").update(campos).eq("id", id).eq("org_id", sesion.orgId!);
      if (error) throw error;
    } else {
      const { data: ultimo } = await supabase
        .from("lista_items").select("orden").eq("org_id", sesion.orgId!).eq("lista", lista)
        .order("orden", { ascending: false }).limit(1).maybeSingle();
      const { error } = await supabase.from("lista_items").insert({ ...campos, lista, org_id: sesion.orgId!, orden: (ultimo?.orden ?? 0) + 1 });
      if (error) throw error;
    }
    revalidatePath("/configuracion", "layout");
    return { ok: true, mensaje: "Guardado." };
  } catch (e) {
    return fallo(e);
  }
}

export async function alternarItem(id: string, activo: boolean): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto(ROLES_EDITAN_LISTAS);
    const { error } = await supabase.from("lista_items").update({ activo }).eq("id", id).eq("org_id", sesion.orgId!);
    if (error) throw error;
    revalidatePath("/configuracion", "layout");
    return { ok: true, mensaje: activo ? "Activado." : "Desactivado." };
  } catch (e) {
    return fallo(e);
  }
}

// Intercambia el orden con el vecino de arriba o de abajo
export async function moverItem(lista: string, id: string, direccion: -1 | 1): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto(ROLES_EDITAN_LISTAS);
    const { data } = await supabase
      .from("lista_items").select("id, orden").eq("org_id", sesion.orgId!).eq("lista", lista)
      .order("orden").order("nombre");
    const filas = data ?? [];
    const i = filas.findIndex((f) => f.id === id);
    const j = i + direccion;
    if (i < 0 || j < 0 || j >= filas.length) return { ok: true, mensaje: "" };
    // Renumera toda la lista para que el orden quede limpio
    const nuevo = [...filas];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    await Promise.all(nuevo.map((f, k) => supabase.from("lista_items").update({ orden: k + 1 }).eq("id", f.id)));
    revalidatePath("/configuracion", "layout");
    return { ok: true, mensaje: "" };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarItem(id: string): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto(ROLES_EDITAN_LISTAS);
    const { error } = await supabase.from("lista_items").delete().eq("id", id).eq("org_id", sesion.orgId!);
    if (error) {
      if (error.code === "23503") return { ok: false, mensaje: "Este valor ya se usa en registros. Desactívalo en lugar de eliminarlo." };
      throw error;
    }
    revalidatePath("/configuracion", "layout");
    return { ok: true, mensaje: "Eliminado." };
  } catch (e) {
    return fallo(e);
  }
}

// ─── Organización ─────────────────────────────────────
export async function guardarOrganizacion(_: Resultado | null, datos: FormData): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto(["administrador"]);
    const nombre = texto(datos, "nombre");
    if (!nombre) return { ok: false, mensaje: "Escribe el nombre." };
    const ajustes = {
      palabra_aptitud: texto(datos, "palabra_aptitud") ?? "Elegible",
      titulo_constancia: texto(datos, "titulo_constancia") ?? "Constancia de Aptitud",
      // Leyendas legales: vacío ("") = no imprimirla; null = la del Integral
      observacion_idoneidad: String(datos.get("observacion_idoneidad") ?? "").trim(),
      constancia_copias: datos.get("constancia_copias") === "on",
      firma_paciente_constancia: datos.get("firma_paciente_constancia") === "on",
      firma_medico_ocupacional: datos.get("firma_medico_ocupacional") === "on",
      reposo_pie_copia: texto(datos, "reposo_pie_copia"),
      reposo_pie_original: texto(datos, "reposo_pie_original"),
      orden_nota: texto(datos, "orden_nota"),
      orden_nota_preempleo: String(datos.get("orden_nota_preempleo") ?? "").trim(),
      mensaje_cita: texto(datos, "mensaje_cita"),
      mensaje_aptitud: texto(datos, "mensaje_aptitud"),
      certificado_titulo: texto(datos, "certificado_titulo"),
      certificado_nota: String(datos.get("certificado_nota") ?? "").trim(),
      firma_sello_separados: datos.get("firma_sello_separados") === "on",
      meses_examen_periodico: Number(texto(datos, "meses_examen_periodico") ?? 12) || 12,
      membrete_lema: texto(datos, "membrete_lema"),
      certificacion_trabajador: String(datos.get("certificacion_trabajador") ?? "").trim(),
    };
    const { error } = await supabase
      .from("organizaciones")
      .update({ nombre, rif: texto(datos, "rif"), direccion: texto(datos, "direccion"), telefono: texto(datos, "telefono"), correo: texto(datos, "correo"), ajustes })
      .eq("id", sesion.orgId!);
    if (error) throw error;
    invalidarSesion();
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Datos de la organización guardados." };
  } catch (e) {
    return fallo(e);
  }
}

// Logo del servicio de salud: va a la izquierda del membrete en todos los documentos (null lo quita)
export async function guardarLogoOrganizacion(logo: string | null): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto(["administrador"]);
    if (logo && (!/^data:image\/(png|jpeg|webp);base64,/.test(logo) || logo.length > 600_000)) return { ok: false, mensaje: "La imagen no es válida o es muy grande." };
    const { error } = await supabase.from("organizaciones").update({ logo }).eq("id", sesion.orgId!);
    if (error) throw error;
    revalidatePath("/configuracion/organizacion");
    return { ok: true, mensaje: logo ? "Logo guardado." : "Logo quitado." };
  } catch (e) {
    return fallo(e);
  }
}

// ─── Mi perfil ────────────────────────────────────────
export async function guardarPerfil(_: Resultado | null, datos: FormData): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto();
    const nombre = texto(datos, "nombre_completo");
    if (!nombre) return { ok: false, mensaje: "Escribe tu nombre." };
    const { error } = await supabase
      .from("perfiles")
      .update({
        nombre_completo: nombre,
        cedula: texto(datos, "cedula"),
        telefono: texto(datos, "telefono"),
        mpps: texto(datos, "mpps"),
        colegio_medicos: texto(datos, "colegio_medicos"),
        registro_inpsasel: texto(datos, "registro_inpsasel"),
        especialidad: texto(datos, "especialidad"),
        correo: texto(datos, "correo"),
      })
      .eq("id", sesion.usuarioId);
    if (error) throw error;
    invalidarSesion();
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Perfil guardado." };
  } catch (e) {
    return fallo(e);
  }
}

// ─── Usuarios ─────────────────────────────────────────
export async function agregarUsuario(_: Resultado | null, datos: FormData): Promise<Resultado> {
  try {
    const { supabase } = await contexto(["administrador"]);
    const correo = texto(datos, "correo");
    const rol = texto(datos, "rol") as Rol | null;
    if (!correo || !rol) return { ok: false, mensaje: "Escribe el correo y elige el rol." };
    const empresas = datos.getAll("empresas").map(String).filter(Boolean);
    const { error } = await supabase.rpc("agregar_miembro", { p_correo: correo, p_rol: rol, p_empresas: empresas.length ? empresas : null });
    if (error) return { ok: false, mensaje: error.message };
    invalidarSesion();
    revalidatePath("/configuracion/usuarios");
    return { ok: true, mensaje: `${correo} agregado.` };
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarRol(miembroId: string, rol: Rol, activo: boolean, accesoClinico: boolean): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto(["administrador"]);
    const { data: m } = await supabase.from("miembros").select("usuario_id").eq("id", miembroId).maybeSingle();
    if (m?.usuario_id === sesion.usuarioId && (rol !== "administrador" || !activo)) {
      return { ok: false, mensaje: "No puedes quitarte a ti mismo el rol de administrador." };
    }
    const { error } = await supabase.from("miembros").update({ rol, activo, acceso_clinico: accesoClinico }).eq("id", miembroId);
    if (error) throw error;
    invalidarSesion();
    revalidatePath("/configuracion/usuarios");
    return { ok: true, mensaje: "Usuario actualizado." };
  } catch (e) {
    return fallo(e);
  }
}

// Firma y sello del médico (imagen PNG en data URL, ya reducida en el navegador) y si se imprimen
export async function guardarImagenFirma(tipo: "firma" | "sello", imagen: string | null): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto();
    if (imagen && (!/^data:image\/(png|jpeg);base64,/.test(imagen) || imagen.length > 600_000)) return { ok: false, mensaje: "La imagen no es válida o es muy grande." };
    const { error } = await supabase.from("perfiles").update({ [`${tipo}_url`]: imagen }).eq("id", sesion.usuarioId);
    if (error) throw error;
    revalidatePath("/configuracion/perfil");
    return { ok: true, mensaje: imagen ? (tipo === "firma" ? "Firma guardada." : "Sello guardado.") : "Imagen quitada." };
  } catch (e) {
    return fallo(e);
  }
}

export async function mostrarFirmaSello(campo: "mostrar_firma" | "mostrar_sello", valor: boolean): Promise<Resultado> {
  try {
    const { sesion, supabase } = await contexto();
    const { error } = await supabase.from("perfiles").update({ [campo]: valor }).eq("id", sesion.usuarioId);
    if (error) throw error;
    return { ok: true, mensaje: "Guardado." };
  } catch (e) {
    return fallo(e);
  }
}

// Revocar o reactivar una PC registrada. La RLS de equipos solo deja al administrador; la PC revocada deja de sincronizar.
export async function activarEquipo(id: string, activo: boolean): Promise<{ ok: boolean; mensaje: string }> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { ok: false, mensaje: "En modo demo no se guardan cambios." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("equipos").update({ activo }).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/configuracion/equipos");
  return { ok: true, mensaje: activo ? "Equipo reactivado." : "Equipo revocado: deja de sincronizar desde ya." };
}
