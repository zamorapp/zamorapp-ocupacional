"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Hand, Loader2, Merge, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmar } from "@/components/app/confirmar";
import { claveCargo, type CargoOrg } from "@/lib/cargos";
import { cn } from "@/lib/utils";
import { quitarCargos, unirCargos } from "./acciones";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Lo que la búsqueda automática no junta («Administración» y «Administrador» de contrato) o lo que no es un cargo
// («16/08/2023»): se busca, se marca y se une con el nombre que se escriba, o se quita.
export function UnirAMano({ cargos }: { cargos: CargoOrg[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Map<string, CargoOrg>>(new Map());
  const [nombre, setNombre] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();

  const encontrados = useMemo(() => {
    const k = claveCargo(busca);
    if (busca.trim().length < 2) return [];
    return cargos.filter((c) => claveCargo(c.nombre).includes(k) || c.nombre.toLowerCase().includes(busca.trim().toLowerCase())).slice(0, 40);
  }, [busca, cargos]);
  const lista = [...marcados.values(), ...encontrados.filter((c) => !marcados.has(c.id))];
  const sel = [...marcados.values()];
  const trab = sel.reduce((s, c) => s + c.trabajadores, 0);

  const alternar = (c: CargoOrg) => {
    const m = new Map(marcados);
    if (m.has(c.id)) m.delete(c.id); else m.set(c.id, c);
    setMarcados(m);
    if (!nombre && m.size) setNombre([...m.values()].sort((a, b) => b.trabajadores - a.trabajadores)[0].nombre);
  };
  const terminar = (r: { ok: boolean; mensaje: string }) => {
    setAviso(r);
    if (r.ok) { setMarcados(new Map()); setNombre(""); setBusca(""); router.refresh(); }
  };
  const unir = async () => {
    if (!(await confirmar({ titulo: `¿Unir en «${nombre.trim()}»?`, texto: `${plural(sel.length, "cargo", "cargos")}, ${plural(trab, "trabajador", "trabajadores")}. No se borra nada. No se puede deshacer desde aquí.`, accion: "Unir" }))) return;
    iniciar(async () => terminar(await unirCargos(nombre, sel.map((c) => c.id))));
  };
  const quitar = async () => {
    if (!(await confirmar({ titulo: `¿Quitar ${sel.length === 1 ? `«${sel[0].nombre}»` : plural(sel.length, "cargo", "cargos")}?`, texto: `${plural(trab, "trabajador queda", "trabajadores quedan")} sin cargo; se completa en la próxima consulta. No se puede deshacer desde aquí.`, accion: "Quitar", peligro: true }))) return;
    iniciar(async () => terminar(await quitarCargos(sel.map((c) => c.id))));
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 font-medium"><Hand className="size-4 text-primary" /> Unir o quitar a mano</h2>
        <p className="text-sm text-muted-foreground">Para lo que no aparece arriba, o para nombres que no son cargos (una fecha, «Na»).</p>
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
                  <span className="block truncate text-xs text-muted-foreground">{c.empresa}</span>
                </span>
                <span className="w-20 text-right tabular-nums text-muted-foreground">{c.trabajadores} trab.</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {busca.trim().length >= 2 && !lista.length && <p className="text-sm text-muted-foreground">Ningún cargo con «{busca.trim()}».</p>}
      {aviso && <p className={cn("rounded-md px-3 py-2 text-sm", aviso.ok ? "bg-ok/10 text-ok-texto" : "bg-destructive/10 text-destructive")}>{aviso.mensaje}</p>}
      {sel.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          <label className="min-w-0 basis-full sm:basis-0 sm:flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre que queda ({plural(sel.length, "marcado", "marcados")}, {plural(trab, "trabajador", "trabajadores")})</span>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-10 font-medium" />
          </label>
          <Button onClick={unir} disabled={ocupado || sel.length < 2 || !nombre.trim()} title={sel.length < 2 ? "Marca al menos 2 para unir" : undefined} className="flex-1 sm:flex-none">
            {ocupado ? <Loader2 className="animate-spin" /> : <Merge />} Unir {sel.length}
          </Button>
          <Button variant="outline" onClick={quitar} disabled={ocupado} className="flex-1 text-destructive sm:flex-none">
            <Ban /> Quitar cargo
          </Button>
        </div>
      )}
    </section>
  );
}
