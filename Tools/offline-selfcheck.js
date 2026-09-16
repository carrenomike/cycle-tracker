#!/usr/bin/env node
// Offline check for ca9's shell: sw.js's routing rules, and the page's guarded
// registration of it.
//
//   node Tools/offline-selfcheck.js
//
// A service worker cannot actually run here — the real cold-start test is Mike's,
// on the phone, in aeroplane mode. What IS testable offline is the part that can
// do real harm: the ORDER of network and cache for the page itself. A worker that
// answers index.html from the cache first pins the phone to an old safety engine
// while deploy.bat reports success, and nothing on screen would ever say so.

const fs = require('fs');
const path = require('path');
const { bootPage } = require('./page-harness.js');

let failed = 0;
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const is = (got, want, what) =>
  got === want ? pass(what) : fail(`${what} — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

// ── A stub worker global, just real enough to run sw.js's fetch handler ─────
// Deliberately dumb, like page-harness: anything sw.js needs that is missing
// here shows up as the failure it would be on the phone.
function loadWorker(opts) {
  const listeners = {};
  const store = new Map(opts.cached || []);   // full url -> body string
  const log = { puts: [], deleted: [], networkHits: [] };

  const cacheApi = {
    open: async () => ({
      addAll: async urls => { for (const u of urls) store.set(u, 'precached'); },
      put: async (k, v) => { log.puts.push(String(k)); store.set(String(k), v); },
    }),
    keys: async () => opts.cacheNames || [],
    delete: async k => { log.deleted.push(k); return true; },
    // The real Cache API matches on the full URL; ignoreSearch drops the query.
    match: async (req, o) => {
      const u = new URL(typeof req === 'string' ? req : req.url);
      if (store.has(u.href)) return { from: 'cache', url: u.href, ok: true, clone: () => ({}) };
      const bare = u.origin + u.pathname;
      if (o && o.ignoreSearch && store.has(bare)) {
        return { from: 'cache', url: bare, ok: true, clone: () => ({}) };
      }
      return undefined;
    },
  };

  const env = {
    self: {
      location: { origin: 'https://example.github.io' },
      addEventListener: (name, fn) => { listeners[name] = fn; },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    caches: cacheApi,
    fetch: async req => {
      log.networkHits.push(typeof req === 'string' ? req : req.url);
      if (opts.offline) throw new Error('offline');
      return { from: 'network', url: req.url, ok: true, clone: () => ({}) };
    },
    Response: { error: () => ({ from: 'neterror', ok: false }) },
    URL: URL,
    console: console,
  };
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  new Function(...Object.keys(env), src)(...Object.values(env));
  return { listeners, store, log };
}

// What the worker answered a GET with, or the string 'passthrough' when it
// declined to answer at all — which is the whole of RULE 2.
async function ask(w, url, method) {
  let answer = 'passthrough';
  w.listeners.fetch({
    request: { url: url, method: method || 'GET' },
    respondWith: p => { answer = p; },
    waitUntil: p => p,
  });
  return answer === 'passthrough' ? 'passthrough' : (await answer);
}

// The put() inside the fetch handler is deliberately not awaited, so give it a
// turn before reading the log. (Three checks in this plan have gone green on an
// unresolved promise; this is the shape that does it.)
const settle = () => new Promise(r => setImmediate(r));

const PAGE  = 'https://example.github.io/cycle/';
const PROXY = 'https://script.google.com/macros/s/AKfy.../exec';
const CHART = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';

(async () => {
  console.log('\n--- THE PAGE IS NETWORK-FIRST ---');
  {
    // The one rule that can do real harm if it inverts: a cached index.html
    // served ahead of the network pins the phone to an old safety engine.
    const w = loadWorker({ cached: [[PAGE, 'OLD VERSION']] });
    const res = await ask(w, PAGE);
    is(res.from, 'network', 'with a signal, the page comes from the network even when it is cached');
    is(w.log.networkHits[0], PAGE, 'the network was the first thing tried');
  }
  {
    const w = loadWorker({ cached: [[PAGE, 'saved']], offline: true });
    is((await ask(w, PAGE)).from, 'cache', 'with no signal, the page comes from the cache');
  }
  {
    const w = loadWorker({ offline: true });
    is((await ask(w, PAGE)).from, 'neterror',
      'with no signal and nothing cached, it is a network error, not a hang');
  }
  {
    // ca7's selfRefresh() reloads to "?v=<now>". Offline that is the only
    // navigation there is, and an exact-match cache could never answer it.
    const w = loadWorker({ cached: [[PAGE, 'saved']], offline: true });
    is((await ask(w, PAGE + '?v=1758000000000')).from, 'cache',
      "selfRefresh()'s ?v= reload is still answered from the cache");
  }
  {
    // ...and the same reload must not add a second cache entry per rescue.
    const w = loadWorker({ cached: [[PAGE, 'saved']] });
    await ask(w, PAGE + '?v=1758000000000');
    await settle();
    is(w.log.puts.join(','), PAGE, 'a refreshed page is stored without its query string');
  }

  console.log('\n--- NOTHING FROM THE SHEET IS EVER CACHED ---');
  {
    const w = loadWorker({ cached: [[PROXY, 'STALE SHEET DATA']] });
    is(await ask(w, PROXY + '?t=abc&callback=_sheetCallback'), 'passthrough',
      'a read of the sheet is passed through untouched');
    is(await ask(w, PROXY, 'POST'), 'passthrough', 'a write to the sheet is passed through untouched');
    await settle();
    is(w.log.puts.length, 0, 'nothing from the proxy is written to the cache');
  }

  console.log('\n--- CHART.JS ---');
  {
    const w = loadWorker({ cached: [[CHART, 'lib']] });
    is((await ask(w, CHART)).from, 'cache', 'the pinned CDN script is served from the cache when it is there');
  }
  {
    const w = loadWorker({});
    is((await ask(w, CHART)).from, 'network', 'and fetched normally when it is not');
  }
  {
    // A version bump in index.html that sw.js did not follow means the one file
    // the dashboard needs is the one file that is never cached.
    const src  = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const inHtml = /<script src="(https:\/\/cdn\.jsdelivr\.net[^"]+)"/.exec(html);
    is(!!inHtml && src.includes(inHtml[1]), true,
      'sw.js caches the exact Chart.js URL index.html asks for');
  }

  console.log('\n--- A NEW SHELL RETIRES THE OLD ONE ---');
  {
    const w = loadWorker({ cacheNames: ['cycle-shell-v0', 'cycle-shell-v1', 'something-else'] });
    await w.listeners.activate({ waitUntil: p => p });
    await settle();
    is(w.log.deleted.join(','), 'cycle-shell-v0,something-else',
      'activate deletes every cache except the current shell');
  }

  console.log('\n--- THE PAGE REGISTERS IT, GUARDED ---');
  {
    const tries = [];
    const boot = secure => {
      tries.length = 0;
      bootPage({
        env: {
          window: { addEventListener() {}, isSecureContext: secure },
          navigator: { serviceWorker: { register: p => { tries.push(p); return Promise.resolve({}); } } },
        },
        expose: '1',
      });
      return tries;
    };
    is(boot(true).join(','), 'sw.js', 'a secure context registers the worker');
    is(boot(false).length, 0, 'an insecure context (file://) does not, where registration would throw');
  }
  {
    // Per the global rule about background failures: this registration IS ca9,
    // so it must not fail quietly.
    let logged = '';
    bootPage({
      env: {
        window: { addEventListener() {}, isSecureContext: true },
        navigator: { serviceWorker: { register: () => Promise.reject(new Error('nope')) } },
        console: Object.assign({}, console, { error: (...a) => { logged += a.join(' '); } }),
      },
      expose: '1',
    });
    await settle();
    is(/offline shell could not be installed/.test(logged), true,
      'a failed registration is reported, not swallowed');
  }

  console.log(failed ? `\n${failed} CHECK(S) FAILED\n` : '\nAll checks passed\n');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('\nThe check itself threw:', e); process.exit(1); });
