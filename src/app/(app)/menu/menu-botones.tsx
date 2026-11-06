"use client";

import { ArrowRight, Download, GitCompareArrows, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { alPasar, IconoEnlace } from "@/components/app/icono-enlace";
import { useCasosBandeja } from "@/components/app/aviso-conflictos";
import { buscarActualizacion, ESCRITORIO } from "@/lib/escritorio-actualizar";
import { type Boton, gruposDeBotones } from "@/lib/menu-botones";
import { normalizar } from "@/lib/atajos";
import { CambiarVistaMenu } from "@/components/app/boton-vista-menu";
import { cn } from "@/lib/utils";

type Props = { nombre: string; portal: boolean; clinico: boolean; rol: string | null };

// Solo en el programa de escritorio: la lista de conflictos vive en esa PC
const CONFLICTOS = { href: "/conflictos", titulo: "Conflictos y rechazados", icono: GitCompareArrows, descripcion: "Lo que la nube no aceptó desde esta PC, para revisarlo" };

export function MenuBotones({ nombre, portal, clinico, rol }: Props) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");
  const casos = useCasosBandeja().length;
  const grupos = useMemo(() => gruposDeBotones({ portal, clinico, rol }, ESCRITORIO && !portal ? [CONFLICTOS] : []), [portal, clinico, rol]);

  // Filtro al escribir: título, descripción o cualquiera de sus atajos
  const q = normalizar(texto.trim());
  const coincide = (b: Boton) => !q || normalizar(`${b.titulo} ${b.descripcion} ${b.atajos.map((a) => a.titulo).join(" ")}`).includes(q);
  const filtrados = grupos.map((g) => ({ ...g, botones: g.botones.filter(coincide) })).filter((g) => g.botones.length > 0);
  const primero = filtrados[0]?.botones[0];
  let orden = 0; // para escalonar la entrada de las tarjetas

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="motion-safe:animate-aparecer">
          <p className="text-sm font-medium text-primary">Hola, {nombre}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">¿Qué vas a hacer hoy?</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (primero) router.push(primero.href);
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Filtrar botones…"
              aria-label="Filtrar botones"
              className="h-10 w-full rounded-lg border bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
            />
            {texto && (
              <button type="button" onClick={() => setTexto("")} aria-label="Borrar filtro" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </form>
          <CambiarVistaMenu className="h-10 justify-center border px-3" />
        </div>
      </div>

      {filtrados.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Ningún botón coincide con «{texto}». Prueba el buscador (Ctrl+K), que también busca pantallas y funciones.</p>}

      <div className="space-y-8">
        {filtrados.map((g) => (
          <section key={g.clave} aria-labelledby={`cat-${g.clave}`} style={{ "--cat": g.color } as React.CSSProperties}>
            <div className="mb-3 flex items-center gap-3">
              <span className="h-6 w-1.5 rounded-full bg-[var(--cat)]" aria-hidden />
              <div>
                <h2 id={`cat-${g.clave}`} className="text-base font-semibold tracking-tight">{g.titulo}</h2>
                <p className="text-xs text-muted-foreground">{g.descripcion}</p>
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.botones.map((b) => {
                const retraso = Math.min(orden++, 12) * 35;
                const conflictos = b.href === "/conflictos" && casos > 0;
                return (
                  <li key={b.href} className="motion-safe:animate-aparecer" style={{ animationDelay: `${retraso}ms` }}>
                    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-[transform,box-shadow,border-color] duration-200 hover:border-[color-mix(in_oklch,var(--cat)_45%,transparent)] motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg">
                      {/* Brillo de la categoría en la esquina: solo color, sin imágenes */}
                      <span aria-hidden className="pointer-events-none absolute -right-14 -top-14 hidden size-28 rounded-full bg-[var(--cat)] opacity-[.05] transition-opacity duration-300 group-hover:opacity-[.1] sm:block" />
                      <Link href={b.href} {...alPasar(b.href)} className="relative flex flex-1 items-start gap-4 p-4 outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
                        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklch,var(--cat)_14%,transparent)] text-[color-mix(in_oklch,var(--cat)_75%,var(--foreground))] transition-transform duration-200 motion-safe:group-hover:scale-105">
                          <IconoEnlace icono={b.icono} className="size-6" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[15px] font-semibold">
                            {b.titulo}
                            {conflictos && <span className="rounded-full bg-aviso/15 px-1.5 text-xs font-semibold tabular-nums text-aviso-texto">{casos}<span className="sr-only"> por revisar</span></span>}
                          </span>
                          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{b.descripcion}</span>
                        </span>
                        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100 motion-safe:group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                      {/* Sin atajos, el pie dice «Abrir»: todas las tarjetas cierran igual */}
                      {b.atajos.length === 0 && (
                        <Link href={b.href} tabIndex={-1} aria-hidden className="relative flex min-h-11 items-center gap-1 border-t px-4 py-2.5 text-xs font-medium sm:min-h-0 text-[color-mix(in_oklch,var(--cat)_75%,var(--foreground))]">
                          Abrir <ArrowRight className="size-3.5 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
                        </Link>
                      )}
                      {b.atajos.length > 0 && (
                        <div className="relative flex flex-wrap gap-1.5 border-t px-4 py-2.5">
                          {b.atajos.map((a) => (
                            <Link key={a.titulo} href={a.href} className="inline-flex min-h-11 items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--cat)_16%,transparent)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:px-2.5">
                              {a.titulo}
                            </Link>
                          ))}
                          {b.mas > 0 && (
                            <Link href={b.href} className="inline-flex min-h-11 items-center rounded-full px-2 py-1 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0">
                              +{b.mas} más
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {ESCRITORIO && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-boton="buscar-actualizacion"
            disabled={Boolean(aviso)}
            onClick={async () => {
              setAviso("Buscando…");
              setAviso(await buscarActualizacion());
              setTimeout(() => setAviso(""), 8000);
            }}
            className={cn("inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-60")}
          >
            <Download className="size-4" aria-hidden />
            Buscar actualización
          </button>
          {aviso && <p role="status" className="text-sm text-muted-foreground">{aviso}</p>}
        </div>
      )}
    </div>
  );
}
