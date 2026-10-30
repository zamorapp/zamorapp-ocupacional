// Service worker de zamorApp: permite instalarla como app, muestra un aviso si no hay conexión y guarda la pantalla
// «sin internet» del celular (/movil) para abrirla sin señal. Los datos de esa pantalla viven cifrados en el teléfono
// (IndexedDB, src/lib/movil); aquí solo se guardan archivos de la app, nunca datos de pacientes.
// También muestra los avisos al celular (push) cuando RR. HH. se registra, pide citas o hace solicitudes (lib/push.ts).
const CACHE = "zamorapp-v3";
// Caché aparte y estable para /movil: una versión nueva de la app no puede borrar los archivos de la pantalla que
// el teléfono necesita sin señal. Se renueva entera cada vez que /movil abre con internet.
const MOVIL = "zamorapp-movil-v1";
const SIN_CONEXION = "/sin-conexion.html";
const ESPERA_RED = 4000; // con señal débil, a los 4 s se abre lo guardado

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SIN_CONEXION, "/icono.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== MOVIL).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const conTiempo = (promesa, ms) => new Promise((ok, mal) => {
  const t = setTimeout(() => mal(new Error("lento")), ms);
  promesa.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); mal(e); });
});

// Guarda /movil y exactamente los archivos que nombra su HTML; borra los de versiones anteriores
// (salvo las fuentes, que las pide el CSS y no aparecen en el HTML)
async function guardarMovil(respuesta) {
  const html = await respuesta.clone().text();
  const archivos = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)].map((m) => m[0]))];
  const c = await caches.open(MOVIL);
  await Promise.all(archivos.map(async (u) => {
    if (await c.match(u)) return;
    const r = await fetch(u).catch(() => null);
    if (r && r.ok) await c.put(u, r);
  }));
  await c.put("/movil", respuesta);
  const quedan = new Set(archivos);
  for (const req of await c.keys()) {
    const p = new URL(req.url).pathname;
    if (p !== "/movil" && !quedan.has(p) && !p.startsWith("/_next/static/media/")) await c.delete(req);
  }
}

async function abrirMovil(request) {
  try {
    const r = await conTiempo(fetch(request), ESPERA_RED);
    // Solo la pantalla de verdad (con sesión); una redirección al ingreso no se guarda como /movil
    if (r.ok && !r.redirected && new URL(r.url).pathname === "/movil") guardarMovil(r.clone()).catch(() => {});
    return r;
  } catch {
    return (await caches.match("/movil", { cacheName: MOVIL })) ?? (await caches.match(SIN_CONEXION));
  }
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (request.mode === "navigate") {
    if (url.pathname === "/movil") { e.respondWith(abrirMovil(request)); return; }
    // Cualquier otra pantalla sin señal: si el teléfono tiene la pantalla sin internet, se va a ella
    e.respondWith(fetch(request).catch(async () =>
      (await caches.match("/movil", { cacheName: MOVIL })) ? Response.redirect("/movil", 302) : caches.match(SIN_CONEXION)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(request).then((guardado) =>
        guardado ?? fetch(request).then((r) => {
          if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(request, copia)); }
          return r;
        }),
      ),
    );
  }
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "zamorApp", {
    body: d.cuerpo || "",
    icon: "/icono-192.png",
    badge: "/insignia-aviso.png", // silueta blanca (rama diseno/icono-ocupavida)
    data: { url: typeof d.url === "string" && /^\/(?!\/)/.test(d.url) ? d.url : "/panel" }, // solo rutas propias, nunca «//sitio-ajeno»
    tag: d.url || "zamorapp",
    renotify: true,
  }));
});

// Al tocar el aviso: abre zamorApp en la pantalla del aviso (reusa una pestaña abierta si la hay)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/panel", location.origin);
  const destino = url.origin === location.origin ? url.href : new URL("/panel", location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
    const abierta = lista.find((c) => c.url.startsWith(location.origin));
    if (abierta) return abierta.navigate(destino).then((c) => (c || abierta).focus()).catch(() => self.clients.openWindow(destino));
    return self.clients.openWindow(destino);
  }));
});
