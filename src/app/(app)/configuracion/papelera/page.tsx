import type { Metadata } from "next";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { listarResumen } from "@/lib/papelera";
import { Volver } from "../volver";
import { BotonRestaurar } from "./restaurar";

export const metadata: Metadata = { title: "Papelera" };
export const dynamic = "force-dynamic";

type Entrada = {
  id: string; tipo: "consulta" | "trabajador"; titulo: string; motivo: string; resumen: Record<string, number>;
  eliminado_en: string; restaurado_en: string | null;
};

const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(iso));

export default async function Papelera() {
  const sesion = await obtenerSesion();
  const puede = !sesion.demo && Boolean(sesion.orgId) && sesion.rol === "administrador" && sesion.clinico;
  let entradas: Entrada[] = [];
  let error = "";
  if (puede) {
    const supabase = await crearClienteServidor();
    const { data, error: e } = await supabase.from("papelera")
      .select("id, tipo, titulo, motivo, resumen, eliminado_en, restaurado_en")
      .order("eliminado_en", { ascending: false }).limit(200);
    if (e) error = e.code === "42P01" || e.code === "PGRST205" ? "Falta aplicar la actualización de la base (papelera)." : e.message;
    entradas = (data ?? []) as Entrada[];
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Papelera</h1>
        <p className="text-muted-foreground">
          Consultas y trabajadores eliminados por el administrador, con el motivo. «Restaurar» los devuelve idénticos: misma firma,
          mismo número de historia y unidos otra vez a sus reposos, citas y cobros. Nada se borra de aquí por sí solo.
        </p>
      </div>
      {!puede ? (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">Solo el administrador con acceso clínico ve la papelera.</p>
      ) : error ? (
        <p role="alert" className="rounded-lg bg-alerta/10 px-4 py-3 text-sm text-alerta-texto">{error}</p>
      ) : entradas.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">La papelera está vacía.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {entradas.map((e) => {
            const junto = listarResumen(e.resumen, e.tipo === "consulta" ? "clinico.consultas" : "public.trabajadores");
            return (
              <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64 space-y-0.5">
                  <div className="font-medium">
                    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{e.tipo === "consulta" ? "Consulta" : "Trabajador"}</span>
                    {e.titulo}
                  </div>
                  <div className="text-sm text-muted-foreground">Eliminado el {fechaHora(e.eliminado_en)} · {e.motivo}</div>
                  {junto && <div className="text-xs text-muted-foreground">Con: {junto}</div>}
                </div>
                {e.restaurado_en
                  ? <span className="text-sm text-muted-foreground">Restaurado el {fechaHora(e.restaurado_en)}</span>
                  : <BotonRestaurar id={e.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
