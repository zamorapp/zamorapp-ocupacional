import type { Metadata } from "next";
import { propuestas, revisaPropuestas, SECCIONES_PROPUESTA } from "@/lib/agentes/propuestas";
import { obtenerSesion } from "@/lib/sesion";
import { SECCIONES_ANALISIS } from "@/lib/vigilancia-analisis";
import { ListaPropuestas } from "./lista";

export const metadata: Metadata = { title: "Propuestas del agente" };
export const dynamic = "force-dynamic";

// Lo que propuso un agente por la puerta (programas de vigilancia, ajustes de la empresa, borradores del informe…).
// Nada cambia hasta que el médico pulsa «Aprobar» (o «Usar» sección por sección en el informe).
export default async function Propuestas({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const [q, sesion] = await Promise.all([searchParams, obtenerSesion()]);
  const puede = revisaPropuestas(sesion);
  const { pendientes, resueltas } = puede ? await propuestas() : { pendientes: [], resueltas: [] };
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Propuestas del agente</h1>
        <p className="text-muted-foreground">
          Lo que tu agente preparó por la puerta para agentes. Nada cambia hasta que lo apruebas. Si no lo revisas, se borra solo a los 30 días.
        </p>
      </div>
      {!puede ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm">Las propuestas del agente las revisa el servicio médico o el administrador.</p>
      ) : (
        <ListaPropuestas pendientes={pendientes} resueltas={resueltas} abierta={q.id ?? null}
          secciones={SECCIONES_PROPUESTA} analisis={SECCIONES_ANALISIS.map(([k, t]) => [k, t] as [string, string])} />
      )}
    </div>
  );
}
