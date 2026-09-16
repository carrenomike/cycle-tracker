#!/usr/bin/env node
// Offline check of the retry rule shared by the app and the proxy verifier —
// no network, no tokens.
//
//   node Tools/retry-selfcheck.js
//
// ca8 found that Tools/verify-proxy.js only looked like it retried a request
// that never came back: the 45-second cut-off was built once by the caller and
// handed to every attempt. An AbortSignal that has fired stays fired, so each
// retry started already aborted and failed in microseconds. A run printed three
// retries and gave up having really waited once. Nothing caught it because
// nothing here executed that code — this does.
//
// The retry block is extracted from verify-proxy.js and the three numbers from
// index.html, so neither file can drift from this check or from the other.

const fs = require('fs');
const path = require('path');

const read = (f, name) => {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const a = src.indexOf(`// >>> ${name}`);
  const b = src.indexOf(`// <<< ${name}`);
  if (a < 0 || b < 0) throw new Error(`Could not find the ${name} markers in ${f}`);
  return src.slice(a, b);
};

// fetch, setTimeout and console are parameters, so the block runs against stubs
// while AbortSignal stays real — the fired-signal bug only shows with the real one.
const build = (fetch, setTimeout, console) => new Function('fetch', 'setTimeout', 'console',
  `${read('Tools/verify-proxy.js', 'RETRY')}
   return { flakyFetch, RETRY_ATTEMPTS, RETRY_PAUSE_MS, ATTEMPT_TIMEOUT_MS };`
)(fetch, setTimeout, console);

const APP = new Function(
  `${read('index.html', 'ENTRY')}
   return { RETRY_ATTEMPTS, RETRY_PAUSE_MS, ATTEMPT_TIMEOUT_MS };`)();

let failed = 0;
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const is = (actual, expected, what) =>
  actual === expected ? pass(what)
    : fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

// A run of flakyFetch with time and the network faked. `answers` is what each
// attempt gets: an HTTP status, or 'timeout' for a request that never comes back.
function run(answers) {
  const calls = [], waits = [], quiet = { log() {} };
  const fetch = (url, init) => {
    calls.push({ url, signal: init.signal, abortedOnEntry: init.signal && init.signal.aborted });
    const a = answers[calls.length - 1];
    if (a === 'timeout') {
      const e = new Error('timed out');
      e.name = 'TimeoutError';
      return Promise.reject(e);
    }
    return Promise.resolve({ status: a, ok: a < 400 });
  };
  // Time is skipped, not waited: the real backoff would make this check 6s long.
  const fake = (fn, ms) => { waits.push(ms); fn(); return 0; };
  const T = build(fetch, fake, quiet);
  return T.flakyFetch('http://example.invalid/exec', {}).then(
    res => ({ res, err: null, calls, waits, T }),
    err => ({ res: null, err, calls, waits, T }));
}

(async () => {
  console.log('the numbers are the same on both sides (ca10 put them in step on purpose)');
  const V = build(() => {}, () => {}, { log() {} });
  is(V.RETRY_ATTEMPTS,     APP.RETRY_ATTEMPTS,     'four attempts in the app and in the verifier');
  is(V.RETRY_PAUSE_MS,     APP.RETRY_PAUSE_MS,     'the same one-second-per-attempt backoff');
  is(V.ATTEMPT_TIMEOUT_MS, APP.ATTEMPT_TIMEOUT_MS, 'the same 45-second cut-off per attempt');
  is(V.RETRY_ATTEMPTS, 4, 'and four is still the number ca10 chose');

  console.log('\na request that never comes back is really retried, not just logged (the ca8 bug)');
  const t = await run(['timeout', 'timeout', 'timeout', 'timeout']);
  is(t.calls.length, 4, 'silence is tried four times');
  is(t.err && t.err.name, 'TimeoutError', 'and the fourth is thrown, so the run fails out loud');
  is(t.calls.every(c => c.signal), true, 'every attempt has a cut-off — none can hang forever');
  is(t.calls.every(c => c.abortedOnEntry === false), true,
    'no attempt starts with a cut-off that has already fired');
  is(new Set(t.calls.map(c => c.signal)).size, 4,
    'each attempt gets its own cut-off, not the first attempt spent four times');
  is(JSON.stringify(t.waits), JSON.stringify([1000, 2000, 3000]),
    'and it waits longer each time rather than hammering Google');

  console.log('\nthe flaky second hop: a 404 or a 5xx is the same flake');
  const a = await run([404, 200]);
  is(a.calls.length, 2, 'a 404 is retried');
  is(a.res && a.res.status, 200, 'and the answer that follows is the one returned');
  const b = await run([503, 500, 404, 200]);
  is(b.calls.length, 4, 'a mix of 5xx and 404 keeps retrying up to the limit');
  is(b.res && b.res.status, 200, 'the fourth attempt still counts');
  const c = await run([404, 404, 404, 404]);
  is(c.calls.length, 4, 'a 404 that never goes away stops at four');
  is(c.res && c.res.status, 404, 'and is handed back, so the caller fails the run on it');

  console.log('\nanything that is not that flake fails immediately');
  const d = await run([200]);
  is(d.calls.length, 1, 'an answer first time is not retried');
  is(JSON.stringify(d.waits), '[]', 'and nothing waits');
  const e = await run([403]);
  is(e.calls.length, 1, 'a 403 is Google saying no, not a flake');
  is(e.res && e.res.status, 403, 'so it comes straight back');

  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();
