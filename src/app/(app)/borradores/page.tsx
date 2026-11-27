import type { Metadata } from "next";
import { obtenerSesion } from "@/lib/sesion";
import { borradoresPorRevisar, revisaBorradores } from "@/lib/agentes/borradores";
import { ListaBorradores } from "./lista";
import { cambiosCitasPorRevisar, revisaCambiosCitas } from "@/lib/agentes/cambios-citas";
import { ListaCambiosCitas } from "./cambios-citas";

export const metadata: Metadata = { title: "Borradores del agente" };
export const dynamic = "force-dynamic";

export default async function Borradores() {
  const sesion = await obtenerSesion();
  const puedeDocumentos = revisaBorradores(sesion);
  const puedeAgenda = revisaCambiosCitas(sesion);
  const [items, citas] = await Promise.all([
    puedeDocumentos ? borradoresPorRevisar() : [],
    puedeAgenda ? cambiosCitasPorRevisar(sesion) : [],
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Borradores del agente</h1>
        <p className="text-muted-foreground">
          Revisa los documentos y cambios de agenda que preparó tu agente.
        </p>
      </div>
      {puedeAgenda && <ListaCambiosCitas items={citas} />}
      {puedeDocumentos && (
        <section aria-labelledby="documentos-agente" className="space-y-3">
          <h2 id="documentos-agente" className="text-lg font-semibold">Documentos por revisar</h2>
          <p className="text-sm text-muted-foreground">Las constancias usan la aptitud y la firma de la consulta original. Los borradores de documentos se borran solos a los 30 días.</p>
          <ListaBorradores items={items} />
        </section>
      )}
      {!puedeDocumentos && !puedeAgenda && <p className="rounded-lg border bg-muted/40 p-4 text-sm">Esta cuenta no tiene borradores para revisar.</p>}
    </div>
  );
}
