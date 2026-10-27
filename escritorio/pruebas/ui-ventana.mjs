// Prueba de la ventana real de zamorApp Escritorio: registra la PC (si hace falta) y entra con usuario y
// clave manejando el WebView2 por CDP (Chrome DevTools Protocol), igual que lo haría una persona.
// Así el CI detecta lo que una petición HTTP a la puerta no ve: un formulario que no se hidrata, un
// error de consola, una petición que el navegador bloquea o un rebote a la pantalla de ingreso.
//
// Windows (CI): abrir el programa con ZAMORAPP_PUERTO_DEPURACION=9333 (junto con la nube de prueba) y luego
//   node ui-ventana.mjs --cdp http://127.0.0.1:9333 --correo admin@x --clave clave-admin --registrar "PC de prueba" --captura capturas/1.png
// Local (Linux, con el Chromium de Playwright, puerta y app ya corriendo):
//   node ui-ventana.mjs --url http://127.0.0.1:54331/zamorapp/inicio --correo admin@x --clave clave-admin --registrar "PC de prueba"
// Impresión (--imprimir <carpeta>, solo Windows): abre el informe de vigilancia como Cesar (su propia ventana), lo guarda
//   en PDF (el programa lo deja en esa carpeta sin diálogo: ZAMORAPP_PDF_PRUEBA) y comprueba que «Imprimir» abra el
//   diálogo de impresoras de Windows (lo busca y lo cierra con UI Automation).
// Diagnóstico en la PC de una persona (no toca nada: solo mira lo que hace la ventana mientras ella entra):
//   node ui-ventana.mjs --cdp http://127.0.0.1:9333 --observar 120 --captura diagnostico.png
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const arg = (nombre, def) => { const i = process.argv.indexOf(`--${nombre}`); return i >= 0 ? process.argv[i + 1] : def; };
const CDP = arg("cdp");
const URL_INICIO = arg("url", "http://127.0.0.1:54331/zamorapp/inicio");
const CORREO = arg("correo", "admin@x");
const CLAVE = arg("clave", "clave-admin");
const REGISTRAR = arg("registrar"); // nombre de la PC; sin él, se exige que la PC ya esté registrada
const CAPTURA = arg("captura");
const ESPERA = Number(arg("espera", "180")) * 1000; // cuánto esperar la pantalla inicial y la copia de datos
const OBSERVAR = Number(arg("observar", "0")) * 1000; // solo mirar (consola, peticiones, navegación) durante N segundos
const IMPRIMIR = arg("imprimir"); // carpeta donde el programa guarda el PDF de prueba (ZAMORAPP_PDF_PRUEBA)
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

  await paso("sin service worker ni cachés en el programa de escritorio", async () => {
    // Un SW con caché de una versión anterior haría correr JavaScript viejo tras instalar encima
    const { sw, caches: cachesVivas } = await pagina.evaluate(async () => ({
      sw: (await navigator.serviceWorker?.getRegistrations?.() || []).map((r) => r.scope),
      caches: typeof caches === "undefined" ? [] : await caches.keys(),
    }));
    if (sw.length || cachesVivas.length) throw new Error(`Quedó un service worker (${sw.join(", ") || "-"}) o cachés (${cachesVivas.join(", ") || "-"}) en la ventana`);
  });

  if (IMPRIMIR) {
    const documento = await paso("abrir el informe de vigilancia en su propia ventana", async () => {
      await pagina.goto(new URL("/reportes", pagina.url()).href, { waitUntil: "domcontentloaded" });
      const enlace = pagina.getByRole("link", { name: /Imprimir informe trimestral/ });
      await enlace.waitFor({ timeout: 60_000 });
      // Antes, en el escritorio, este clic no hacía nada: el navegador interno descartaba las ventanas nuevas.
      // El programa abre su propia ventana (un destino nuevo para CDP): se busca entre todas las páginas.
      await enlace.click();
      const todas = () => navegador.contexts().flatMap((c) => c.pages());
      let doc = null;
      for (const limite = Date.now() + 60_000; !doc && Date.now() < limite; await esperar(500)) {
        doc = todas().find((p) => p !== pagina && /\/imprimir\/vigilancia/.test(p.url())) ?? null;
      }
      if (!doc) throw new Error(`«Imprimir informe trimestral» no abrió la ventana del informe; páginas: ${todas().map((p) => p.url()).join(" | ")}`);
      doc.on("pageerror", (e) => anotar(`[error de página en el documento] ${e.message}`));
      doc.on("console", (m) => { if (m.type() === "error") anotar(`[consola del documento] ${m.text()}`); });
      await doc.waitForSelector("[data-accion=guardar-pdf]", { timeout: 60_000 }).catch(async () => {
        const texto = (await doc.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 300);
        throw new Error(`El documento abrió sin los botones del escritorio (Guardar PDF / Imprimir); muestra: ${texto}`);
      });
      anotar(`   ${doc.url()}`);
      return doc;
    });

    await paso("Guardar PDF", async () => {
      const antes = new Set(fs.existsSync(IMPRIMIR) ? fs.readdirSync(IMPRIMIR) : []);
      await documento.click("[data-accion=guardar-pdf]");
      const estado = await Promise.race([
        documento.waitForSelector("[data-estado=pdf-guardado]", { timeout: 120_000 }).then((e) => e.textContent()),
        documento.waitForSelector("[data-estado=error]", { timeout: 120_000 }).then(async (e) => { throw new Error(`Guardar PDF falló: ${await e.textContent()}`); }),
      ]);
      anotar(`   ${estado?.trim()}`);
      const nuevos = fs.readdirSync(IMPRIMIR).filter((f) => !antes.has(f) && f.endsWith(".pdf"));
      if (!nuevos.length) throw new Error(`No apareció ningún PDF nuevo en ${IMPRIMIR}`);
      const pdf = fs.readFileSync(path.join(IMPRIMIR, nuevos[0]));
      const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
      anotar(`   ${nuevos[0]}: ${(pdf.length / 1024).toFixed(0)} KB, ${paginas} página(s)`);
      if (pdf.subarray(0, 4).toString() !== "%PDF" || pdf.length < 5000) throw new Error("El PDF guardado está vacío o dañado");
    });

    await paso("Imprimir: diálogo de impresoras de Windows", async () => {
      await documento.click("[data-accion=imprimir]");
      // El diálogo es una ventana de Windows (no de la página): se busca por UI Automation, se informa y se cierra
      const ps = `
        Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
        $raiz = [Windows.Automation.AutomationElement]::RootElement
        $ventana = [Windows.Automation.Condition]::TrueCondition
        for ($i = 0; $i -lt 40; $i++) {
          foreach ($v in $raiz.FindAll([Windows.Automation.TreeScope]::Children, $ventana)) {
            foreach ($d in @($v) + @($v.FindAll([Windows.Automation.TreeScope]::Children, $ventana))) {
              if ($d.Current.Name -match '^(Print|Imprimir)$' -and $d.Current.ControlType.ProgrammaticName -eq 'ControlType.Window') {
                $proc = (Get-Process -Id $d.Current.ProcessId).ProcessName
                Write-Output "DIALOGO '$($d.Current.Name)' de $proc (dentro de '$($v.Current.Name)')"
                try { $d.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern).Close() } catch { Write-Output "no se pudo cerrar: $_" }
                exit 0
              }
            }
          }
          Start-Sleep -Milliseconds 500
        }
        Write-Output "SIN DIALOGO; ventanas: $(($raiz.FindAll([Windows.Automation.TreeScope]::Children, $ventana) | ForEach-Object { $_.Current.Name }) -join ' | ')"
        exit 1`;
      let salidaPs;
      try { salidaPs = execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8", timeout: 60_000 }); }
      catch (e) { throw new Error(`«Imprimir» no abrió el diálogo de impresoras: ${(e.stdout || e.message).trim()}`); }
      anotar(`   ${salidaPs.trim()}`);
      const error = await documento.evaluate(() => document.querySelector("[data-estado=error]")?.textContent || "");
      if (error) throw new Error(`La página avisó un error al imprimir: ${error}`);
    });
  }

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
