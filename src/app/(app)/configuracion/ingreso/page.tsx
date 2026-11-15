import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";
import { obtenerSesion } from "@/lib/sesion";
import { Volver } from "../volver";
import { HuellaCuenta } from "@/components/app/huella";
import { DosPasosCuenta } from "@/components/app/dos-pasos-cuenta";

export const metadata: Metadata = { title: "Ingreso y seguridad" };

export default async function Ingreso() {
  const sesion = await obtenerSesion();
  const escritorio = process.env.NEXT_PUBLIC_ESCRITORIO === "1";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Volver />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl"><Fingerprint className="size-7 text-primary" /> Ingreso y seguridad</h1>
        <p className="text-muted-foreground">
          {escritorio ? "Entra con Windows Hello (huella, rostro o PIN) en vez de la clave, también sin internet." : "Entra con la huella del equipo y maneja la verificación en dos pasos."}
        </p>
      </div>
      {sesion.demo ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">En modo demo no se activa la huella.</p>
      ) : (
        <>
          <HuellaCuenta />
          {/* En el escritorio la sesión es de la puerta local: la verificación se activa en la web */}
          {!escritorio && <DosPasosCuenta obligatoria={sesion.rol === "administrador" || sesion.rol === "gerente_medico"} />}
        </>
      )}
    </div>
  );
}
