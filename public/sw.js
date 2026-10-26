// Service worker de zamorApp: permite instalarla como app y muestra un aviso si no hay conexión.
// Los datos siempre se leen en línea; solo se guardan en caché los archivos estáticos de la app.
const CACHE = "zamorapp-v1";
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
