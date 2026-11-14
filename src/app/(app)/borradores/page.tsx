import type { Metadata } from "next";
import { obtenerSesion } from "@/lib/sesion";
import { borradoresPorRevisar, revisaBorradores } from "@/lib/agentes/borradores";
import { ListaBorradores } from "./lista";

export const metadata: Metadata = { title: "Borradores del agente" };
export const dynamic = "force-dynamic";

// Récipes y órdenes de exámenes que preparó un agente (puerta para agentes). Nada se imprime ni se envía hasta que
// el médico lo revisa y lo emite con su sesión: entonces sale con su firma y sello.
export default async function Borradores() {
  const sesion = await obtenerSesion();
  const puede = revisaBorradores(sesion);
  const items = puede ? await borradoresPorRevisar() : [];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Borradores del agente</h1>
        <p className="text-muted-foreground">
          Récipes y órdenes que te preparó tu agente. Revísalos, corrige lo que haga falta y emítelos: salen con tu firma y sello. Si no los revisas, se borran solos a los 30 días.
        </p>
      </div>
      {!puede ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm">Los borradores del agente los revisa el médico.</p>
      ) : (
        <ListaBorradores items={items} />
      )}
    </div>
  );
}
