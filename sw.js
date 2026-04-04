const CACHE_NAME = "controle-dividas-v1";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./visual.css",
  "./app.js",
  "./manifest.json"
];

/* =========================================================
   INSTALL
   Faz o cache dos arquivos estáticos do PWA.
   ========================================================= */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

/* =========================================================
   ACTIVATE
   Remove caches antigos e assume o controle imediatamente.
   ========================================================= */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* =========================================================
   FETCH
   Estratégia simples: tenta cache primeiro e depois rede.
   ========================================================= */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
