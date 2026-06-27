const CACHE_NAME = 'my-parking-davy-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase') || event.request.url.includes('ipify')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});


self.addEventListener('push', event => {
  let data = { title: '🚗 Sesizare Nouă!', body: 'Ai primit o sesizare nouă în My Parking Davy.', icon: './icons/icon-192.png' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'new-complaint',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || './#admin' },
      actions: [
        { action: 'open', title: '📋 Deschide Admin' },
        { action: 'dismiss', title: 'Închide' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || './#admin';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('my-parking-davy') && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});


self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, url } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'new-complaint-' + Date.now(),
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: url || './#admin' },
      actions: [
        { action: 'open', title: '📋 Deschide Admin' },
        { action: 'dismiss', title: 'Închide' }
      ]
    });
  }
});
