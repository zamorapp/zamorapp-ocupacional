import type { Metadata } from "next";
import { ACCIONES } from "@/lib/agentes/acciones";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Volver } from "../volver";
import { PantallaAgentes, type EstadoAgentes } from "./pantalla";

export const metadata: Metadata = { title: "Puerta para agentes" };
export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default async function Agentes({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const q = await searchParams;
  const sesion = await obtenerSesion();
  const puede = !sesion.demo && Boolean(sesion.orgId) && sesion.rol === "administrador";
  let estado: EstadoAgentes | null = null;
  let error = "";
  if (puede) {
    const supabase = await crearClienteServidor();
    const { data, error: e } = await supabase.rpc("agentes_estado" as never, {
      p_org: sesion.orgId, p_desde: FECHA.test(q.desde ?? "") ? q.desde : null, p_hasta: FECHA.test(q.hasta ?? "") ? q.hasta : null,
    } as never);
    if (e) {
      error = e.code === "PGRST202" ? "Falta aplicar la actualización de la base (puerta para agentes)."
        : /fetch failed|network|timeout/i.test(e.message) ? "Sin internet no se puede ver: la puerta para agentes vive en la nube. Vuelve a entrar cuando haya conexión."
        : e.message;
    } else estado = data as unknown as EstadoAgentes;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Puerta para agentes</h1>
        <p className="text-muted-foreground">
          Deja que Claude, ChatGPT, Gemini u otro agente trabaje en zamorApp por ti, solo cuando tú lo enciendes y solo en lo que aparece aquí.
        </p>
      </div>
      {!puede ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm">Solo el administrador maneja la puerta para agentes.</p>
      ) : error ? (
        <p role="alert" className="rounded-lg border border-alerta/40 bg-alerta/5 p-4 text-sm text-alerta-texto">{error}</p>
      ) : estado ? (
        <PantallaAgentes estado={estado} titulos={Object.fromEntries(ACCIONES.map((a) => [a.nombre, a.titulo]))}
          consultas={ACCIONES.filter((a) => !a.crea && !a.documentos).map((a) => a.titulo)} creaciones={ACCIONES.filter((a) => a.crea && !a.documentos).map((a) => a.titulo)} />
      ) : null}
    </div>
  );
}
