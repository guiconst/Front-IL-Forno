// =====================================================
//  Service Worker — Pizzaria IL Forno
//  Estratégia: Cache-first para assets estáticos,
//              Network-first para a API do cardápio.
// =====================================================

const CACHE_NAME = 'ilforno-v1';
const API_CACHE_NAME = 'ilforno-api-v1';

// Assets estáticos que serão cacheados na instalação
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/images/logoPizza.png',
  '/assets/images/pizzaBanner_PNG.png',
  '/assets/images/whatsapp.png',
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&display=swap',
  'https://cdn.tailwindcss.com',
];

// ─── INSTALL ───────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando assets estáticos');
      // Adiciona cada asset individualmente para não falhar tudo se um erro
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`[SW] Falha ao cachear ${url}:`, err)
          )
        )
      );
    })
  );
  self.skipWaiting();
});

// ─── ACTIVATE ──────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME)
          .map((name) => {
            console.log('[SW] Removendo cache antigo:', name);
            return caches.delete(name);
          })
      )
    )
  );
  self.clients.claim();
});

// ─── FETCH ─────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET e extensões de browser
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Requisições à API do cardápio: Network-first com fallback de cache
  if (url.hostname === 'backend-il-forno.vercel.app') {
    event.respondWith(networkFirstWithCache(request, API_CACHE_NAME));
    return;
  }

  // Assets estáticos e demais: Cache-first com fallback de rede
  event.respondWith(cacheFirstWithNetwork(request));
});

// ─── ESTRATÉGIAS ───────────────────────────────────

/**
 * Cache-first: retorna do cache se existir, senão busca na rede e cacheia.
 */
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Fallback offline para a página principal
    if (request.destination === 'document') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network-first: tenta a rede primeiro, cai pro cache se falhar.
 * Ideal para dados da API que precisam estar atualizados.
 */
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    console.warn('[SW] Offline, buscando API do cache:', request.url);
    const cached = await cache.match(request);
    if (cached) return cached;
    // Retorna JSON de erro amigável
    return new Response(
      JSON.stringify({ error: 'Sem conexão. Mostrando cardápio salvo.' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ─── PUSH NOTIFICATIONS (pronto para uso futuro) ───
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'Nova mensagem da Pizzaria IL Forno!',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pizzaria IL Forno', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
