import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { MANUAL, MANUAL_ACTUALIZADO, NOVEDADES } from "@/lib/manual";
import { obtenerSesion } from "@/lib/sesion";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { BotonImprimir } from "./imprimir";
import { ManualBuscable } from "./manual-buscable";

export const metadata: Metadata = { title: "Manual de uso" };

export default async function Ayuda() {
  const sesion = await obtenerSesion();
  const empresa = esRolEmpresa(sesion.rol);
  const temas = MANUAL.filter((t) => t.para === "todos" || t.para === (empresa ? "empresa" : "servicio"));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl"><BookOpen className="text-primary" /> Manual de uso</h1>
          <p className="text-muted-foreground">Cómo usar cada parte de zamorApp. Actualizado el {MANUAL_ACTUALIZADO.split("-").reverse().join("/")}.</p>
        </div>
        <BotonImprimir />
      </div>

      <ManualBuscable temas={temas} novedades={NOVEDADES} />
    </div>
  );
}
