"use client";

import { useEffect } from "react";

// Una hoja que se pasa un poco de la carta mandaba la firma y el sello solos a la segunda página (Cesar, 03-nov-2026:
// constancia con recomendaciones largas). Aquí cada hoja se mide sin su alto mínimo y, si su contenido pasa del alto
// útil de la página pero cabe reducido hasta un 85 %, se reduce lo justo (zoom) para que todo, firma incluida, quede en
// una hoja. Lo que no cabe ni así es un documento largo de verdad y fluye a varias páginas como siempre.
// La vista en pantalla muestra la misma reducción que sale impresa.
const MM = 96 / 25.4; // px por mm (CSS)
const MINIMO = 0.85;
// Alto útil de la página (carta 279,4 mm menos los márgenes de @page en globals.css) con un margen de seguridad
const ALTO_VERTICAL = 247;
const ALTO_APAISADA = 186;

// Ancho útil del papel (carta menos los márgenes de @page): se mide con este ancho y sin relleno, así la medida es la
// del papel tanto en pantalla como al imprimir (en pantalla la hoja tiene relleno; al imprimir, otro ancho)
const ANCHO_VERTICAL = 192;
const ANCHO_APAISADA = 251;

function ajustar() {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("section.hoja[data-ajustar]"))) {
    const apaisada = el.dataset.ajustar === "apaisada";
    const antes = { zoom: el.style.zoom, minHeight: el.style.minHeight, width: el.style.width, maxWidth: el.style.maxWidth, padding: el.style.padding };
    Object.assign(el.style, { zoom: "", minHeight: "0px", width: `${apaisada ? ANCHO_APAISADA : ANCHO_VERTICAL}mm`, maxWidth: "none", padding: "0px" });
    const alto = el.scrollHeight / MM;
    Object.assign(el.style, { minHeight: antes.minHeight, width: antes.width, maxWidth: antes.maxWidth, padding: antes.padding });
    const limite = apaisada ? ALTO_APAISADA : ALTO_VERTICAL;
    const z = alto > limite ? Math.floor((limite / alto) * 1000) / 1000 : 1;
    el.style.zoom = z < 1 && z >= MINIMO ? String(z) : "";
    el.dataset.zoom = el.style.zoom || "1";
  }
}

export function AjusteHojas() {
  useEffect(() => {
    let cuadro = 0;
    const pedir = () => { cancelAnimationFrame(cuadro); cuadro = requestAnimationFrame(ajustar); };
    pedir();
    document.fonts?.ready.then(pedir).catch(() => {});
    // Las imágenes (logo, firma, sello) cambian el alto al cargar; las opciones de «Incluir» rehacen la página
    const obs = new MutationObserver(pedir);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("load", pedir);
    window.addEventListener("beforeprint", ajustar);
    document.addEventListener("load", pedir, true);
    return () => {
      cancelAnimationFrame(cuadro);
      obs.disconnect();
      window.removeEventListener("load", pedir);
      window.removeEventListener("beforeprint", ajustar);
      document.removeEventListener("load", pedir, true);
    };
  }, []);
  return null;
}
