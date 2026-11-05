"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CAMPOS_RECIPE, type CampoRecipe, type FaltaMedicina } from "@/lib/recipe";
import { completarRecipe } from "./recipe-acciones";

// Aviso del récipe incompleto con el arreglo en el mismo sitio: cada dato que falta se escribe aquí (con lo que
// sugiere el vademécum a un clic) y «Guardar e imprimir» deja el récipe listo sin ir a la consulta.
// La hoja de impresión es siempre clara (papel), así que los colores son fijos y no dependen del tema oscuro.
export function CompletarRecipe({
  consultaId, estado, generales, medicinas, sugerencias, opciones, enPaquete = false,
}: {
  consultaId: string;
  estado: "borrador" | "cerrada" | "firmada";
  generales: { texto: string; href: string | null }[];
  medicinas: FaltaMedicina[];
  sugerencias: Record<string, string[]>; // «índice:campo» → valores del vademécum
  opciones: Partial<Record<CampoRecipe, string[]>>; // listas de presentación, vía, frecuencia y duración
  enPaquete?: boolean;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(() =>
    // Una sola sugerencia del vademécum: ya viene escrita (el médico la ve y la puede cambiar antes de guardar)
    Object.fromEntries(Object.entries(sugerencias).filter(([, v]) => v.length === 1).map(([k, v]) => [k, v[0]])));
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const firmada = estado === "firmada";
  const nombre = (c: CampoRecipe) => CAMPOS_RECIPE.find(([k]) => k === c)![1];
  const vacios = medicinas.flatMap((m) => m.campos.map((c) => `${m.indice}:${c}`)).filter((k) => !valores[k]?.trim());

  const guardar = () => iniciar(async () => {
    setAviso(null);
    const cambios = medicinas.flatMap((m) => m.campos
      .map((campo) => ({ indice: m.indice, medicina: m.medicina, campo, valor: valores[`${m.indice}:${campo}`] ?? "" }))
      .filter((c) => c.valor.trim()));
    const r = await completarRecipe(consultaId, cambios);
    setAviso(r);
    if (r.ok) router.refresh();
  });

  return (
    <section data-estado="recipe-incompleto" className="mx-auto mb-6 max-w-3xl rounded-xl border border-red-200 bg-white p-5 text-neutral-900 shadow-sm print:hidden sm:p-6">
      <h2 className="flex items-start gap-2 text-base font-semibold text-red-700">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
        {enPaquete ? "El récipe quedó fuera de esta impresión" : "El récipe todavía no se puede imprimir"}
      </h2>
      <p className="mt-1 text-sm text-neutral-700">
        La Res. MPPS 028 (reformada por la 031 de 2013) exige estos datos para que la farmacia despache.
        {enPaquete && " El resto de los documentos se imprime igual."}
      </p>

      {generales.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {generales.map((g) => (
            <li key={g.texto} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>Falta {g.texto}</span>
              {g.href && <Link href={g.href} className="inline-flex shrink-0 items-center gap-1 font-medium text-teal-800 underline-offset-2 hover:underline">Completar <ArrowRight className="size-3.5" /></Link>}
            </li>
          ))}
        </ul>
      )}

      {medicinas.length > 0 && (firmada ? (
        <div className="mt-4 space-y-3">
          <ul className="space-y-1 text-sm">
            {medicinas.map((m) => <li key={m.indice}><b>{m.medicina}</b>: falta {m.campos.map(nombre).join(", ")}</li>)}
          </ul>
          <p className="text-sm text-neutral-700">La consulta está firmada: se corrige en la consulta indicando el motivo y la versión firmada queda en el historial.</p>
          <Button asChild variant="outline" className="border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50">
            <Link href={`/atencion/${consultaId}?paso=tratamiento`}><Pencil /> Corregir en la consulta</Link>
          </Button>
        </div>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
          {medicinas.map((m) => (
            <fieldset key={m.indice} className="rounded-lg border border-neutral-200 p-3">
              <legend className="px-1 text-sm font-semibold">{m.medicina}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {m.campos.map((campo) => {
                  const k = `${m.indice}:${campo}`;
                  const sug = sugerencias[k] ?? [];
                  const lista = `op-${k}`;
                  return (
                    <label key={k} className="block text-sm">
                      <span className="mb-1 block font-medium text-neutral-800">{nombre(campo)[0].toUpperCase() + nombre(campo).slice(1)}</span>
                      <input
                        value={valores[k] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))}
                        list={opciones[campo]?.length ? lista : undefined} maxLength={80} required data-campo={campo}
                        placeholder={campo === "concentracion" ? "ej. 500 mg · 100/100/1 mg/3 ml" : "Escribe o elige"}
                        className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/25" />
                      {opciones[campo]?.length ? <datalist id={lista}>{opciones[campo]!.map((o) => <option key={o} value={o} />)}</datalist> : null}
                      {sug.length > 1 && (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {sug.map((s) => (
                            <button key={s} type="button" onClick={() => setValores((v) => ({ ...v, [k]: s }))}
                              className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-0.5 text-xs text-neutral-800 hover:border-teal-700 hover:bg-teal-50">{s}</button>
                          ))}
                        </span>
                      )}
                      {sug.length === 1 && <span className="mt-1 block text-xs text-neutral-500">Sugerido por tu vademécum</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" disabled={pendiente || vacios.length > 0} data-accion="completar-recipe" className="bg-teal-800 text-white hover:bg-teal-900">
              {pendiente ? <Loader2 className="animate-spin" /> : <Check />} Guardar y preparar el récipe
            </Button>
            <Link href={`/atencion/${consultaId}?paso=tratamiento`} className="text-sm font-medium text-teal-800 underline-offset-2 hover:underline">Abrir la consulta</Link>
            {vacios.length > 0 && <span className="text-xs text-neutral-500">Faltan {vacios.length} dato{vacios.length === 1 ? "" : "s"}</span>}
          </div>
          {estado === "cerrada" && <p className="text-xs text-neutral-500">La consulta está cerrada: se guarda y queda cerrada igual.</p>}
        </form>
      ))}

      {aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "mt-3 text-sm font-medium text-teal-800" : "mt-3 text-sm font-medium text-red-700"}>{aviso.mensaje}</p>}
    </section>
  );
}
