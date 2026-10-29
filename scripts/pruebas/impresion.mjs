// Prueba automática de impresión: genera el PDF de cada documento de la consulta con datos de ejemplo
// (normales y «peor caso» con textos largos) y avisa si un documento se pasa de hoja, si una imagen
// (logo) no carga o si se cuela un «NaN», «undefined» o «a. m..». Corre en Linux, sin gastar Windows.
// Uso: con la app corriendo con ZAMORAPP_PRUEBA_IMPRESION=1 (next dev o next start):
//   node scripts/pruebas/impresion.mjs [http://localhost:3100] [--pdf carpeta]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Playwright del proyecto o, si no está instalado, el global (NODE_PATH; import no lo respeta)
const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));

const args = process.argv.slice(2);
const iPdf = args.indexOf("--pdf");
const carpetaPdf = iPdf >= 0 ? args.splice(iPdf, 2)[1] : null;
const base = (args[0] ?? "http://localhost:3100").replace(/\/$/, "");

// Hojas que debe ocupar cada documento con datos normales (una .hoja = una hoja de papel).
// «fijo»: aun en el peor caso no puede pasar de sus hojas (se entrega a la empresa o al IVSS en una hoja).
// «fluye»: puede ocupar las páginas que necesite.
const DOCUMENTOS = {
  constancia: { fijo: true }, reposo: { fijo: true }, recipe: { fijo: true }, certificado: { fijo: false },
  atencion: { fijo: true }, oam: { fijo: true }, referencia: { fijo: false }, orden: { fijo: false },
  // El informe completo fluye en varias hojas a propósito (Hoja print:block): solo se revisa que no rompa nada
  informe: { fluye: true }, "informe-trabajador": { fluye: true }, preoperatoria: { fluye: true },
  reubicacion: { fijo: false }, libre: { fijo: false },
};
const TEXTO_MALO = /\bNaN\b|\bundefined\b|\[object Object\]|[ap]\. m\.\./;

const contarPaginas = (pdf) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

const navegador = await chromium.launch();
// Ancho de una hoja carta (8,5 in a 96 ppp): las medidas de la prueba de firmas son las del papel
const pagina = await navegador.newPage({ viewport: { width: 816, height: 1056 } });
const fallas = [];
const filas = [];
for (const [tipo, regla] of Object.entries(DOCUMENTOS)) {
  for (const caso of ["normal", "largo"]) {
    const url = `${base}/imprimir/prueba/${tipo}?caso=${caso}`;
    const r = await pagina.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
    if (!r || r.status() !== 200) { fallas.push(`${tipo} (${caso}): la página respondió ${r?.status()} (¿falta ZAMORAPP_PRUEBA_IMPRESION=1?)`); continue; }
    await pagina.emulateMedia({ media: "print" });
    const info = await pagina.evaluate(async () => {
      await document.fonts.ready;
      const imgs = [...document.images];
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; }))));
      return {
        hojas: document.querySelectorAll(".hoja").length || 1,
        rotas: imgs.filter((i) => !i.naturalWidth).map((i) => i.alt || i.src.slice(0, 40)),
        texto: document.body.innerText,
        // Reposo: la firma va al lado del diagnóstico; si se va debajo, original y copia no caben en una carta
        firmaDebajo: [...document.querySelectorAll("[data-prueba=texto-reposo]")].some((t) => {
          const f = t.parentElement?.querySelector("[data-prueba=firma-medico]");
          return f && f.getBoundingClientRect().top >= t.getBoundingClientRect().bottom;
        }),
      };
    });
    const pdf = await pagina.pdf({ preferCSSPageSize: true, printBackground: true });
    const paginas = contarPaginas(pdf);
    if (carpetaPdf) { fs.mkdirSync(carpetaPdf, { recursive: true }); fs.writeFileSync(path.join(carpetaPdf, `${tipo}-${caso}.pdf`), pdf); }
    const malo = info.texto.match(TEXTO_MALO)?.[0];
    const sePasa = !regla.fluye && paginas > info.hojas && (caso === "normal" || regla.fijo);
    filas.push(`${tipo.padEnd(20)} ${caso.padEnd(7)} hojas ${info.hojas}  páginas ${paginas}${sePasa ? "  ← SE PASA" : ""}`);
    if (sePasa) fallas.push(`${tipo} (${caso}): ocupa ${paginas} páginas y debe caber en ${info.hojas}`);
    if (info.rotas.length) fallas.push(`${tipo} (${caso}): imagen que no carga: ${info.rotas.join(", ")}`);
    if (info.firmaDebajo) fallas.push(`${tipo} (${caso}): la firma quedó debajo del diagnóstico en vez de al lado`);
    if (malo) fallas.push(`${tipo} (${caso}): aparece «${malo}» en el texto`);
    await pagina.emulateMedia({ media: "screen" });
  }
}
await navegador.close();
console.log(filas.join("\n"));
if (fallas.length) { console.error(`\nFALLAS (${fallas.length}):\n- ${fallas.join("\n- ")}`); process.exit(1); }
console.log(`\nImpresión: OK (${filas.length} documentos)`);
