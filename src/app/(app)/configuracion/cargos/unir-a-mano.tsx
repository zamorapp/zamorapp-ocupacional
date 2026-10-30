"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Hand, Loader2, Merge, Pencil, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmar } from "@/components/app/confirmar";
import { claveCargo, nombreSugerido, type CargoOrg } from "@/lib/cargos";
import { cn } from "@/lib/utils";
import { quitarCargos, restaurarCargo, unirCargos } from "./acciones";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Lo que la búsqueda automática no junta («Administración» y «Administrador» de contrato) o lo que no es un cargo
// («16/08/2023»): se busca, se marca y se une con el nombre que se escriba, o se quita.
export type Quitado = { id: string; nombre: string; empresa: string; trabajadores: number; quitadoEn: string };

export function UnirAMano({ cargos, quitados }: { cargos: CargoOrg[]; quitados: Quitado[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Map<string, CargoOrg>>(new Map());
  const [nombre, setNombre] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string; deshacer?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();

  const encontrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const k = claveCargo(busca);
    if (!q) return [];
    // Primero el nombre exacto, luego los que tienen una palabra que empieza así y, con 4 letras o más, los que la
    // contienen. Buscar «Na» encuentra el cargo «Na», no todo lo que lleva «na» (administración, analista…)
    const nivel = (c: CargoOrg) => {
      const n = c.nombre.trim().toLowerCase();
      const kc = claveCargo(c.nombre);
      if (n === q || kc === k) return 0;
      if (n.split(/[^\p{L}\d]+/u).some((p) => p.startsWith(q)) || (k && kc.split(" ").some((p) => p.startsWith(k)))) return 1;
      if (q.length >= 4 && (n.includes(q) || (k && kc.includes(k)))) return 2;
      return 3;
    };
    return cargos.map((c) => ({ c, n: nivel(c) })).filter((x) => x.n < 3)
      .sort((a, b) => a.n - b.n || b.c.trabajadores - a.c.trabajadores).slice(0, 40).map((x) => x.c);
  }, [busca, cargos]);
  const lista = [...marcados.values(), ...encontrados.filter((c) => !marcados.has(c.id))];
  const sel = [...marcados.values()];
  const trab = sel.reduce((s, c) => s + c.trabajadores, 0);
  // Quitar es solo para un nombre que no es cargo, escrito tal cual: uno solo y con el nombre exacto en la búsqueda.
  // (30-oct: con «Na» se quitaron por error cargos que solo contenían «na».)
  const exacto = sel.length === 1 && sel[0].nombre.trim().toLowerCase() === busca.trim().toLowerCase();

  const alternar = (c: CargoOrg) => {
    const m = new Map(marcados);
    if (m.has(c.id)) m.delete(c.id); else m.set(c.id, c);
    setMarcados(m);
    if (!nombre && m.size) setNombre(nombreSugerido([...m.values()].sort((a, b) => b.trabajadores - a.trabajadores)[0].nombre));
  };
  const terminar = (r: { ok: boolean; mensaje: string; deshacer?: string }) => {
    setAviso(r);
    if (r.ok) { setMarcados(new Map()); setNombre(""); setBusca(""); router.refresh(); }
  };
  const unir = async () => {
    if (!(await confirmar({ titulo: `¿Unir en «${nombre.trim()}»?`, texto: `${plural(sel.length, "cargo", "cargos")}, ${plural(trab, "trabajador", "trabajadores")}. No se borra nada. No se puede deshacer desde aquí.`, accion: "Unir" }))) return;
    iniciar(async () => terminar(await unirCargos(nombre, sel.map((c) => c.id))));
  };
  const quitar = async () => {
    if (!(await confirmar({ titulo: `¿Quitar ${sel.length === 1 ? `«${sel[0].nombre}»` : plural(sel.length, "cargo", "cargos")}?`, texto: `${trab === 1 ? "El trabajador queda" : `Los ${trab} trabajadores quedan`} sin cargo; sus historias no cambian. El cargo se completa en la próxima consulta. Se puede deshacer.`, accion: "Quitar", peligro: true }))) return;
    const id = sel[0].id;
    iniciar(async () => {
      const r = await quitarCargos([id]);
      terminar(r.ok ? { ...r, deshacer: id } : r);
    });
  };
  const deshacer = (id: string) => {
    iniciar(async () => { setAviso(await restaurarCargo(id)); router.refresh(); });
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 font-medium"><Hand className="size-4 text-primary" /> Unir o quitar a mano</h2>
        <p className="text-sm text-muted-foreground">Para lo que no aparece arriba, o para quitar nombres que no son cargos, como una fecha o «Na».</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busca y marca los cargos, por ejemplo «contrato»" className="h-10 pl-9" aria-label="Buscar cargos" />
      </div>
      {lista.length > 0 && (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {lista.map((c) => (
            <li key={c.id}>
              <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm", marcados.has(c.id) && "bg-primary/5")}>
                <input type="checkbox" className="size-4 accent-primary" checked={marcados.has(c.id)} onChange={() => alternar(c)} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{c.nombre}</span>
                  {marcados.has(c.id) && (
                    <button type="button" onClick={(e) => { e.preventDefault(); setNombre(nombreSugerido(c.nombre)); }}
                      title="Usar este nombre" aria-label={`Usar «${c.nombre}» como nombre que queda`}
                      className="ml-1.5 inline-grid size-6 place-items-center rounded align-middle text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  <span className="block truncate text-xs text-muted-foreground">{c.empresa}</span>
                </span>
                <span className="w-20 text-right tabular-nums text-muted-foreground">{c.trabajadores} trab.</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {busca.trim() && !lista.length && <p className="text-sm text-muted-foreground">Ningún cargo con «{busca.trim()}».</p>}
      {aviso && (
        <p className={cn("flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm", aviso.ok ? "bg-ok/10 text-ok-texto" : "bg-alerta/10 text-alerta-texto")}>
          {aviso.mensaje}
          {aviso.deshacer && (
            <Button size="sm" variant="outline" onClick={() => deshacer(aviso.deshacer!)} disabled={ocupado}><Undo2 /> Deshacer</Button>
          )}
        </p>
      )}
      {sel.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          {/* Lo marcado queda aunque se cambie la búsqueda: se dice exactamente qué se va a unir o quitar */}
          <div className="flex basis-full flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Marcados:</span>
            {sel.map((c) => (
              <span key={c.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">«{c.nombre}» · {c.empresa} · {c.trabajadores} trab.</span>
            ))}
            <button type="button" onClick={() => { setMarcados(new Map()); setNombre(""); }} className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Desmarcar todo
            </button>
          </div>
          <label className="min-w-0 basis-full sm:basis-0 sm:flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre que queda ({plural(sel.length, "marcado", "marcados")}, {plural(trab, "trabajador", "trabajadores")})</span>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-10 font-medium" />
          </label>
          <Button onClick={unir} disabled={ocupado || sel.length < 2 || !nombre.trim()} title={sel.length < 2 ? "Marca al menos 2 para unir" : undefined} className="flex-1 sm:flex-none">
            {ocupado ? <Loader2 className="animate-spin" /> : <Merge />} Unir {sel.length}
          </Button>
          <Button variant="outline" onClick={quitar} disabled={ocupado || !exacto} className="basis-full text-destructive sm:ml-auto sm:basis-auto"
            title={exacto ? undefined : "Para quitar, escribe en la búsqueda el nombre exacto y marca solo ese"}>
            <Ban /> {exacto ? `Quitar «${sel[0].nombre}» (${plural(sel[0].trabajadores, "trab.", "trab.")})` : sel.length > 1 ? "Quitar: marca solo uno" : `Quitar: escribe «${sel[0].nombre}» en la búsqueda`}
          </Button>
        </div>
      )}
      {quitados.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-medium">Cargos quitados · se pueden deshacer</h3>
          <ul className="divide-y rounded-lg border">
            {quitados.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{q.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">{q.empresa} · {plural(q.trabajadores, "trabajador", "trabajadores")}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => deshacer(q.id)} disabled={ocupado}><Undo2 /> Deshacer</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
