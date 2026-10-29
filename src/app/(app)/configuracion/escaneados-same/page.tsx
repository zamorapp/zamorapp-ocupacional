import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerSesion } from "@/lib/sesion";
import { Volver } from "../volver";
import { ImportarEscaneados } from "./importar-escaneados";

export const metadata: Metadata = { title: "Escaneados del SAME" };

// Una sola vez: sube los escaneados que preparó scripts/importar-integral/escaneados.ps1 en la PC del SAME.
// Se suben con la sesión de quien importa (RLS de adjuntos), nunca con claves de servicio.
export default async function Pagina() {
  const sesion = await obtenerSesion();
  if (!sesion.clinico || (sesion.rol !== "administrador" && sesion.rol !== "gerente_medico")) notFound();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Escaneados del SAME</h1>
        <p className="text-muted-foreground">
          Elige la carpeta <code className="rounded bg-muted px-1">.zamorapp\escaneados-same</code> que preparó el cargador en la PC del SAME. Cada archivo va a la historia de su paciente; los que ya estén se saltan.
        </p>
      </div>
      <ImportarEscaneados demo={sesion.demo} />
    </div>
  );
}
