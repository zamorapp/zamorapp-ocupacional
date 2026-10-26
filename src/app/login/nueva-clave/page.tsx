import type { Metadata } from "next";
import { APP_NOMBRE } from "@/lib/config";
import { FormularioNuevaClave } from "./formulario";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function NuevaClave() {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div>
          <p className="text-sm font-medium text-primary">{APP_NOMBRE}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Crea tu contraseña nueva</h1>
        </div>
        <FormularioNuevaClave />
      </div>
    </main>
  );
}
