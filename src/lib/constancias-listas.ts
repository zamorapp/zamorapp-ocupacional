import "server-only";
import { after } from "next/server";
import { performance } from "node:perf_hooks";
import { supabaseConfigurado } from "@/lib/config";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { subirAhora } from "@/lib/envios";
import { cookieDeSesion, pdfDeRutas } from "@/lib/pdf-servidor";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Constancias de aptitud listas para RR. HH. (Cesar, 31-oct): el PDF de la constancia de una consulta firmada se arma
// con la sesión del personal de salud y se guarda en la base (guardar_constancia_lista), que responde sola las
// solicitudes «Copia de constancia de aptitud» que lo esperaban y lo deja para el correo diario de la empresa.
// Solo se arma lo que alguien espera (constancias_por_preparar): una solicitud abierta o el envío automático activo.
// Nunca hace fallar la firma ni la pantalla: corre después de responder (after) y se traga los errores.

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;
export type ResultadoPreparar = { preparadas: number; respondidas: number; error?: string };

async function preparar(supabase: Cliente, cookie: string, consultas: string[] | null, limite: number): Promise<ResultadoPreparar> {
  const salida: ResultadoPreparar = { preparadas: 0, respondidas: 0 };
  // Escritorio: la firma se guarda primero en la PC; la nube tiene que verla firmada antes de preparar la constancia
  if (ESCRITORIO && consultas?.length && (await subirAhora(supabase, consultas)) === null) return { ...salida, error: "sin internet" };
  const { data, error } = await supabase.rpc("constancias_por_preparar", { p_consultas: consultas, p_limite: limite });
  if (error) return { ...salida, error: error.message };
  for (const { consulta_id: id } of (data ?? []) as { consulta_id: string }[]) {
    try {
      // Solo el original (sin la copia para el servicio): es lo que recibe RR. HH.
      const [pdf] = await pdfDeRutas([`/imprimir/constancia/${id}?copia=0`], cookie);
      const { data: n, error: e } = await supabase.rpc("guardar_constancia_lista", { p_consulta: id, p_pdf_base64: pdf.toString("base64") });
      if (e) throw new Error(e.message);
      salida.preparadas++;
      salida.respondidas += Number(n ?? 0);
    } catch (e) {
      salida.error = (e as Error).message;
      console.error("constancia lista:", id, salida.error);
    }
  }
  return salida;
}

// Tras firmar (una o varias): arma ya las constancias que alguien espera
export async function prepararConstanciasLuego(consultas: string[]) {
  if (!supabaseConfigurado || !consultas.length) return;
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return;
  const [supabase, cookie] = await Promise.all([crearClienteServidor(), cookieDeSesion()]);
  after(() => preparar(supabase, cookie, consultas.slice(0, 50), 50).catch((e) => console.error("constancias tras firmar:", e)));
}

// Barrido al abrir Inicio o Solicitudes: lo firmado sin internet, en otra pantalla o antes de que RR. HH. lo pidiera.
// Como mucho uno cada 5 minutos por servidor (reloj del proceso, no la fecha de Windows) y 5 constancias por vez.
let ultimoBarrido = -Infinity;
export async function barrerConstancias() {
  if (!supabaseConfigurado || performance.now() - ultimoBarrido < 5 * 60_000) return;
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return;
  ultimoBarrido = performance.now();
  const [supabase, cookie] = await Promise.all([crearClienteServidor(), cookieDeSesion()]);
  after(() => preparar(supabase, cookie, null, 5).catch((e) => console.error("barrido de constancias:", e)));
}
