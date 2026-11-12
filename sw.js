const SHELL = 'route-shell-v1', TILES = 'route-tiles-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
const isTile = u => /basemaps\.cartocdn\.com|tile\.openstreetmap\.org|arcgisonline\.com/.test(u.hostname);
let puts = 0;
async function trim(){ const c = await caches.open(TILES); const k = await c.keys(); for (let i = 0; i < k.length - 4000; i++) await c.delete(k[i]); }
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isTile(url)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); if (++puts % 200 === 0) trim(); } return r; }
      catch (err) { return hit || Response.error(); }
    }));
  } else if (url.hostname === 'unpkg.com') {
    e.respondWith(caches.match(req).then(h => h || fetch(req)));
  } else if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { const cl = r.clone(); caches.open(SHELL).then(c => c.put(req, cl)); return r; }).catch(() => caches.match(req).then(h => h || caches.match('./index.html'))));
  }
});
