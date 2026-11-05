"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronRight, Loader2, Pencil, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Categoria, ETIQUETA_CATEGORIA, ETIQUETA_UNIDAD, type Servicio, type Unidad, usd } from "@/lib/facturacion-tipos";
import { cn } from "@/lib/utils";
import { guardarServicio } from "./acciones";

type Motivo = { codigo: string; nombre: string };

const NUEVO: Servicio = { id: "", codigo: "", nombre: "", categoria: "evaluacion", unidad: "servicio", precioUsd: 0, motivos: "", activo: true };
const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";
const codigos = (m: string) => m.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);

// Editor de un servicio en tres bloques con nombre: qué es, cuánto cuesta y cuándo se cobra solo
function Editor({ inicial, motivos, otros, alCerrar }: { inicial: Servicio; motivos: Motivo[]; otros: Servicio[]; alCerrar: () => void }) {
  const [s, setS] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const set = <K extends keyof Servicio>(k: K, v: Servicio[K]) => setS((x) => ({ ...x, [k]: v }));
  const elegidos = codigos(s.motivos);
  // Códigos guardados que ya no están en la lista de motivos: se conservan tal cual
  const sueltos = elegidos.filter((c) => !motivos.some((m) => m.codigo === c));
  // Otro servicio activo que ya cobra ese motivo: solo se avisa (el cobro toma el primero que encuentre)
  const yaCobra = (c: string) => otros.find((o) => o.activo && o.id !== s.id && codigos(o.motivos).includes(c))?.nombre;
  const alternar = (c: string, si: boolean) => set("motivos", (si ? [...elegidos, c] : elegidos.filter((x) => x !== c)).join(","));

  const guardar = () => iniciar(async () => {
    const r = await guardarServicio(s);
    setError(r.ok ? null : r.mensaje);
    if (r.ok) alCerrar();
  });

  return (
    <div className="space-y-4 border-t bg-muted/30 px-4 py-4">
      <section className="space-y-3">
        <h4 className="text-sm font-semibold">1 · ¿Qué es?</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div><Label htmlFor={`n-${s.id}`} className="mb-1.5">Nombre del servicio *</Label><Input id={`n-${s.id}`} value={s.nombre} onChange={(e) => set("nombre", e.target.value)} className="h-10" placeholder="Evaluación médica pre-empleo" /></div>
          <div>
            <Label htmlFor={`c-${s.id}`} className="mb-1.5">Tipo</Label>
            <select id={`c-${s.id}`} value={s.categoria} onChange={(e) => set("categoria", e.target.value as Categoria)} className={SELECT}>
              {Object.entries(ETIQUETA_CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><Label htmlFor={`k-${s.id}`} className="mb-1.5">Código (opcional)</Label><Input id={`k-${s.id}`} value={s.codigo} onChange={(e) => set("codigo", e.target.value)} className="h-10" placeholder="EV-PRE" /></div>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold">2 · ¿Cuánto cuesta?</h4>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor={`p-${s.id}`} className="mb-1.5">Precio en dólares</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input id={`p-${s.id}`} type="number" min={0} step="0.01" inputMode="decimal" value={s.precioUsd} onChange={(e) => set("precioUsd", Number(e.target.value))} className="h-10 pl-6" />
            </div>
          </div>
          <div>
            <Label htmlFor={`u-${s.id}`} className="mb-1.5">Se cobra por</Label>
            <select id={`u-${s.id}`} value={s.unidad} onChange={(e) => set("unidad", e.target.value as Unidad)} className={SELECT}>
              {Object.entries(ETIQUETA_UNIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={s.activo} onChange={(e) => set("activo", e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Se ofrece hoy
          </label>
        </div>
        <p className="text-xs text-muted-foreground">En la nota de cobro se pasa a bolívares con la tasa BCV del día.</p>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">3 · ¿Con qué consultas se cobra solo? <span className="font-normal text-muted-foreground">(opcional)</span></h4>
        <p className="text-xs text-muted-foreground">Al armar la nota de cobro, cada paciente atendido por estos motivos entra con este servicio. Déjalo sin marcar si lo agregas a mano (informes, charlas, asesorías).</p>
        {motivos.length === 0 ? (
          <Input value={s.motivos} onChange={(e) => set("motivos", e.target.value)} placeholder="Códigos separados por coma: PRE, PER" className="h-10 font-mono text-xs" />
        ) : (
          <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-lg border bg-background p-2 sm:grid-cols-2">
            {motivos.map((m) => {
              const marcado = elegidos.includes(m.codigo);
              const choca = marcado ? yaCobra(m.codigo) : undefined;
              return (
                <label key={m.codigo} className={cn("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60", marcado && "bg-primary/5")}>
                  <input type="checkbox" checked={marcado} onChange={(e) => alternar(m.codigo, e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span className="min-w-0">
                    <span className="[overflow-wrap:anywhere]">{m.nombre}</span>
                    {choca && <span className="block text-xs text-aviso-texto">También lo cobra «{choca}»</span>}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {sueltos.length > 0 && (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {sueltos.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/60">
                <input type="checkbox" checked onChange={() => alternar(c, false)} className="size-4 accent-[var(--primary)]" />
                {c} (ya no está en la lista)
              </label>
            ))}
          </div>
        )}
      </section>

      {error && <p className="rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={alCerrar}>Cancelar</Button>
        <Button type="button" onClick={guardar} disabled={ocupado || !s.nombre.trim()}>{ocupado && <Loader2 className="animate-spin" />} Guardar servicio</Button>
      </div>
    </div>
  );
}

function Fila({ s, motivos, editable, abierto, alAbrir, alCerrar, todos }: {
  s: Servicio; motivos: Motivo[]; editable: boolean; abierto: boolean; alAbrir: () => void; alCerrar: () => void; todos: Servicio[];
}) {
  const lista = codigos(s.motivos).map((c) => ({ c, nombre: motivos.find((m) => m.codigo === c)?.nombre }));
  const NoSeOfrece = ({ className }: { className?: string }) => <span className={cn("whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground", className)}>No se ofrece</span>;
  return (
    <li className={cn(!s.activo && !abierto && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-medium [overflow-wrap:anywhere]">{s.nombre}{!s.activo && <NoSeOfrece className="ml-2 hidden sm:inline-block" />}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {lista.length ? (
              <>
                <Zap className="mr-1 inline size-3 text-primary" />Se cobra solo en:{" "}
                {lista.map(({ c, nombre }, i) => (
                  <span key={c}>{i > 0 && ", "}{nombre ?? <span className="text-muted-foreground/70">{c} (ya no está en la lista)</span>}</span>
                ))}
              </>
            ) : "Se agrega a mano en la nota de cobro"}
            {!s.activo && <NoSeOfrece className="ml-2 sm:hidden" />}
          </p>
        </div>
        <p className="text-right"><span className="text-base font-semibold tabular-nums">{usd(s.precioUsd)}</span><span className="block text-xs text-muted-foreground">por {ETIQUETA_UNIDAD[s.unidad]}</span></p>
        {editable && !abierto && <Button type="button" variant="ghost" size="sm" onClick={alAbrir}><Pencil /> Cambiar</Button>}
      </div>
      {abierto && <Editor inicial={s} motivos={motivos} otros={todos} alCerrar={alCerrar} />}
    </li>
  );
}

// Servicios y precios agrupados por tipo; cada grupo se despliega y cada servicio se cambia en su sitio
export function Servicios({ servicios, motivos = [], editable }: { servicios: Servicio[]; motivos?: Motivo[]; editable: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null); // id del servicio en edición · "nuevo"
  const grupos = useMemo(() => {
    const m = new Map<Categoria, Servicio[]>();
    for (const s of servicios) m.set(s.categoria, [...(m.get(s.categoria) ?? []), s]);
    return (Object.keys(ETIQUETA_CATEGORIA) as Categoria[]).filter((c) => m.has(c)).map((c) => ({ c, lista: m.get(c)! }));
  }, [servicios]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 basis-64 text-sm text-muted-foreground">Toca un tipo para ver sus servicios y «Cambiar» para ajustar el precio o cuándo se cobra solo.</p>
        {editable && <Button onClick={() => setAbierto("nuevo")} disabled={abierto === "nuevo"}><Plus /> Nuevo servicio</Button>}
      </div>
      {abierto === "nuevo" && (
        <Card className="gap-0 py-0">
          <p className="px-4 pt-3 font-medium">Nuevo servicio</p>
          <Editor inicial={NUEVO} motivos={motivos} otros={servicios} alCerrar={() => setAbierto(null)} />
        </Card>
      )}
      {grupos.map(({ c, lista }) => (
        <details key={c} open={servicios.length <= 20 || lista.some((s) => s.id === abierto)} className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-90" />
            <span className="flex-1 font-semibold">{ETIQUETA_CATEGORIA[c]}</span>
            <span className="text-xs text-muted-foreground">{lista.length} {lista.length === 1 ? "servicio" : "servicios"}</span>
          </summary>
          <ul className="divide-y border-t">
            {lista.map((s) => (
              <Fila key={s.id + s.precioUsd + s.nombre + s.motivos + s.activo} s={s} motivos={motivos} editable={editable} todos={servicios}
                abierto={abierto === s.id} alAbrir={() => setAbierto(s.id)} alCerrar={() => setAbierto(null)} />
            ))}
          </ul>
        </details>
      ))}
      {servicios.length === 0 && abierto !== "nuevo" && <p className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">Sin servicios. Pulsa «Nuevo servicio» para cargar el primero.</p>}
    </div>
  );
}
