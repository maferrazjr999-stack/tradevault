// ══════════════════════════════════════════════════
// TradeVault — Service Worker
//
// A versão do cache é controlada pelo query param ?v=
// passado no momento do registro (dentro do index.html).
// Não é necessário editar este arquivo a cada deploy —
// basta atualizar a constante BUILD no index.html.
// ══════════════════════════════════════════════════

const CACHE_VERSION = new URL(location.href).searchParams.get('v') || 'default';
const CACHE_NAME    = `tradevault-${CACHE_VERSION}`;

// Recursos que serão cacheados no install
const PRECACHE = [
  './',
  './index.html',
];

// ── INSTALL: guarda recursos no cache ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  // Assume controle imediatamente quando o HTML solicitar
  self.skipWaiting();
});

// ── ACTIVATE: remove caches antigos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('tradevault-') && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first para HTML, cache-first para o resto ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Sempre busca na rede para requests de API externa (Firebase, exchangerate)
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('exchangerate-api') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('fonts.googleapis') ||
    url.hostname.includes('cdnjs')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first para o próprio HTML (garante versão atualizada)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first para demais assets estáticos
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});

// ── MESSAGE: permite que o HTML solicite skipWaiting ──
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
