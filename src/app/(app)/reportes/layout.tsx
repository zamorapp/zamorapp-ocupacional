import { Suspense } from "react";
import { ajustesEnfermeria } from "@/lib/enfermeria";
import { NavReportes } from "./nav-reportes";

export default async function LayoutReportes({ children }: { children: React.ReactNode }) {
  // Reportes que el médico decide mostrar (Enfermería › Tus decisiones)
  const { enfermeria_unida } = await ajustesEnfermeria();
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Suspense>
        <NavReportes unida={enfermeria_unida === true} />
      </Suspense>
      {children}
    </div>
  );
}
