"use server";

import { revalidatePath } from "next/cache";
import { cedulaNomina, type FilaNomina } from "@/lib/nomina";
import { dma, type RevisionDepuracion } from "@/lib/depurar-nomina";
import { URL_PUBLICA } from "@/lib/invitaciones";
import { hoyCaracas } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { aplicarParteNomina, deshacerNomina, type Deshecho } from "../../pacientes/importar/acciones-nomina";

// Lado de Cesar del enlace de RR. HH. para depurar la nómina (12-nov-2026). Administrador o personal de salud; la base
// lo vuelve a exigir. Confirmar usa aplicar_nomina (la misma de «Actualizar nómina»): queda «Deshacer» ese día.

type R<T = object> = { ok: boolean; mensaje: string } & Partial<T>;
const UUID = /^[0-9a-f-]{36}$/i;

async function permiso() {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return "Conecta Supabase para usar el enlace de RR. HH.";
  if (!(sesion.clinico || sesion.rol === "administrador")) return "Solo el administrador o el personal de salud depuran la nómina.";
  return null;
}

const sinRed = (m: string) => /fetch|internet|503|network/i.test(m);

export async function revisionDepuracion(empresaId: string): Promise<RevisionDepuracion | null> {
  if (await permiso() || !UUID.test(empresaId)) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("revision_depuracion_nomina", { p_empresa: empresaId });
  return error ? null : (data as RevisionDepuracion | null);
}

/**
 * Crea el enlace para una persona de RR. HH. (su teléfono es la llave) o, si ya hay uno vigente y no se pide nuevo,
 * devuelve ese. nuevo=true: el anterior deja de servir; lo marcado se conserva. Arma el mensaje de WhatsApp.
 */
export async function crearEnlaceDepuracion(empresaId: string, empresa: string, nombre: string, telefono: string, nuevo = false): Promise<R<{ enlace: string; mensaje_wa: string }>> {
  const p = await permiso();
  if (p) return { ok: false, mensaje: p };
  if (!UUID.test(empresaId)) return { ok: false, mensaje: "Elige la empresa." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_depuracion_nomina", {
    p_empresa: empresaId, p_nombre: nombre.trim().slice(0, 120) || null, p_telefono: telefono.slice(0, 30), p_dias: 7, p_nuevo: nuevo,
  });
  if (error || typeof data !== "string") {
    return {
      ok: false,
      mensaje: error?.code === "23514" ? error.message
        : error && sinRed(error.message) ? "El enlace vive en la nube: hace falta internet para crearlo." : "No se pudo crear el enlace: " + (error?.message ?? ""),
    };
  }
  revalidatePath(`/empresas/${empresaId}`);
  const enlace = `${URL_PUBLICA}/nomina/${data}`;
  const saludo = nombre.trim() ? `Buenos días, ${nombre.trim().split(" ")[0]}.` : "Buenos días.";
  const mensaje_wa = [
    `${saludo} Para poner al día la nómina de ${empresa} en nuestro servicio de salud ocupacional, le agradezco revisar esta lista:`,
    enlace,
    "",
    "1. En cada trabajador toque «Sigue» o «Ya no está».",
    "2. Si falta alguien, agréguelo con su nombre y apellido.",
    "3. Al terminar, toque «Enviar».",
    "",
    "Por seguridad le pedirá su número de teléfono y solo se abre en el teléfono donde lo abra primero. No necesita crear cuenta y se guarda solo. Vale 7 días.",
  ].join("\n");
  return { ok: true, mensaje: "", enlace, mensaje_wa };
}

/** «Permitir otro teléfono»: suelta el aparato amarrado y desbloquea. */
export async function liberarEnlaceDepuracion(empresaId: string, id: string): Promise<R> {
  const p = await permiso();
  if (p) return { ok: false, mensaje: p };
  if (!UUID.test(id)) return { ok: false, mensaje: "Datos no válidos." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("liberar_depuracion_nomina", { p_id: id });
  revalidatePath(`/empresas/${empresaId}`);
  return error ? { ok: false, mensaje: "No se pudo: " + error.message } : { ok: true, mensaje: "Listo: RR. HH. puede abrir el enlace en otro teléfono (con su número)." };
}

export async function anularEnlaceDepuracion(empresaId: string, id: string): Promise<R> {
  const p = await permiso();
  if (p) return { ok: false, mensaje: p };
  if (!UUID.test(id)) return { ok: false, mensaje: "Datos no válidos." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_depuracion_nomina", { p_id: id });
  revalidatePath(`/empresas/${empresaId}`);
  return error ? { ok: false, mensaje: "No se pudo anular: " + error.message } : { ok: true, mensaje: "Enlace anulado: RR. HH. ya no puede abrirlo." };
}

/**
 * Confirmar lo que propuso RR. HH.: inactiva a los elegidos (agrupados por motivo, todos en un solo «Deshacer») y
 * agrega a la nómina a los nuevos con cédula. Todo sale de la revisión que se lee AQUÍ de la base, nunca del navegador:
 * el navegador solo dice cuáles de esa lista se quitan.
 */
export async function confirmarDepuracion(empresaId: string, id: string, inactivar: string[], agregar: string[]): Promise<R<{ lote: string; inactivados: number; nuevos: number }>> {
  const p = await permiso();
  if (p) return { ok: false, mensaje: p };
  if (!UUID.test(empresaId) || !UUID.test(id)) return { ok: false, mensaje: "Datos no válidos." };
  const rev = await revisionDepuracion(empresaId);
  if (!rev || rev.id !== id) return { ok: false, mensaje: "La revisión cambió. Recarga la página." };
  if (rev.estado === "aplicado" || rev.estado === "anulado") return { ok: false, mensaje: "Esta revisión ya se cerró." };

  const elegidos = new Set(inactivar);
  const salen = rev.no_estan.filter((n) => n.en_nomina && elegidos.has(n.id));
  const quieren = new Set(agregar);
  const nuevos: FilaNomina[] = rev.agregados
    .filter((a) => quieren.has(a.id) && a.cedula && !a.registrado)
    .map((a, i) => ({
      fila: i + 1, cedula: cedulaNomina(a.cedula) ?? a.cedula!, valida: Boolean(cedulaNomina(a.cedula)), sigue: true, avisos: [],
      datos: { nombres: a.nombres, apellidos: a.apellidos, ...(a.cargo ? { cargo: a.cargo } : {}) },
    }));
  if (!salen.length && !nuevos.length) return { ok: false, mensaje: "No hay nada marcado para confirmar." };

  // Un llamado por motivo (el motivo queda en la ficha de cada uno); el primero crea el registro y lleva a los nuevos
  const grupos = new Map<string, string[]>();
  for (const s of salen) {
    const motivo = `Ya no está según RR. HH. (${dma(hoyCaracas())})${s.motivo ? `: ${s.motivo}` : ""}`;
    grupos.set(motivo, [...(grupos.get(motivo) ?? []), s.id]);
  }
  if (!grupos.size) grupos.set("", []);
  let lote: string | null = null;
  let inactivados = 0;
  let agregados = 0;
  for (const [motivo, ids] of grupos) {
    const r = await aplicarParteNomina(empresaId, lote, `Enlace RR. HH. ${dma(hoyCaracas())}`, lote ? [] : nuevos, { identidad: false, excluir: [] }, ids, motivo);
    if (!r.ok || !r.parte) {
      return { ok: false, mensaje: (r.mensaje || "No se pudo confirmar.") + (lote ? " Lo anterior sí quedó: puedes deshacerlo hoy." : ""), lote: lote ?? undefined };
    }
    lote = r.parte.lote;
    inactivados += r.parte.inactivados;
    agregados += r.parte.nuevos;
  }
  const supabase = await crearClienteServidor();
  await supabase.rpc("cerrar_depuracion_nomina", { p_id: id, p_lote: lote });
  revalidatePath(`/empresas/${empresaId}`);
  return {
    ok: true, lote: lote!, inactivados, nuevos: agregados,
    mensaje: `Listo: ${inactivados} ${inactivados === 1 ? "inactivado" : "inactivados"} y ${agregados} ${agregados === 1 ? "agregado" : "agregados"} a la nómina.`,
  };
}

export async function deshacerDepuracion(empresaId: string, lote: string): Promise<R<{ deshecho: Deshecho }>> {
  const r = await deshacerNomina(lote);
  revalidatePath(`/empresas/${empresaId}`);
  return r;
}
