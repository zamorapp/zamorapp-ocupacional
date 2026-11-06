import type { Metadata } from "next";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Volver } from "../volver";
import { PantallaLimpieza } from "./pantalla";
import type { EstadoLimpieza } from "./reglas";

export const metadata: Metadata = { title: "Limpieza" };
export const dynamic = "force-dynamic";

export default async function Limpieza() {
  const sesion = await obtenerSesion();
  const puede = !sesion.demo && Boolean(sesion.orgId) && sesion.rol === "administrador";
  let estado: EstadoLimpieza | null = null;
  let error = "";
  if (puede) {
    const supabase = await crearClienteServidor();
    const { data, error: e } = await supabase.rpc("limpieza_estado" as never);
    if (e) error = e.code === "PGRST202" ? "Falta aplicar la actualización de la base (limpieza)." : e.message;
    else estado = data as unknown as EstadoLimpieza;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Limpieza</h1>
        <p className="text-muted-foreground">
          Lo temporal se borra solo cada madrugada, según el plazo de cada fila. Aquí ves cuánto hay, cambias los plazos o limpias ya.
        </p>
      </div>
      {!puede ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm">Solo el administrador ve la limpieza.</p>
      ) : error ? (
        <p role="alert" className="rounded-lg border border-alerta/40 bg-alerta/5 p-4 text-sm text-alerta-texto">{error}</p>
      ) : estado ? (
        <PantallaLimpieza estado={estado} />
      ) : null}
    </div>
  );
}
