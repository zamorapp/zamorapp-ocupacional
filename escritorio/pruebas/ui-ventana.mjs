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
const NUBE_MARCA = arg("nube-marca"); // archivo que pone a la nube simulada «migrada por delante» (ver nube-cli.mjs)
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

  // Las descargas de la app (Excel, PDF) deben quedar en la carpeta Descargas de Windows (solo con la ventana real)
  if (CDP) await paso("una descarga de la app queda en Descargas", async () => {
    const { default: os } = await import("node:os");
    const { default: fs } = await import("node:fs");
    const { default: path } = await import("node:path");
    const descargas = path.join(os.homedir(), "Downloads");
    // Playwright, al conectarse por CDP, se queda con las descargas del navegador (Browser.setDownloadBehavior) y el
    // programa nunca las ve. Se devuelve el comportamiento normal para probar el gestor de descargas del programa.
    const sesion = await navegador.newBrowserCDPSession();
    await sesion.send("Browser.setDownloadBehavior", { behavior: "default", eventsEnabled: true });
    sesion.on("Browser.downloadWillBegin", (e) => anotar(`   [descarga empieza] ${e.suggestedFilename} ${e.url.slice(0, 80)}`));
    sesion.on("Browser.downloadProgress", (e) => { if (e.state !== "inProgress") anotar(`   [descarga ${e.state}]`); });
    pagina.on("response", (r) => { if (r.url().includes("descarga-prueba")) anotar(`   [respuesta ${r.status()}] ${r.url()} ${r.headers()["content-disposition"] || ""}`); });
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
    await pagina.evaluate((u) => { const a = document.createElement("a"); a.href = u; a.textContent = "Exportar"; document.body.append(a); a.click(); a.remove(); }, `${puerta}/zamorapp/descarga-prueba?nombre=${nombre1}`);
    await esperarArchivo(path.join(descargas, nombre1), "adjunto del servidor");
    if (!/\/panel/.test(pagina.url())) throw new Error(`La descarga sacó la ventana del panel: ${pagina.url()}`);
    // 2) Archivo armado en la página (blob + enlace con download), como un PDF o CSV generado en el navegador
    const nombre2 = `prueba-zamorapp-${Date.now()}-blob.txt`;
    await pagina.evaluate((n) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["hola"], { type: "text/plain" })); a.download = n; document.body.append(a); a.click(); a.remove(); }, nombre2);
    await esperarArchivo(path.join(descargas, nombre2), "archivo generado en la página");
  });

  // 27/10/2026: la nube recibió una migración antes de que la PC se actualizara y la app quedó en «Application
  // error». Ahora, con la nube simulada migrada por delante, la app debe mostrar la pantalla «necesita
  // actualizarse» y el programa anotar en arranque.log que la nube va por delante (en una PC real ofrecería actualizar).
  if (NUBE_MARCA) await paso("la nube va por delante del programa: la app avisa que hay una versión nueva, no se cae", async () => {
    fs.writeFileSync(NUBE_MARCA, String(Date.now()));
    const registro = !local && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "zamorApp", "arranque.log") : null;
    const esperarEnRegistro = async (patron, que, ms) => {
      if (!registro) return;
      const limite = Date.now() + ms;
      while (Date.now() < limite) { if (patron.test(fs.readFileSync(registro, "utf8"))) { anotar(`   ${que} (arranque.log)`); return; } await esperar(1000); }
      throw new Error(`${que}: no apareció en arranque.log en ${ms / 1000} s`);
    };
    try {
      // Al recargar el panel, la app le pide datos a la nube; la puerta ve el 42501 y lo marca
      await pagina.goto(pagina.url().replace(/\/panel.*$/, "/panel"), { waitUntil: "domcontentloaded" });
      const limite = Date.now() + 45_000;
      let estado = null;
      while (Date.now() < limite) {
        estado = await pagina.evaluate(async (u) => (await fetch(`${u}/zamorapp/estado`, { credentials: "include" })).json(), new URL(URL_INICIO).origin);
        if (estado.actualizar === true) break;
        await esperar(1000);
      }
      if (estado?.actualizar !== true) throw new Error(`La puerta no marcó la nube como adelantada: ${JSON.stringify(estado)}`);
      anotar(`   puerta: incompatible ${JSON.stringify(estado.incompatible)}`);
      // El aviso de arriba (o la pantalla de error, si la página se cayó del todo) con sus botones
      const aviso = pagina.locator('[data-aviso="actualizar"], main[data-estado="actualizar"]').first();
      await aviso.waitFor({ timeout: 30_000 });
      anotar(`   aviso: "${(await aviso.textContent())?.replace(/\s+/g, " ").trim().slice(0, 120)}"`);
      if (!/versión nueva/.test(await aviso.textContent() || "")) throw new Error("El aviso no dice que hay una versión nueva");
      // El programa mira /zamorapp/estado cada 10 s y lo deja anotado (en pruebas no abre el diálogo de actualizar)
      await esperarEnRegistro(/la nube va por delante/, "el programa lo detectó", 45_000);
      // Botón «Buscar actualización»: la puerta se lo pasa al programa (en pruebas solo lo anota)
      await aviso.getByRole("button", { name: "Buscar actualización" }).click();
      await esperarEnRegistro(/actualización pedida desde la pantalla/, "«Buscar actualización» llegó al programa", 30_000);
      // Botón «Trabajar en la web»: abre el navegador de Windows (la puerta responde qué hizo)
      const respuestaWeb = pagina.waitForResponse((r) => r.url().includes("/zamorapp/abrir-web"));
      await aviso.getByRole("button", { name: "Trabajar en la web" }).click();
      const rw = await (await respuestaWeb).json();
      anotar(`   «Trabajar en la web»: ${JSON.stringify(rw)}`);
      if (!/vercel\.app/.test(rw.url || "")) throw new Error("«Trabajar en la web» no apunta a la web de zamorApp");
      if (process.platform === "win32" && !rw.abierto) throw new Error("«Trabajar en la web» no abrió el navegador");
      // «Ignorar» (si es el aviso de arriba) lo esconde hasta la próxima apertura, sin bloquear nada
      const ignorar = aviso.getByRole("button", { name: /Ignorar/ });
      if (await ignorar.count()) { await ignorar.click(); await aviso.waitFor({ state: "detached", timeout: 10_000 }); anotar("   «Ignorar» lo escondió"); }
    } finally {
      fs.rmSync(NUBE_MARCA, { force: true });
      await esperar(1500); // la nube simulada mira la marca cada 300 ms
    }
    // Con la nube normal otra vez, el panel vuelve a cargar
    await pagina.goto(pagina.url().replace(/\/panel.*$/, "/panel"), { waitUntil: "domcontentloaded" });
    await pagina.waitForURL(/\/panel/, { timeout: 30_000 });
    if (await pagina.locator('main[data-estado]').count()) throw new Error(`Con la nube normal el panel sigue en error: ${await pagina.locator("h1").first().textContent()}`);
    anotar("   con la nube normal, el panel volvió");
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
      // El diálogo de impresoras es modal y bloquea la página: un click de Playwright se queda esperando que la página
      // responda. Se pulsa el botón desde la propia página, sin esperarla, y el diálogo se busca afuera.
      await documento.evaluate(() => { setTimeout(() => document.querySelector("[data-accion=imprimir]")?.click(), 100); });
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
