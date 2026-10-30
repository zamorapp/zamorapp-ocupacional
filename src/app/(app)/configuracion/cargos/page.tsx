import type { Metadata } from "next";
import { agruparRepetidos, type CargoOrg } from "@/lib/cargos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Volver } from "../volver";
import { UnirCargos } from "./unir-cargos";

export const metadata: Metadata = { title: "Unir cargos" };
export const dynamic = "force-dynamic";

export default async function Cargos() {
  const sesion = await obtenerSesion();
  const puede = !sesion.demo && sesion.rol === "administrador";
  let cargos: CargoOrg[] = [];
  let error = "";
  if (puede) {
    const supabase = await crearClienteServidor();
    const { data, error: e } = await supabase.rpc("cargos_de_la_org");
    if (e) error = e.message;
    cargos = ((data ?? []) as { id: string; empresa_id: string; empresa: string; nombre: string; trabajadores: number }[])
      .map((c) => ({ id: c.id, empresaId: c.empresa_id, empresa: c.empresa, nombre: c.nombre, trabajadores: Number(c.trabajadores) }));
  }
  const grupos = agruparRepetidos(cargos);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Unir cargos</h1>
        <p className="text-muted-foreground">
          El mismo cargo escrito de varias formas, en todas las empresas. Elige el nombre que queda: los trabajadores pasan a él y
          las variantes quedan como alias. No se borra ningún trabajador ni historia; las consultas firmadas conservan su texto.
        </p>
      </div>
      {!puede ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Solo el administrador une cargos.</p>
      ) : error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">No se pudieron leer los cargos: {error}</p>
      ) : (
        <UnirCargos grupos={grupos} total={cargos.length} />
      )}
    </div>
  );
}
