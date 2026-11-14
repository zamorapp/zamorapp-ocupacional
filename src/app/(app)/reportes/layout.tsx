import { Suspense } from "react";
import { contarPropuestas, revisaPropuestas } from "@/lib/agentes/propuestas";
import { ajustesEnfermeria } from "@/lib/enfermeria";
import { obtenerSesion } from "@/lib/sesion";
import { NavReportes } from "./nav-reportes";

export default async function LayoutReportes({ children }: { children: React.ReactNode }) {
  // Reportes que el médico decide mostrar (Enfermería › Tus decisiones)
  const [{ enfermeria_unida }, sesion] = await Promise.all([ajustesEnfermeria(), obtenerSesion()]);
  // Propuestas del agente por revisar (puerta para agentes): la pastilla sale solo si hay alguna
  const propuestas = revisaPropuestas(sesion) ? await contarPropuestas() : 0;
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Suspense>
        <NavReportes unida={enfermeria_unida === true} propuestas={propuestas} />
      </Suspense>
      {children}
    </div>
  );
}
