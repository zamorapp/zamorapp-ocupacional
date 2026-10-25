import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { ImportadorCitas } from "./importador-citas";

export const metadata: Metadata = { title: "Citas por lote" };

export default async function CitasLote() {
  const sesion = await obtenerSesion();
  const { motivo_consulta } = await opciones(sesion.orgId, ["motivo_consulta"]);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/atencion" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Atención médica
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Citas por lote</h1>
        <p className="text-muted-foreground">Sube el Excel que envía la empresa (jornadas de periódicos, pre-vacacionales…) y se agendan todas de una vez.</p>
      </div>
      <ImportadorCitas motivos={motivo_consulta.map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo }))} />
    </div>
  );
}
