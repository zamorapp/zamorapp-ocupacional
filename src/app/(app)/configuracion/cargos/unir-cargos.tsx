"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, CheckCircle2, Loader2, Merge, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmar } from "@/components/app/confirmar";
import { claveCargo, type GrupoCargos, type Parecido } from "@/lib/cargos";
import { cn } from "@/lib/utils";
import { unirCargos } from "./acciones";

const ETIQUETA: Record<Parecido, { texto: string; clase: string }> = {
  igual: { texto: "misma palabra", clase: "bg-ok/10 text-ok-texto" },
  abreviatura: { texto: "abreviado", clase: "bg-info/10 text-info-texto" },
  tipeo: { texto: "error de tipeo", clase: "bg-info/10 text-info-texto" },
  parecido: { texto: "parecido: revisa", clase: "bg-aviso/10 text-aviso-texto" },
};
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

type Estado = { nombre: string; marcadas: Set<string> };
// Marcadas de entrada: misma palabra, abreviatura y tipeo; lo que solo cambia al final («Cajera» / «Cajero») lo decide el médico
const inicial = (g: GrupoCargos): Estado => ({ nombre: g.propuesto, marcadas: new Set(g.variantes.filter((v) => v.tipo !== "parecido").map((v) => v.id)) });

export function UnirCargos({ grupos, total }: { grupos: GrupoCargos[]; total: number }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Record<string, Estado>>(() => Object.fromEntries(grupos.map((g) => [g.clave, inicial(g)])));
  const [hechos, setHechos] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [ocupado, iniciar] = useTransition();
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const k = claveCargo(busca);
    return k ? grupos.filter((g) => g.variantes.some((v) => claveCargo(v.nombre).includes(k) || claveCargo(v.empresa).includes(k))) : grupos;
  }, [busca, grupos]);
  const listos = grupos.filter((g) => !hechos[g.clave] && (estado[g.clave]?.marcadas.size ?? 0) >= 2);

  const poner = (clave: string, cambio: Partial<Estado>) => setEstado((e) => ({ ...e, [clave]: { ...e[clave], ...cambio } }));
  const alternar = (clave: string, id: string) => {
    const m = new Set(estado[clave].marcadas);
    if (m.has(id)) m.delete(id); else m.add(id);
    poner(clave, { marcadas: m });
  };

  async function unirUno(g: GrupoCargos) {
    const e = estado[g.clave];
    setEnCurso(g.clave);
    const r = await unirCargos(e.nombre, [...e.marcadas]);
    setEnCurso(null);
    if (r.ok) setHechos((h) => ({ ...h, [g.clave]: r.mensaje }));
    else setErrores((x) => ({ ...x, [g.clave]: r.mensaje }));
    return r.ok;
  }
  const unir = async (g: GrupoCargos) => {
    const e = estado[g.clave];
    const v = g.variantes.filter((x) => e.marcadas.has(x.id));
    if (!(await confirmar({
      titulo: `¿Unir en «${e.nombre.trim()}»?`,
      texto: `${plural(v.length, "variante", "variantes")} de ${plural(new Set(v.map((x) => x.empresaId)).size, "empresa", "empresas")}, ${plural(v.reduce((s, x) => s + x.trabajadores, 0), "trabajador", "trabajadores")}. Los trabajadores y sus historias no se borran. No se puede deshacer desde aquí.`,
      accion: "Unir",
    }))) return;
    setErrores((x) => ({ ...x, [g.clave]: "" }));
    iniciar(async () => { await unirUno(g); router.refresh(); });
  };
  const unirTodos = async () => {
    if (!(await confirmar({
      titulo: `¿Unir los ${listos.length} grupos marcados?`,
      texto: "Cada grupo queda con el nombre escrito arriba de él. Los «parecido: revisa» solo se unen si los marcas. No se puede deshacer desde aquí.",
      accion: "Unir todos",
    }))) return;
    iniciar(async () => { for (const g of listos) await unirUno(g); router.refresh(); });
  };

  if (!grupos.length) {
    return (
      <div className="grid place-items-center gap-2 rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        <CheckCircle2 className="size-8 text-ok" />
        No hay cargos repetidos entre los {total} cargos activos. Los nuevos se comparan solos al escribirlos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <div className="flex min-w-0 basis-full flex-wrap gap-x-5 gap-y-1 text-sm sm:basis-0 sm:flex-1">
          <span><b className="text-lg">{grupos.length}</b> {grupos.length === 1 ? "cargo repetido" : "cargos repetidos"}</span>
          <span className="text-muted-foreground">
            {grupos.reduce((s, g) => s + new Set(g.variantes.map((v) => v.nombre)).size, 0)} nombres distintos para {plural(grupos.length, "cargo", "cargos")} · {total} cargos activos
          </span>
        </div>
        <Button onClick={unirTodos} disabled={ocupado || !listos.length} className="w-full sm:w-auto">
          {ocupado ? <Loader2 className="animate-spin" /> : <Merge />} {listos.length === 1 ? "Unir el grupo marcado" : `Unir los ${listos.length} grupos`}
        </Button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cargo o empresa" className="h-10 pl-9" aria-label="Buscar cargo o empresa" />
      </div>

      <ul className="space-y-3">
        {visibles.map((g) => {
          const e = estado[g.clave];
          const hecho = hechos[g.clave];
          const marcadas = g.variantes.filter((v) => e.marcadas.has(v.id));
          return (
            <li key={g.clave} className={cn("rounded-xl border bg-card", hecho && "border-ok/40 bg-ok/5")}>
              <div className="flex flex-wrap items-end gap-3 border-b p-4">
                <label className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Briefcase className="size-3.5" /> Nombre que queda</span>
                  <Input value={e.nombre} list={`nombres-${g.clave}`} disabled={Boolean(hecho)} onChange={(x) => poner(g.clave, { nombre: x.target.value })} className="h-10 font-medium" />
                  <datalist id={`nombres-${g.clave}`}>{[...new Set(g.variantes.map((v) => v.nombre))].map((n) => <option key={n} value={n} />)}</datalist>
                </label>
                <div className="flex flex-1 items-center gap-3 text-xs text-muted-foreground sm:flex-none"
                  title={`${plural(g.trabajadores, "trabajador", "trabajadores")} en ${plural(g.empresas, "empresa", "empresas")}`}>
                  <span className="sr-only">{plural(g.trabajadores, "trabajador", "trabajadores")} en {plural(g.empresas, "empresa", "empresas")}</span>
                  <span aria-hidden className="inline-flex items-center gap-1"><Users className="size-3.5" /> {g.trabajadores}</span>
                  <span aria-hidden className="inline-flex items-center gap-1"><Building2 className="size-3.5" /> {g.empresas}</span>
                </div>
                {hecho ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-ok-texto"><CheckCircle2 className="size-4" /> Unido</span>
                ) : (
                  <Button variant="outline" onClick={() => unir(g)} disabled={ocupado || marcadas.length < 2 || !e.nombre.trim()}
                    title={marcadas.length < 2 ? "Marca al menos 2 para unir" : undefined}>
                    {enCurso === g.clave ? <Loader2 className="animate-spin" /> : <Merge />} Unir {marcadas.length}
                  </Button>
                )}
              </div>
              {(hecho || errores[g.clave]) && (
                <p className={cn("mx-4 mt-3 rounded-md px-3 py-2 text-sm", hecho ? "bg-ok/10 text-ok-texto" : "bg-destructive/10 text-destructive")}>{hecho || errores[g.clave]}</p>
              )}
              <ul className="divide-y">
                {g.variantes.map((v) => (
                  <li key={v.id}>
                    <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm", hecho && "pointer-events-none opacity-60")}>
                      <input type="checkbox" className="size-4 accent-primary" checked={e.marcadas.has(v.id)} disabled={Boolean(hecho)} onChange={() => alternar(g.clave, v.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{v.nombre}</span>
                        <span className="block truncate text-xs text-muted-foreground">{v.empresa}</span>
                        {v.tipo === "parecido" && <span className="block text-xs text-aviso-texto sm:hidden">{ETIQUETA.parecido.texto}</span>}
                      </span>
                      <span className={cn("hidden rounded-full px-2 py-0.5 text-xs sm:inline", ETIQUETA[v.tipo].clase)}>{ETIQUETA[v.tipo].texto}</span>
                      <span className="w-20 text-right tabular-nums text-muted-foreground">{plural(v.trabajadores, "trab.", "trab.")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
