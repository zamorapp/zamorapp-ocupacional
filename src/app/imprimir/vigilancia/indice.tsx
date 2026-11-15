"use client";

import { useEffect, useState } from "react";

type Entrada = { id: string; titulo: string; nivel: 1 | 2; pagina: number | null };

// Medidas del papel de @page (globals.css): carta con márgenes 12 / 12 / 14 mm
const ANCHO_MM = 215.9 - 24;
const ALTO_MM = 279.4 - 26;

// Página de cada cuadro con el mismo motor de cortes del navegador: una copia del informe se arma en columnas
// del tamaño exacto de la hoja impresa (con los estilos de impresión, clase .modo-impresion) y cada columna es
// una página: la columna donde cae un cuadro es su número de página. Así respeta los saltos de hoja y los
// bloques que no se parten. Mientras mide, data-indice-paginas="midiendo" (el PDF del servidor lo espera).
function medir(raiz: HTMLElement): Entrada[] {
  const caja = document.createElement("div");
  caja.className = "modo-impresion";
  caja.setAttribute("aria-hidden", "true");
  Object.assign(caja.style, {
    position: "absolute", left: "-100000px", top: "0", width: `${ANCHO_MM}mm`, height: `${ALTO_MM}mm`,
    columnWidth: `${ANCHO_MM}mm`, columnGap: "0", columnFill: "auto", visibility: "hidden", pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  const copia = raiz.cloneNode(true) as HTMLElement;
  copia.removeAttribute("data-informe");
  copia.querySelectorAll("[id]").forEach((el) => el.setAttribute("data-copia-id", el.id));
  copia.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  caja.appendChild(copia);
  // Junto al original, no en <body>: así hereda las variables de las fuentes del documento
  (raiz.parentElement ?? document.body).appendChild(caja);
  try {
    const ancho = caja.getBoundingClientRect().width || 1;
    const x0 = caja.getBoundingClientRect().left;
    return [...copia.querySelectorAll<HTMLElement>("[data-indice]")].map((el): Entrada => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-copia-id") ?? "",
        titulo: el.getAttribute("data-indice") ?? "",
        nivel: el.getAttribute("data-indice-nivel") === "1" ? 1 : 2,
        pagina: r.width || r.height ? Math.floor((r.left - x0 + 1) / ancho) + 1 : null,
      };
    }).filter((e) => e.id && e.titulo);
  } finally {
    caja.remove();
  }
}

export function IndiceInforme() {
  const [entradas, setEntradas] = useState<Entrada[] | null>(null);
  useEffect(() => {
    let vivo = true;
    document.documentElement.setAttribute("data-indice-paginas", "midiendo");
    const listo = () => document.documentElement.setAttribute("data-indice-paginas", "listo");
    (async () => {
      try {
        await document.fonts.ready;
        // Las imágenes (logos) cambian el alto de la portada: se espera a que carguen
        await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((ok) => { i.onload = i.onerror = ok; })));
        const raiz = document.querySelector<HTMLElement>("[data-informe]");
        if (raiz && vivo) setEntradas(medir(raiz));
      } catch {
        if (vivo) setEntradas([]);
      } finally {
        listo();
      }
    })();
    return () => { vivo = false; listo(); };
  }, []);

  if (!entradas) return <p className="text-[10.5px] italic text-doc-tenue">Calculando páginas…</p>;
  if (!entradas.length) return <p className="text-[10.5px] italic text-doc-tenue">No se pudo calcular el índice en este equipo.</p>;
  return (
    <ol className="columns-2 gap-8 text-[10.5px] leading-snug">
      {entradas.map((e) => (
        <li key={e.id} className={`flex break-inside-avoid items-baseline gap-1.5 ${e.nivel === 1 ? "mt-2 font-bold text-doc-acento first:mt-0" : "pl-3"}`}>
          <a href={`#${e.id}`} className="min-w-0 text-inherit no-underline">{e.titulo}</a>
          <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-doc-linea" />
          <span className="font-cifra tabular-nums">{e.pagina ?? "—"}</span>
        </li>
      ))}
    </ol>
  );
}
