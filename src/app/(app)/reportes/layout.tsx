import { Suspense } from "react";
import { NavReportes } from "./nav-reportes";

export default function LayoutReportes({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Suspense>
        <NavReportes />
      </Suspense>
      {children}
    </div>
  );
}
