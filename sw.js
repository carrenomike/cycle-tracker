// The offline shell (ca9). Without this the app cannot be OPENED with no
// signal: index.html is only ever served from Chrome's own HTTP cache, and a
// miss there is Chrome's offline page, not this app — so the unsent queue, its
// banner and the manual flush are all unreachable in exactly the situation they
// were built for.
//
// RULE 1 — the page is NETWORK-FIRST. A cache-first worker is how an app pins
// itself to one version forever: deploy.bat would report success and the phone
// would keep running last week's safety engine. The cache is only ever the
// fallback for a request that actually failed.
//
// RULE 2 — this worker touches same-origin GETs and the one CDN script, and
// nothing else. Every read and write of the sheet goes to script.google.com, so
// those fall straight through: cycleCache stays the only copy of sheet data on
// the phone, and the staleness banner keeps reporting on all of it.

const CACHE = 'cycle-shell-v1';
const CHART = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', CHART];

self.addEventListener('install', e => {
  // addAll is all-or-nothing on purpose: a half-populated shell is worse than
  // none at all, because it looks installed and then fails on one file.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(err => { console.error('[sw] the shell could not be cached:', err); throw err; })
  );
});

self.addEventListener('activate', e => {
  // Drop every older shell, so bumping CACHE above is all it takes to retire one.
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;          // every write is a POST to the proxy
  const url = new URL(req.url);

  // Chart.js is a version-pinned, immutable URL, so a cached copy can never be
  // the wrong one. Cache-first; a miss goes to the network as normal.
  if (url.href === CHART) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }
  if (url.origin !== self.location.origin) return;   // the proxy, and anything else

  e.respondWith(
    fetch(req)
      .then(res => {
        // Keyed without the query string: ca7's selfRefresh() reloads to
        // "?v=<now>", and storing that would grow the cache by one entry per
        // rescue while leaving the plain URL stale.
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(url.origin + url.pathname, copy))
            .catch(err => console.error('[sw] could not refresh the cached shell:', err));
        }
        return res;
      })
      // ignoreSearch for the same reason: "?v=<now>" is the one navigation the
      // cache could otherwise never answer, and it only ever happens offline.
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || Response.error()))
  );
});
