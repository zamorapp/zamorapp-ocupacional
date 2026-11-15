// Revisión de diseño automática: abre pantallas en PC y celular, en tema claro y oscuro, y falla si encuentra
// listas desplegables ilegibles (contraste de las opciones < 4,5), desborde horizontal o fallas de axe (WCAG AA).
// Uso: con la app corriendo (npm run dev), `npm run revisar-diseno -- /pacientes /reportes ...`
//      BASE=http://localhost:3000 por defecto. Sin rutas revisa las principales.
// Necesita Playwright (npx playwright o el que ya traiga el equipo); axe-core viene en las dependencias.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Falta Playwright: npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const BASE = process.env.BASE ?? "http://localhost:3000";
const RUTAS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/panel", "/pacientes", "/atencion", "/accidentes", "/inspeccion", "/empresas", "/reportes", "/facturacion", "/envios", "/configuracion", "/configuracion/clinica", "/ayuda"];

// Contraste WCAG de dos colores rgb()/rgba() ya calculados por el navegador
function contraste(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const fallas = [];
const navegador = await chromium.launch();
for (const tema of ["claro", "oscuro"]) {
  for (const [modo, viewport] of [["pc", { width: 1366, height: 850 }], ["celular", { width: 390, height: 844 }]]) {
    const pagina = await navegador.newPage({ viewport, colorScheme: tema === "oscuro" ? "dark" : "light" });
    for (const ruta of RUTAS) {
      try {
        await pagina.goto(BASE + ruta, { waitUntil: "networkidle", timeout: 90000 });
      } catch (e) {
        fallas.push(`${tema} ${modo} ${ruta}: no abrió (${e.message.slice(0, 60)})`);
        continue;
      }
      if (tema === "oscuro") await pagina.evaluate(() => document.documentElement.classList.add("dark"));
      const donde = `${tema} ${modo} ${ruta}`;

      // 1. Opciones de cada <select>: fondo propio (no transparente) y contraste suficiente
      const opciones = await pagina.evaluate(() =>
        [...document.querySelectorAll("select")].map((s) => {
          const o = s.options[0] ?? s;
          const cs = getComputedStyle(o);
          // Los colores del tema vienen en oklch(): se pasan a rgba pintándolos en un canvas
          const rgb = (c) => {
            const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
            ctx.fillStyle = c;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
          };
          return { id: s.id || s.name || s.getAttribute("aria-label") || "select", fondo: rgb(cs.backgroundColor), texto: rgb(cs.color) };
        }),
      );
      for (const o of opciones) {
        const transparente = /,\s*0\)$/.test(o.fondo);
        if (transparente) fallas.push(`${donde}: lista «${o.id}» con opciones sin fondo (en Windows se ven blancas)`);
        else if (contraste(o.texto, o.fondo) < 4.5) fallas.push(`${donde}: lista «${o.id}» con contraste ${contraste(o.texto, o.fondo).toFixed(2)}`);
      }

      // 2. Desborde horizontal
      const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (desborde > 0) fallas.push(`${donde}: se desborda ${desborde} px`);

      // 3. Accesibilidad (WCAG A y AA)
      await pagina.addScriptTag({ content: axe });
      const axeFallas = await pagina.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
        return r.violations.map((v) => `${v.id} (${v.nodes.length})`);
      });
      if (axeFallas.length) fallas.push(`${donde}: axe ${axeFallas.join(", ")}`);
    }
    await pagina.close();
  }
}
await navegador.close();

if (fallas.length) {
  console.error(`Revisión de diseño: ${fallas.length} falla(s)\n- ${fallas.join("\n- ")}`);
  process.exit(1);
}
console.log(`Revisión de diseño: OK (${RUTAS.length} pantallas × PC y celular × claro y oscuro)`);
