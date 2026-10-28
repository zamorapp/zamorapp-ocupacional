import type { Metadata } from "next";
import { APP_NOMBRE } from "@/lib/config";
import { FormularioDosPasos } from "./formulario";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

export default function DosPasos() {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-primary">{APP_NOMBRE}</p>
        <FormularioDosPasos />
      </div>
    </main>
  );
}
