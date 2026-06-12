const SHELL_CACHE = 'socialflow-shell-v1';

/** Cache API 仅支持 http/https；扩展、data、blob 等 scheme 必须跳过 */
function shouldHandleFetch(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.pathname.startsWith('/api/')) return false;
  return true;
}

function putInShellCache(request, response) {
  return caches.open(SHELL_CACHE).then((cache) => cache.put(request, response)).catch(() => undefined);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(['./', './index.html'])).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!shouldHandleFetch(req)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void putInShellCache(new Request('./index.html'), copy);
          return res;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void putInShellCache(req, copy);
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SocialFlow', body: event.data.text() };
  }
  const title = payload.title || 'SocialFlow';
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'socialflow-notify',
    data: {
      url: payload.url || '/messages',
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/messages';
  event.waitUntil(clients.openWindow(url));
});
