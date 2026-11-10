// Vani service worker: works offline and picks up new releases straight away.
const CACHE = 'vani-v1';   // bump on every release, together with core.js?v= in index.html
const SHELL = ['./', 'index.html', 'core.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'index.json', 'books.json'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE)
  .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));

// Old releases go; the texts read from the archive ('vani-texts') stay
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((k) => Promise.all(k.filter((x) => x.startsWith('vani-v') && x !== CACHE).map((x) => caches.delete(x))))
  .then(() => self.clients.claim())));

const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {            // network first (always checked with GitHub), 4 s, then cache
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
        const r = await Promise.race([net, new Promise((_, j) => setTimeout(() => j(), 4000))]);
        if (r.ok) c.put(req, r.clone());
        return r;
      } catch {
        return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
      }
    })());
    return;
  }
  if (FONTS.test(req.url)) e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { c.put(req, r.clone()); return r; })));
  // the archive and the recordings: left to the page, which keeps texts in 'vani-texts'
});
