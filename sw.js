const CACHE_NAME = 'my-parking-davy-v2';
const STATE_CACHE = 'app-state';

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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== STATE_CACHE).map(k => caches.delete(k)))
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

async function getCredentials() {
  const cache = await caches.open(STATE_CACHE);
  const resp = await cache.match('supabase-credentials');
  if (!resp) return null;
  return await resp.json();
}

async function getLastChecked() {
  const cache = await caches.open(STATE_CACHE);
  const resp = await cache.match('last-complaint-check');
  if (resp) return await resp.text();
  return new Date(Date.now() - 5 * 60 * 1000).toISOString();
}

async function setLastChecked(isoString) {
  const cache = await caches.open(STATE_CACHE);
  await cache.put('last-complaint-check', new Response(isoString));
}

async function checkForNewComplaints() {
  const creds = await getCredentials();
  if (!creds) {
    console.warn('[SW] Fără credențiale — skip verificare.');
    return;
  }

  try {
    const lastChecked = await getLastChecked();
    const now = new Date().toISOString();

    const url = `${creds.supabaseUrl}/rest/v1/complaints?submitted_at=gt.${encodeURIComponent(lastChecked)}&select=id,complaint_type,description,submitted_at&order=submitted_at.desc&limit=5`;

    const resp = await fetch(url, {
      headers: {
        'apikey': creds.supabaseKey,
        'Authorization': `Bearer ${creds.supabaseKey}`
      }
    });

    if (!resp.ok) {
      console.warn('[SW] Fetch sesizări eșuat:', resp.status);
      return;
    }

    const complaints = await resp.json();
    await setLastChecked(now);

    if (!complaints || complaints.length === 0) return;

    const c = complaints[0];
    const type = c.complaint_type || 'Sesizare';
    const desc = (c.description || '').substring(0, 80);
    const body = `${type}${desc ? ': ' + desc : ''}`;
    const count = complaints.length;
    const title = count > 1 ? `🚗 ${count} Sesizări Noi!` : '🚗 Sesizare Nouă!';

    await self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'new-complaint',
      renotify: true,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: { url: './#admin' },
      actions: [
        { action: 'open', title: '📋 Deschide Admin' },
        { action: 'dismiss', title: 'Închide' }
      ]
    });
  } catch (e) {
    console.error('[SW] Eroare la verificare sesizări:', e);
  }
}

self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-new-complaints') {
    event.waitUntil(checkForNewComplaints());
  }
});

self.addEventListener('push', event => {
  let data = {
    title: '🚗 Sesizare Nouă!',
    body: 'Ai primit o sesizare nouă în My Parking Davy.',
    icon: './icons/icon-192.png',
    url: './#admin'
  };

  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch { }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'new-complaint',
      renotify: true,
      vibrate: [200, 100, 200],
      requireInteraction: true,
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
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SET_CREDENTIALS') {
    caches.open(STATE_CACHE).then(cache => {
      cache.put('supabase-credentials', new Response(JSON.stringify({
        supabaseUrl: event.data.supabaseUrl,
        supabaseKey: event.data.supabaseKey
      })));
      console.log('[SW] Credențiale primite și stocate.');
    });
    return;
  }

  if (event.data.type === 'SHOW_NOTIFICATION') {
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
    return;
  }

  if (event.data.type === 'FORCE_CHECK') {
    checkForNewComplaints();
  }
});
