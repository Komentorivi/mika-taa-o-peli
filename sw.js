// Taustapalvelu asennettavaa sovellusta varten (2026-11-13): verkko ensin, jotta päivitykset näkyvät heti;
// välimuisti vain ilman nettiä. Ei koske muiden palvelimien pyyntöihin (LootLocker, fontit, Tailwind).
const V = 'mika-taa-o-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(['./', './en/', './ikonit/ikoni-192.png']))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const k = r.clone(); caches.open(V).then(c => c.put(e.request, k)); return r; })
    .catch(() => caches.match(e.request).then(m => m || caches.match('./'))));
});
