import type { Metadata } from "next";
import Link from "next/link";
import { itemsDeLista, listarListas, SECCIONES_LISTAS } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { Volver } from "../volver";
import { EditorLista } from "./editor-lista";

export const metadata: Metadata = { title: "Listas configurables" };

export default async function Listas({ searchParams }: { searchParams: Promise<{ l?: string }> }) {
  const [{ l }, sesion] = await Promise.all([searchParams, obtenerSesion()]);
  const listas = await listarListas(sesion.orgId);
  const porCodigo = new Map(listas.map((x) => [x.codigo, x]));
  const actual = porCodigo.get(l ?? "") ?? porCodigo.get("motivo_consulta") ?? listas[0];
  const [items, motivos] = actual
    ? await Promise.all([itemsDeLista(sesion.orgId, actual.codigo), itemsDeLista(sesion.orgId, "motivo_consulta", true)])
    : [[], []];
  const editable = !sesion.demo && (sesion.rol === "administrador" || sesion.rol === "gerente_medico");

  // Las listas que no estén en ninguna sección también se muestran
  const enSecciones = new Set(SECCIONES_LISTAS.flatMap((s) => s.codigos));
  const secciones = [
    ...SECCIONES_LISTAS,
    { titulo: "Más listas", codigos: listas.map((x) => x.codigo).filter((c) => !enSecciones.has(c)) },
  ].filter((s) => s.codigos.some((c) => porCodigo.has(c)));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Listas configurables</h1>
        <p className="text-muted-foreground">Agrega, edita, ordena o desactiva los valores que aparecen en los formularios.</p>
      </div>

      {listas.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          Conecta Supabase para editar las listas.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            {secciones.map((s) => (
              <div key={s.titulo}>
                <div className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.titulo}</div>
                {s.codigos.filter((c) => porCodigo.has(c)).map((c) => {
                  const x = porCodigo.get(c)!;
                  return (
                    <Link
                      key={c}
                      href={`/configuracion/listas?l=${c}`}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition",
                        c === actual?.codigo ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
                      )}
                    >
                      <span className="truncate">{x.nombre}</span>
                      <span className="text-xs text-muted-foreground">{x.total}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          {actual && <EditorLista
              key={actual.codigo}
              lista={actual}
              items={items}
              editable={editable}
              motivos={motivos.filter((m) => m.codigo).map((m) => ({ codigo: m.codigo!, nombre: m.nombre }))}
            />}
        </div>
      )}
    </div>
  );
}
