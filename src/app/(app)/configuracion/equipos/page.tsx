import type { Metadata } from "next";
import { Laptop } from "lucide-react";
import { listarEquipos } from "@/lib/auditoria";
import { obtenerSesion } from "@/lib/sesion";
import { Volver } from "../volver";
import { ListaEquipos } from "./lista-equipos";

export const metadata: Metadata = { title: "Equipos" };
export const dynamic = "force-dynamic";

export default async function Equipos() {
  const sesion = await obtenerSesion();
  const admin = sesion.rol === "administrador";
  const equipos = admin && !sesion.demo ? await listarEquipos() : [];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Equipos</h1>
        <p className="text-muted-foreground">Las PC con zamorApp instalado y los celulares preparados para trabajar sin internet, con copia local de los datos. Cada uno tiene su serie para numerar sin choques. Para preparar un celular, abre <span className="font-medium">/movil</span> en su app de zamorApp.</p>
      </div>
      {!admin && !sesion.demo ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Solo el administrador gestiona los equipos.</p>
      ) : equipos.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          <Laptop className="size-8" />
          Aún no hay equipos registrados. Aparecerán aquí cuando instales zamorApp para escritorio o prepares un celular con tu usuario de administrador.
        </div>
      ) : (
        <ListaEquipos equipos={equipos} />
      )}
    </div>
  );
}
