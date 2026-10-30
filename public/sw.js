// Service worker de zamorApp: permite instalarla como app y muestra un aviso si no hay conexión.
// Los datos siempre se leen en línea; solo se guardan en caché los archivos estáticos de la app.
// También muestra los avisos al celular (push) cuando RR. HH. se registra, pide citas o hace solicitudes (lib/push.ts).
const CACHE = "zamorapp-v2";
const SIN_CONEXION = "/sin-conexion.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SIN_CONEXION, "/icono.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (request.mode === "navigate") {
    e.respondWith(fetch(request).catch(() => caches.match(SIN_CONEXION)));
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
    badge: "/icono-192.png",
    data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/panel" },
    tag: d.url || "zamorapp",
    renotify: true,
  }));
});

// Al tocar el aviso: abre zamorApp en la pantalla del aviso (reusa una pestaña abierta si la hay)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "/panel", location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
    const abierta = lista.find((c) => c.url.startsWith(location.origin));
    if (abierta) return abierta.navigate(destino).then((c) => (c || abierta).focus()).catch(() => self.clients.openWindow(destino));
    return self.clients.openWindow(destino);
  }));
});
