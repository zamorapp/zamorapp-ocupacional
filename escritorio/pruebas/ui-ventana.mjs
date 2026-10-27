// Prueba de la ventana real de zamorApp Escritorio: registra la PC (si hace falta) y entra con usuario y
// clave manejando el WebView2 por CDP (Chrome DevTools Protocol), igual que lo haría una persona.
// Así el CI detecta lo que una petición HTTP a la puerta no ve: un formulario que no se hidrata, un
// error de consola, una petición que el navegador bloquea o un rebote a la pantalla de ingreso.
//
// Windows (CI): abrir el programa con ZAMORAPP_PUERTO_DEPURACION=9333 (junto con la nube de prueba) y luego
//   node ui-ventana.mjs --cdp http://127.0.0.1:9333 --correo admin@x --clave clave-admin --registrar "PC de prueba" --captura capturas/1.png
// Local (Linux, con el Chromium de Playwright, puerta y app ya corriendo):
//   node ui-ventana.mjs --url http://127.0.0.1:54331/zamorapp/inicio --correo admin@x --clave clave-admin --registrar "PC de prueba"
// Diagnóstico en la PC de una persona (no toca nada: solo mira lo que hace la ventana mientras ella entra):
//   node ui-ventana.mjs --cdp http://127.0.0.1:9333 --observar 120 --captura diagnostico.png
import fs from "node:fs";
import path from "node:path";

const arg = (nombre, def) => { const i = process.argv.indexOf(`--${nombre}`); return i >= 0 ? process.argv[i + 1] : def; };
const CDP = arg("cdp");
const URL_INICIO = arg("url", "http://127.0.0.1:54331/zamorapp/inicio");
const CORREO = arg("correo", "admin@x");
const CLAVE = arg("clave", "clave-admin");
const REGISTRAR = arg("registrar"); // nombre de la PC; sin él, se exige que la PC ya esté registrada
const CAPTURA = arg("captura");
const ESPERA = Number(arg("espera", "180")) * 1000; // cuánto esperar la pantalla inicial y la copia de datos
const OBSERVAR = Number(arg("observar", "0")) * 1000; // solo mirar (consola, peticiones, navegación) durante N segundos
const PERFIL = arg("perfil"); // local: carpeta de perfil persistente, para que una segunda corrida conserve la sesión (como WebView2)

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const bitacora = [];
const anotar = (m) => { bitacora.push(m); console.log(m); };

async function conectar() {
  if (CDP) {
    const { chromium } = await import("playwright-core");
    const limite = Date.now() + 90_000;
    let ultimo = "";
    for (let intento = 0; ; intento++) {
      try { return { navegador: await chromium.connectOverCDP(CDP, { timeout: 5000 }), local: false }; }
      catch (e) {
        ultimo = e.message.split("\n")[0];
        if (intento % 10 === 0) anotar(`   esperando el puerto de depuración de la ventana (${CDP}): ${ultimo}`);
        if (Date.now() > limite) throw new Error(`No se pudo conectar a la ventana por CDP (${CDP}) en 90 s: ${ultimo}. ¿El programa se abrió con ZAMORAPP_PUERTO_DEPURACION=9333 (y la nube de prueba) y sin otro WebView2 de zamorApp vivo?`);
        await esperar(1000);
      }
    }
  }
  // Local: el Chromium de Playwright (PLAYWRIGHT_MODULO apunta al paquete "playwright" si no está en node_modules)
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULO || "playwright");
  if (PERFIL) return { navegador: await chromium.launchPersistentContext(PERFIL), local: true, persistente: true };
  return { navegador: await chromium.launch(), local: true };
}

async function paso(nombre, fn) {
  anotar(`== ${nombre}`);
  const t = Date.now();
  const r = await fn();
  anotar(`   listo en ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return r;
}

let salida = 0;
let pagina;
let navegador, local, persistente;
try {
  ({ navegador, local, persistente } = await conectar());
  const contexto = persistente ? navegador : navegador.contexts()[0] || await navegador.newContext();
  pagina = contexto.pages()[0] || await contexto.newPage();
  // Todo lo que el navegador diga o rechace queda en la salida de la prueba
  pagina.on("console", (m) => { if (["error", "warning"].includes(m.type())) anotar(`[consola ${m.type()}] ${m.text()}`); });
  pagina.on("pageerror", (e) => anotar(`[error de página] ${e.message}`));
  // Los prefetch que Next cancela al navegar (net::ERR_ABORTED) son normales; lo demás sí es un fallo
  pagina.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") anotar(`[petición fallida] ${r.method()} ${r.url()}: ${r.failure()?.errorText}`); });
  pagina.on("response", (r) => { if (r.status() >= 400) anotar(`[respuesta ${r.status()}] ${r.request().method()} ${r.url()}`); });
  pagina.on("framenavigated", (f) => { if (f === pagina.mainFrame()) anotar(`[navega] ${f.url()}`); });
  if (local) await pagina.goto(URL_INICIO);

  if (OBSERVAR) {
    // Modo diagnóstico: la persona usa la ventana y aquí queda todo lo que el navegador hizo o rechazó
    anotar(`observando la ventana ${OBSERVAR / 1000} s (en ${pagina.url()}); entra como siempre en el programa`);
    pagina.on("request", (r) => { if (/:5433[0-9]\/(auth|rest|storage|zamorapp)/.test(r.url())) anotar(`[petición] ${r.method()} ${r.url()}`); });
    pagina.on("response", (r) => { if (/:5433[0-9]\/(auth|rest|storage|zamorapp)/.test(r.url())) anotar(`[respuesta ${r.status()}] ${r.request().method()} ${r.url()} allow-headers="${r.headers()["access-control-allow-headers"] || ""}"`); });
    const fin = Date.now() + OBSERVAR;
    while (Date.now() < fin) {
      await esperar(5000);
      const hidratado = await pagina.evaluate(() => { const f = document.querySelector("form"); return f ? Object.keys(f).some((k) => k.startsWith("__reactFiber")) : null; }).catch(() => "?");
      const aviso = await pagina.evaluate(() => document.querySelector("[role=alert], .text-destructive")?.textContent || "").catch(() => "");
      anotar(`[estado] ${pagina.url()} formulario hidratado=${hidratado}${aviso ? ` aviso="${aviso}"` : ""}`);
    }
    anotar("RESULTADO: observación terminada (ver líneas anteriores)");
    throw Object.assign(new Error("fin de la observación"), { soloObservar: true });
  }

  await paso("esperar la pantalla inicial (puerta o app)", async () => {
    const limite = Date.now() + ESPERA;
    while (!/\/zamorapp\/inicio|:54332/.test(pagina.url())) {
      if (Date.now() > limite) throw new Error(`La ventana nunca llegó a la puerta ni a la app; quedó en ${pagina.url()}`);
      await esperar(1000);
    }
    anotar(`   en ${pagina.url()}`);
  });

  if (pagina.url().includes("/zamorapp/inicio")) {
    await paso("pantalla \"Preparar esta PC\"", async () => {
      await esperar(2500); // la página consulta /zamorapp/estado y decide si muestra el formulario o salta a la app
      if (pagina.url().includes("/zamorapp/inicio")) {
        const formularioVisible = await pagina.evaluate(() => { const f = document.getElementById("f"); return !!f && !f.hidden; });
        const texto = await pagina.evaluate(() => document.getElementById("texto")?.textContent || "");
        anotar(`   texto: ${texto}`);
        if (formularioVisible) {
          if (!REGISTRAR) throw new Error("La PC no está registrada y la prueba no pidió registrarla (--registrar)");
          await pagina.fill("#email", CORREO);
          await pagina.fill("#clave", CLAVE);
          await pagina.fill("#nombre", REGISTRAR);
          await pagina.click("#b");
        }
        // Registro y copia de datos: termina cuando la página salta a la app
        const limite = Date.now() + ESPERA;
        while (pagina.url().includes("/zamorapp/inicio")) {
          const error = await pagina.evaluate(() => document.getElementById("e")?.textContent || "").catch(() => "");
          if (error) throw new Error(`La puerta rechazó el registro de la PC: ${error}`);
          if (Date.now() > limite) throw new Error(`La copia de datos no terminó en ${ESPERA / 1000} s: ${await pagina.evaluate(() => document.getElementById("texto")?.textContent || "").catch(() => "")}`);
          await esperar(1000);
        }
      }
      anotar(`   la app abrió en ${pagina.url()}`);
    });
  }

  // Si la sesión quedó guardada de una apertura anterior, la app abre directo en el panel (así debe ser)
  const yaDentro = await paso("pantalla de ingreso de la app", async () => {
    await pagina.waitForURL(/\/(login|panel)/, { timeout: 60_000 });
    // La ventana debe seguir en el origen de la app (127.0.0.1:54332): si una redirección la manda a "localhost",
    // cambia de origen y la puerta local rechaza todas sus llamadas (CORS) sin registrar nada
    const origenEsperado = new URL(URL_INICIO).hostname === "localhost" ? "localhost" : "127.0.0.1";
    if (new URL(pagina.url()).hostname !== origenEsperado) throw new Error(`La app redirigió la ventana a ${pagina.url()}: cambió el origen (debía seguir en ${origenEsperado})`);
    if (/\/panel/.test(pagina.url())) {
      await pagina.waitForSelector("h1", { timeout: 60_000 });
      anotar(`   la sesión se conservó de una apertura anterior: ya está en el panel ("${(await pagina.evaluate(() => document.querySelector("h1")?.textContent || "")).trim()}")`);
      return true;
    }
    await pagina.waitForSelector("#correo", { timeout: 60_000 });
    const textoBoton = await pagina.evaluate(() => document.querySelector("button[type=submit]")?.textContent || "");
    anotar(`   botón: "${textoBoton.trim()}"`);
    if (/demo/i.test(textoBoton)) throw new Error("La app está en modo demo: no tiene grabada la dirección de la puerta (NEXT_PUBLIC_SUPABASE_URL)");
    // Sin hidratación React nunca instala onSubmit: "Ingresar" haría un envío nativo GET /login?correo=... y nada llegaría a la puerta
    await pagina.waitForFunction(() => {
      const f = document.querySelector("form");
      return !!f && Object.keys(f).some((k) => k.startsWith("__reactFiber"));
    }, null, { timeout: 60_000 }).catch(() => { throw new Error("La pantalla de ingreso no se hidrató: React nunca instaló los manejadores del formulario (¿no cargan los scripts /_next/static?)"); });
    return false;
  });

  if (!yaDentro) await paso(`entrar como ${CORREO}`, async () => {
    await pagina.fill("#correo", CORREO);
    await pagina.fill("#clave", CLAVE);
    await pagina.click("button[type=submit]");
    const limite = Date.now() + 90_000;
    for (;;) {
      const url = pagina.url();
      if (/\/panel/.test(url)) break;
      if (/[?&]correo=/.test(url)) throw new Error("El formulario se envió sin JavaScript (GET /login?correo=...): la pantalla no estaba hidratada");
      const error = await pagina.evaluate(() => document.querySelector("[role=alert], .text-destructive")?.textContent || "").catch(() => "");
      if (error) throw new Error(`La app mostró un error al entrar: ${error}`);
      if (Date.now() > limite) throw new Error(`Tras pulsar Ingresar la app no llegó al panel en 90 s; quedó en ${url}`);
      await esperar(500);
    }
    await pagina.waitForSelector("h1", { timeout: 60_000 });
    anotar(`   panel: "${(await pagina.evaluate(() => document.querySelector("h1")?.textContent || "")).trim()}"`);
  });

  await paso("recargar el panel: la sesión se mantiene", async () => {
    await pagina.reload({ waitUntil: "domcontentloaded" });
    await esperar(1500);
    if (!/\/panel/.test(pagina.url())) throw new Error(`Al recargar, la app rebotó a ${pagina.url()}: la sesión no se conservó`);
  });

  // Las descargas de la app (Excel, PDF) deben quedar en la carpeta Descargas de Windows (solo con la ventana real)
  if (CDP) await paso("una descarga de la app queda en Descargas", async () => {
    const { default: os } = await import("node:os");
    const { default: fs } = await import("node:fs");
    const { default: path } = await import("node:path");
    const descargas = path.join(os.homedir(), "Downloads");
    const esperarArchivo = async (destino, que) => {
      const limite = Date.now() + 20_000;
      while (!fs.existsSync(destino) && Date.now() < limite) await esperar(500);
      if (!fs.existsSync(destino)) throw new Error(`${que}: la descarga no apareció en ${destino} (¿el programa rechaza las descargas?)`);
      anotar(`   ${que}: guardada en ${destino}`);
      fs.rmSync(destino, { force: true });
    };
    // 1) Respuesta del servidor con Content-Disposition: attachment (como exportar a Excel), sin salir de la página
    const puerta = new URL(URL_INICIO).origin;
    const nombre1 = `prueba-zamorapp-${Date.now()}.txt`;
    await pagina.evaluate((u) => { window.location.assign(u); }, `${puerta}/zamorapp/descarga-prueba?nombre=${nombre1}`);
    await esperarArchivo(path.join(descargas, nombre1), "adjunto del servidor");
    if (!/\/panel/.test(pagina.url())) throw new Error(`La descarga sacó la ventana del panel: ${pagina.url()}`);
    // 2) Archivo armado en la página (blob + enlace con download), como un PDF o CSV generado en el navegador
    const nombre2 = `prueba-zamorapp-${Date.now()}-blob.txt`;
    await pagina.evaluate((n) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["hola"], { type: "text/plain" })); a.download = n; document.body.append(a); a.click(); a.remove(); }, nombre2);
    await esperarArchivo(path.join(descargas, nombre2), "archivo generado en la página");
  });

  await paso("sin service worker ni cachés en el programa de escritorio", async () => {
    // Un SW con caché de una versión anterior haría correr JavaScript viejo tras instalar encima
    const { sw, caches: cachesVivas } = await pagina.evaluate(async () => ({
      sw: (await navigator.serviceWorker?.getRegistrations?.() || []).map((r) => r.scope),
      caches: typeof caches === "undefined" ? [] : await caches.keys(),
    }));
    if (sw.length || cachesVivas.length) throw new Error(`Quedó un service worker (${sw.join(", ") || "-"}) o cachés (${cachesVivas.join(", ") || "-"}) en la ventana`);
  });

  anotar("RESULTADO: ingreso por la ventana correcto");
} catch (e) {
  if (!e.soloObservar) {
    salida = 1;
    anotar(`RESULTADO: FALLÓ: ${e.message}`);
  }
} finally {
  if (CAPTURA) {
    fs.mkdirSync(path.dirname(CAPTURA), { recursive: true });
    if (pagina) {
      try { await pagina.screenshot({ path: CAPTURA, fullPage: false }); anotar(`captura: ${CAPTURA}`); } catch (e) { anotar(`sin captura: ${e.message}`); }
    }
    // La bitácora completa queda junto a la captura (en el CI viaja en el mismo artefacto)
    try { fs.writeFileSync(CAPTURA.replace(/\.png$/i, "") + ".log", bitacora.join("\n") + "\n"); } catch { /* sin bitácora en disco */ }
  }
  if (navegador) { if (local) await navegador.close(); else await navegador.close().catch(() => {}); } // por CDP solo se desconecta; la ventana sigue
}
process.exit(salida);
