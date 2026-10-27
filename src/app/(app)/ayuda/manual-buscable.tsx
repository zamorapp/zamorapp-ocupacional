"use client";

import { useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TemaManual } from "@/lib/manual";
import { cn } from "@/lib/utils";

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Manual con buscador: filtra secciones y pasos por palabras (sin importar acentos) y resalta lo nuevo.
export function ManualBuscable({ temas, novedades }: { temas: TemaManual[]; novedades: { fecha: string; texto: string; tema: string }[] }) {
  const [q, setQ] = useState("");
  const palabras = sinAcentos(q.trim()).split(/\s+/).filter(Boolean);
  const coincide = (t: string) => palabras.every((p) => sinAcentos(t).includes(p));

  const vistos = !palabras.length
    ? temas.map((t) => ({ t, pasos: t.pasos, todo: true }))
    : temas.flatMap((t) => {
        if (coincide(`${t.titulo} ${t.resumen}`)) return [{ t, pasos: t.pasos, todo: true }];
        const pasos = [...t.pasos, ...(t.consejos ?? [])].filter(coincide);
        return pasos.length ? [{ t, pasos, todo: false }] : [];
      });

  const ids = new Set(temas.map((t) => t.id));
  const nuevas = novedades.filter((n) => ids.has(n.tema));

  return (
    <>
      {nuevas.length > 0 && !palabras.length && (
        <Card className="border-primary/30 bg-primary/5 print:hidden">
          <CardContent className="space-y-2">
            <p className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primary" /> Lo nuevo</p>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {nuevas.map((n) => (
                <li key={n.texto} className="min-w-0">
                  <a href={`#${n.tema}`} className="hover:text-primary hover:underline">{n.texto}</a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="sticky top-16 z-10 -mx-1 bg-background/90 px-1 py-2 backdrop-blur print:hidden">
        <label className="flex items-center gap-2 rounded-lg border bg-card px-3 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            id="buscar-manual"
            type="text"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en el manual: firmar, WhatsApp, rango, reposo…"
            aria-label="Buscar en el manual"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}
        </label>
      </div>
      <div className="print:hidden">
        {!palabras.length && (
          <nav aria-label="Secciones del manual" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {temas.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="shrink-0 rounded-full border px-3 py-1 text-sm transition hover:border-primary/50 hover:text-primary">{t.titulo}</a>
            ))}
          </nav>
        )}
        {palabras.length > 0 && (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {vistos.length ? `${vistos.length} ${vistos.length === 1 ? "sección" : "secciones"} con «${q.trim()}»` : `Nada coincide con «${q.trim()}». Prueba con otra palabra.`}
          </p>
        )}
      </div>

      {vistos.map(({ t, pasos, todo }) => (
        <section key={t.id} id={t.id} className="scroll-mt-32 break-inside-avoid rounded-xl border bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{temas.indexOf(t) + 1}. {t.titulo}</h2>
          <p className="mt-1 text-muted-foreground">{t.resumen}</p>
          <ol className={cn("mt-4 space-y-2 pl-5", todo ? "list-decimal" : "list-disc")}>
            {pasos.map((p) => <li key={p}>{p}</li>)}
          </ol>
          {todo && t.consejos && (
            <div className="mt-4 rounded-lg bg-primary/5 px-4 py-3 text-sm">
              {t.consejos.map((c) => <p key={c}>💡 {c}</p>)}
            </div>
          )}
          {!todo && <button type="button" onClick={() => { setQ(""); requestAnimationFrame(() => document.getElementById(t.id)?.scrollIntoView()); }} className="mt-3 text-sm font-medium text-primary hover:underline">Ver la sección completa</button>}
        </section>
      ))}
    </>
  );
}
