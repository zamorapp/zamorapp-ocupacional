"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ClipboardCheck, Search, Sparkles, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TemaManual } from "@/lib/manual";
import { cn } from "@/lib/utils";

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
// La palabra debe empezar ahí (no en medio de otra): «silla» no encuentra «casilla», «levant» sí encuentra «levantamiento»
const esLetra = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const empiezaEn = (texto: string, p: string, desde = 0) => {
  for (let i = texto.indexOf(p, desde); i >= 0; i = texto.indexOf(p, i + 1)) if (!esLetra(texto[i - 1])) return i;
  return -1;
};
const SUGERENCIAS = ["RULA", "levantamiento", "DEB", "psicosocial", "silla", "firmar", "reposo", "WhatsApp"];

type Parte = { titulo: string; items: string[]; numerada?: boolean };
type Visto = { t: TemaManual; partes: Parte[]; consejos: string[]; todo: boolean };

// Partes de un tema: las guías traen sus partes; los demás, sus pasos como una sola parte numerada.
const partesDe = (t: TemaManual): Parte[] => t.partes ?? [{ titulo: "", items: t.pasos, numerada: true }];

// Resalta las palabras buscadas sin importar acentos ni mayúsculas.
function Resaltado({ texto, palabras }: { texto: string; palabras: string[] }) {
  if (!palabras.length) return <>{texto}</>;
  // Texto normalizado letra por letra para que cada posición coincida con el original
  const letras = Array.from(texto);
  const norm = letras.map((c) => sinAcentos(c).charAt(0) || c);
  const plano = norm.join("");
  const marca = new Array<boolean>(letras.length).fill(false);
  for (const p of palabras) {
    for (let i = empiezaEn(plano, p); i >= 0; i = empiezaEn(plano, p, i + 1)) for (let k = i; k < i + p.length; k++) marca[k] = true;
  }
  const trozos: { t: string; m: boolean }[] = [];
  letras.forEach((c, i) => {
    const ultimo = trozos[trozos.length - 1];
    if (ultimo && ultimo.m === marca[i]) ultimo.t += c;
    else trozos.push({ t: c, m: marca[i] });
  });
  return <>{trozos.map((x, i) => (x.m ? <mark key={i} className="rounded-sm bg-aviso/40 text-foreground">{x.t}</mark> : <Fragment key={i}>{x.t}</Fragment>))}</>;
}

// Manual con buscador: filtra secciones, partes y pasos por palabras (sin importar acentos), las resalta y muestra lo nuevo.
export function ManualBuscable({ temas, novedades }: { temas: TemaManual[]; novedades: { fecha: string; texto: string; tema: string }[] }) {
  const [q, setQ] = useState("");
  const [todasNuevas, setTodasNuevas] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const palabras = sinAcentos(q.trim()).split(/\s+/).filter(Boolean);
  const coincide = (t: string) => { const x = sinAcentos(t); return palabras.every((p) => empiezaEn(x, p) >= 0); };

  // «/» (fuera de un campo) pone el cursor en el buscador; ?q= lo llena al abrir (enlaces desde otras pantallas)
  useEffect(() => {
    const inicial = new URLSearchParams(window.location.search).get("q");
    if (inicial) setQ(inicial);
    const tecla = (e: KeyboardEvent) => {
      const enCampo = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable=true]");
      if (enCampo) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        entrada.current?.focus();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const vistos: Visto[] = !palabras.length
    ? temas.map((t) => ({ t, partes: partesDe(t), consejos: t.consejos ?? [], todo: true }))
    : temas.flatMap((t): Visto[] => {
        if (coincide(`${t.titulo} ${t.resumen} ${t.claves ?? ""}`)) return [{ t, partes: partesDe(t), consejos: t.consejos ?? [], todo: true }];
        // Una parte cuyo título coincide sale entera («cómo se interpreta niosh»); si no, solo sus renglones que coinciden
        const partes = partesDe(t)
          .map((p) => (p.titulo && coincide(`${t.titulo} ${t.claves ?? ""} ${p.titulo}`) ? p : { ...p, items: p.items.filter(coincide) }))
          .filter((p) => p.items.length);
        const consejos = (t.consejos ?? []).filter(coincide);
        return partes.length || consejos.length ? [{ t, partes, consejos, todo: false }] : [];
      });

  const ids = new Set(temas.map((t) => t.id));
  const nuevas = novedades.filter((n) => ids.has(n.tema));

  // Numeración: los temas sueltos 1, 2, 3…; los de un grupo comparten número (12.1, 12.2…)
  const numero = new Map<string, string>();
  let n = 0;
  let grupoActual: string | undefined;
  let k = 0;
  for (const t of temas) {
    if (t.grupo && t.grupo === grupoActual) { k++; numero.set(t.id, `${n}.${k}`); continue; }
    n++;
    grupoActual = t.grupo;
    k = 1;
    numero.set(t.id, t.grupo ? `${n}.1` : String(n));
  }
  const sueltos = temas.filter((t) => !t.grupo);
  const grupos = [...new Set(temas.flatMap((t) => (t.grupo ? [t.grupo] : [])))].map((g) => ({ nombre: g, temas: temas.filter((t) => t.grupo === g) }));
  const encontrados = vistos.reduce((s, v) => s + (v.todo ? 1 : v.partes.reduce((a, p) => a + p.items.length, 0) + v.consejos.length), 0);

  return (
    <>
      <div className="sticky top-16 z-10 -mx-1 space-y-2 bg-background/90 px-1 py-2 backdrop-blur print:hidden">
        <label className="flex items-center gap-2 rounded-xl border-2 bg-card px-3 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="size-5 shrink-0 text-primary" />
          <input
            ref={entrada}
            id="buscar-manual"
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
            placeholder="Buscar en el manual: RULA, levantamiento, firmar, reposo…"
            aria-label="Buscar en el manual"
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button type="button" onClick={() => { setQ(""); entrada.current?.focus(); }} aria-label="Borrar búsqueda" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
          ) : (
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:block">/</kbd>
          )}
        </label>
        {!palabras.length ? (
          <div className="flex items-center gap-1.5 overflow-x-auto text-sm sm:flex-wrap sm:overflow-visible">
            <span className="shrink-0 text-muted-foreground">Prueba:</span>
            {SUGERENCIAS.map((s) => (
              <button key={s} type="button" onClick={() => setQ(s)} className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 hover:bg-primary/10 hover:text-primary">{s}</button>
            ))}
          </div>
        ) : (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {vistos.length
              ? `${encontrados} ${encontrados === 1 ? "resultado" : "resultados"} en ${vistos.length} ${vistos.length === 1 ? "sección" : "secciones"} con «${q.trim()}»`
              : `Nada coincide con «${q.trim()}». Prueba con otra palabra o con menos palabras.`}
          </p>
        )}
      </div>

      {nuevas.length > 0 && !palabras.length && (
        <Card className="border-primary/30 bg-primary/5 print:hidden">
          <CardContent className="space-y-2">
            <p className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primary" /> Lo nuevo</p>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {(todasNuevas ? nuevas : nuevas.slice(0, 6)).map((x) => {
                const dos = x.texto.indexOf(": ");
                return (
                  <li key={x.texto} className="min-w-0">
                    <a href={`#${x.tema}`} className="hover:text-primary hover:underline">
                      {dos > 0 && dos < 90 ? <><b className="font-semibold">{x.texto.slice(0, dos)}</b>{x.texto.slice(dos)}</> : x.texto}
                    </a>
                  </li>
                );
              })}
            </ul>
            {nuevas.length > 6 && (
              <button type="button" onClick={() => setTodasNuevas((v) => !v)} className="text-sm font-medium text-primary hover:underline">
                {todasNuevas ? "Ver menos" : `Ver todas las novedades (${nuevas.length})`}
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {!palabras.length && (
        <nav aria-label="Secciones del manual" className="space-y-3 print:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {sueltos.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="shrink-0 rounded-full border px-3 py-1 text-sm transition hover:border-primary/50 hover:text-primary">{t.titulo}</a>
            ))}
          </div>
          {grupos.map((g) => (
            <div key={g.nombre} className="rounded-xl border border-primary/30 p-3">
              <a href={`#${g.temas[0].id}`} className="flex items-center gap-2 text-sm font-semibold hover:text-primary"><ClipboardCheck className="size-4 text-primary" /> {g.nombre}</a>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                {g.temas.map((t) => (
                  <a key={t.id} href={`#${t.id}`} className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary transition hover:bg-primary/20">{t.titulo.split(" · ")[0]}</a>
                ))}
              </div>
            </div>
          ))}
        </nav>
      )}

      {vistos.map(({ t, partes, consejos, todo }, i) => {
        const abreGrupo = !!t.grupo && vistos[i - 1]?.t.grupo !== t.grupo;
        return (
          <Fragment key={t.id}>
            {abreGrupo && (
              <h2 className="flex items-center gap-2 pt-4 text-xl font-semibold tracking-tight sm:text-2xl">
                <ClipboardCheck className="text-primary" /> {numero.get(t.id)?.split(".")[0]}. {t.grupo}
              </h2>
            )}
            <section id={t.id} className={cn("scroll-mt-40 break-inside-avoid rounded-xl border bg-card p-5 sm:p-6", t.grupo && "border-l-4 border-l-primary/60")}>
              <h2 className="text-lg font-semibold">{numero.get(t.id)}. <Resaltado texto={t.titulo} palabras={palabras} /></h2>
              <p className="mt-1 text-muted-foreground"><Resaltado texto={t.resumen} palabras={palabras} /></p>
              {partes.map((p) => {
                const Lista = p.numerada && todo ? "ol" : "ul";
                return (
                  <div key={p.titulo || "pasos"} className="mt-4">
                    {p.titulo && <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-primary">{p.titulo}</h3>}
                    <Lista className={cn("space-y-2 pl-5", Lista === "ol" ? "list-decimal" : "list-disc")}>
                      {p.items.map((x) => <li key={x}><Resaltado texto={x} palabras={palabras} /></li>)}
                    </Lista>
                  </div>
                );
              })}
              {consejos.length > 0 && (
                <div className="mt-4 space-y-1 rounded-lg bg-primary/5 px-4 py-3 text-sm">
                  {consejos.map((c) => <p key={c}>💡 <Resaltado texto={c} palabras={palabras} /></p>)}
                </div>
              )}
              {!todo && (
                <button
                  type="button"
                  onClick={() => { setQ(""); requestAnimationFrame(() => document.getElementById(t.id)?.scrollIntoView()); }}
                  className="mt-3 text-sm font-medium text-primary hover:underline"
                >
                  Ver la sección completa
                </button>
              )}
            </section>
          </Fragment>
        );
      })}
    </>
  );
}
