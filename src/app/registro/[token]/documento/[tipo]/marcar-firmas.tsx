"use client";

import { useEffect } from "react";

// Solo en el Chromium del servidor (PDF aplanado del enlace): la firma y el sello originales NUNCA llegan al PDF.
// Cada imagen se redibuja en un lienzo de máximo 300 px de ancho con «folio · cédula del paciente» en diagonal encima,
// y el <img> pasa a usar esa copia. Al terminar marca <html data-firmas="listas">; el servidor no imprime sin esa marca
// (pdfRegistroConNavegador), así que si algo falla no sale el original sino un error.
export function MarcarFirmas({ texto }: { texto: string }) {
  useEffect(() => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('[data-prueba="firma-medico"] img[src^="data:image"]'));
    const marcar = (img: HTMLImageElement) => new Promise<void>((listo, falla) => {
      const dibujar = () => {
        const escala = Math.min(1, 300 / (img.naturalWidth || 300));
        const w = Math.max(1, Math.round(img.naturalWidth * escala)), h = Math.max(1, Math.round(img.naturalHeight * escala));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const g = c.getContext("2d");
        if (!g) return falla(new Error("sin lienzo"));
        g.drawImage(img, 0, 0, w, h);
        g.save();
        g.translate(w / 2, h / 2);
        g.rotate(-Math.atan2(h, w));
        g.font = `600 ${Math.max(9, Math.round(Math.min(w, h) / 6))}px sans-serif`;
        g.fillStyle = "rgba(21, 32, 30, 0.38)";
        g.textAlign = "center";
        g.textBaseline = "middle";
        const paso = Math.max(12, Math.round(Math.min(w, h) / 4));
        for (let y = -h; y <= h; y += paso) g.fillText(texto, 0, y);
        g.restore();
        img.removeAttribute("srcset");
        img.src = c.toDataURL("image/png");
        img.decode().then(() => listo(), () => listo());
      };
      if (img.complete && img.naturalWidth) dibujar();
      else { img.onload = dibujar; img.onerror = () => falla(new Error("imagen")); }
    });
    Promise.all(imgs.map(marcar))
      .then(() => document.documentElement.setAttribute("data-firmas", "listas"))
      .catch(() => document.documentElement.setAttribute("data-firmas", "error"));
  }, [texto]);
  return null;
}
