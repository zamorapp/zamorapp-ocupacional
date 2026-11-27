// Mide la reapertura del instalador en la VM de Windows con una sesión de prueba ya guardada.
import { setTimeout as esperar } from "node:timers/promises";
import { chromium } from "playwright-core";

const [inicioTexto, modo] = process.argv.slice(2);
const inicio = Number(inicioTexto);
if (!Number.isSafeInteger(inicio) || !["en-linea", "sin-conexion"].includes(modo)) {
  throw new Error("Indica el instante de arranque (ms Unix) y el modo de conexión esperado");
}

let navegador;
try {
  const limite = inicio + 90_000;
  while (!navegador) {
    try {
      navegador = await chromium.connectOverCDP("http://127.0.0.1:9333", { timeout: 2000 });
    } catch (error) {
      if (Date.now() >= limite) throw error;
      await esperar(200);
    }
  }
  const contexto = navegador.contexts()[0];
  const pagina = contexto.pages()[0] ?? await contexto.waitForEvent("page", { timeout: 15_000 });
  await pagina.waitForURL(/\/panel(?:[/?#]|$)/, { timeout: 60_000 });
  await pagina.locator("main h1").waitFor({ timeout: 30_000 });
  await pagina.waitForFunction(() => {
    const cuenta = document.querySelector('button[aria-label="Mi cuenta"]');
    return !!cuenta && Object.keys(cuenta).some((key) => key.startsWith("__reactFiber"));
  }, null, { timeout: 15_000 });
  const cuenta = pagina.getByRole("button", { name: "Mi cuenta", exact: true });
  await cuenta.click({ timeout: 15_000 });
  // El menú solo aparece cuando el clic fue atendido por el JavaScript de la aplicación.
  await pagina.getByRole("menuitem", { name: "Salir", exact: true }).waitFor({ timeout: 5000 });
  const interactivoMs = Date.now() - inicio;

  const estado = await fetch("http://127.0.0.1:54331/zamorapp/estado", { signal: AbortSignal.timeout(3000) }).then((r) => r.json());
  if (estado.enLinea !== (modo === "en-linea")) throw new Error(`Conexión inesperada en la medición ${modo}`);
  console.log(`ARRANQUE_INTERACTIVO ${modo} ${interactivoMs} ms`);
} finally {
  await navegador?.close();
}
