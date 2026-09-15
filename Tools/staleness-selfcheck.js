#!/usr/bin/env node
// Offline check of index.html's staleness rules — no network, no tokens.
//
//   node Tools/staleness-selfcheck.js
//
// The decisions that matter to Tirzah's safety are all in one marked block:
// whether a saved copy may be used at all, whether it is too old for a verdict,
// and what the banner says. Extracted from index.html rather than copied, so
// this cannot drift from the shipped code.

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = src.indexOf('// >>> STALENESS');
const b = src.indexOf('// <<< STALENESS');
if (a < 0 || b < 0) throw new Error('Could not find the STALENESS markers in index.html');
const S = new Function(
  `${src.slice(a, b)}; return { CACHE_MAX_AGE_MS, MAX_BANNER_WARNINGS, cacheIsUsable, cacheExpired, cacheDate, stalenessText, bannerHTML };`)();

let failed = 0;
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const is = (actual, expected, what) =>
  actual === expected ? pass(what)
    : fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const URL_A = 'https://script.google.com/macros/s/AAA/exec';
const URL_B = 'https://script.google.com/macros/s/BBB/exec';
const good  = { proxy: URL_A, at: 1_700_000_000_000, cols: ['Date'], rows: [['2026-09-14']] };

console.log('cacheIsUsable');
is(S.cacheIsUsable(good, URL_A), true,  'a copy from this deployment is used');
// The ca3b failure: a redeploy leaves a cached page pointing at an archived
// /exec. Data saved by that page must not sit there looking live.
is(S.cacheIsUsable(good, URL_B), false, 'a copy from a different PROXY_URL is refused');
is(S.cacheIsUsable(null, URL_A), false, 'no saved copy');
is(S.cacheIsUsable({ ...good, rows: [] }, URL_A), false, 'an empty saved copy is refused');
is(S.cacheIsUsable({ ...good, at: 0 }, URL_A), false, 'a copy with no timestamp is refused');
is(S.cacheIsUsable({ ...good, cols: 'Date' }, URL_A), false, 'a malformed saved copy is refused');

console.log('\ncacheExpired — the 3-day cutoff');
const DAY = 24 * 60 * 60 * 1000;
is(S.CACHE_MAX_AGE_MS, 3 * DAY, 'cutoff is 3 days');
const t = Date.UTC(2026, 8, 14, 12, 0, 0);
is(S.cacheExpired(t, t),                     false, 'fresh');
is(S.cacheExpired(t, t + 3 * DAY - 60_000),  false, 'just under 3 days still shows a verdict');
is(S.cacheExpired(t, t + 3 * DAY),           true,  'exactly 3 days is out of date');
is(S.cacheExpired(t, t + 9 * DAY),           true,  'well past 3 days is out of date');

console.log('\nstalenessText — the banner must name the date');
const fresh   = S.stalenessText(t, t + 2 * DAY);
const expired = S.stalenessText(t, t + 4 * DAY);
const dated   = S.cacheDate(t);                       // e.g. "Sep 14, 2026"
for (const [label, text] of [['fresh', fresh], ['expired', expired]]) {
  const m = /(\w{3}) (\d{1,2}), (\d{4})/.exec(text);
  m ? pass(`${label} banner names a date: ${m[0]}`)
    : fail(`${label} banner does not name a date: ${JSON.stringify(text)}`);
  /may be out of date/i.test(text)
    ? fail(`${label} banner uses vague wording`)
    : pass(`${label} banner is not vague`);
}
/more than 3 days old/.test(expired)
  ? pass('expired banner says why the safety status is gone')
  : fail(`expired banner does not explain the missing status: ${JSON.stringify(expired)}`);
/hidden/.test(expired) ? pass('expired banner mentions the hidden status') : fail('expired banner omits it');
dated && /\d{4}/.test(dated) ? pass(`cacheDate: ${dated}`) : fail(`cacheDate: ${dated}`);

console.log('\nbannerHTML');
{
  const stale = { at: t };
  const warnings = ['A row dated "oops" could not be read and was left out.'];
  const shown = S.bannerHTML(stale, [], false, t + DAY);
  /class="banner"/.test(shown) ? pass('a failed fetch shows the banner') : fail('no banner on a failed fetch');
  shown.includes(S.cacheDate(t)) ? pass(`the banner names the cached date: ${S.cacheDate(t)}`)
    : fail(`the banner does not name the cached date: ${JSON.stringify(shown)}`);
  /dismissBanner\(\)/.test(shown) ? pass('the banner is dismissible') : fail('the banner has no dismiss control');

  is(S.bannerHTML(stale, [], true, t + DAY), '', 'a dismissed banner renders nothing');
  is(S.bannerHTML(null, [], false, t), '', 'a good live load shows no banner');

  // ca3a: a dropped row or an unreadable yes/no value must be visible, and must
  // not blank the dashboard — it is a line in this same banner, nothing more.
  const warned = S.bannerHTML(null, warnings, false, t);
  warned.includes('could not be read') ? pass('a dropped row is surfaced in the banner')
    : fail('a dropped row is invisible');
  // Sheet text reaches the banner, so it must be escaped.
  const evil = S.bannerHTML(null, ['<img src=x onerror=alert(1)>'], false, t);
  /<img/.test(evil) ? fail('banner lines are not HTML-escaped') : pass('banner lines are HTML-escaped');

  // ca7a: one malformed column warns on every row. The banner must not grow to
  // the length of the sheet and bury the dashboard underneath it.
  const many = S.bannerHTML(null, Array.from({ length: 165 }, (_, i) => `row ${i} is bad`), false, t);
  const shownLines = (many.match(/<div>/g) || []).length;
  shownLines <= S.MAX_BANNER_WARNINGS + 1
    ? pass(`165 warnings render as ${shownLines} lines, not 165`)
    : fail(`the banner is unbounded — 165 warnings rendered ${shownLines} lines`);
  /and 161 more problems/.test(many)
    ? pass('the banner says how many warnings it did not show')
    : fail('the truncated banner hides the true count');
  // The cap must not truncate when there is nothing to truncate.
  !/and \d+ more/.test(S.bannerHTML(null, ['one bad row'], false, t))
    ? pass('a short warning list is shown whole, with no "more" line')
    : fail('the "more" line appears when nothing was dropped');
}

// The expiry override and the banner read the same flag but never each other's
// state — dismissal is a render-time flag, expiry is a clock comparison. Bind
// that here so a later edit cannot quietly wire dismissal into the cutoff.
console.log('\nwiring');
const render = /function render\(cycles\) \{([\s\S]*?)\n\}/.exec(src);
if (!render) { fail('could not find render() in index.html'); }
else {
  const body = render[1];
  /safeStatus = 'Out of date'/.test(body)
    ? pass("render() replaces the verdict with 'Out of date'")
    : fail("render() never sets 'Out of date'");
  const ovr = /if \(_staleInfo && cacheExpired\([\s\S]*?\n  \}/.exec(body);
  ovr && !/_bannerDismissed/.test(ovr[0])
    ? pass('the expiry override does not consult _bannerDismissed')
    : fail('dismissal is wired into the 3-day expiry');
  body.indexOf("safeStatus = 'Out of date'") > body.lastIndexOf("safeStatus = 'Unsafe'")
    ? pass('the override runs after the Safe/Unsafe branch')
    : fail('the Safe/Unsafe branch can overwrite "Out of date"');
}
// Dismissal must not be persisted anywhere: it has to come back on reload.
/_bannerDismissed[^\n]*localStorage|localStorage[^\n]*_bannerDismissed|sessionStorage[^\n]*_bannerDismissed/.test(src)
  ? fail('the banner dismissal is persisted — it would not return on reload')
  : pass('the banner dismissal is in-memory only, so a reload brings it back');
// The cache and the token must not share a key.
/const CACHE_KEY = 'cycleCache'/.test(src) && /const TOKEN_KEY = 'cycleToken'/.test(src)
  ? pass('the display cache and the access token use separate keys')
  : fail('cache/token storage keys are not both present');

// ca7a: the "#t=" fragment is the only copy of a token the store would not
// accept, so nothing may throw it away — not the scrub, not the self-reload.
// (Mike ruled the screenshot leak acceptable, 2026-09-15.) Both halves matter:
// either one alone still locks a private-mode user out.
const bt0 = /function bootstrapToken\(\) \{([\s\S]*?)\n\}/.exec(src);
bt0 && /if \(_tokenPersisted\) history\.replaceState/.test(bt0[1])
  ? pass('the address bar is only scrubbed once the token is saved')
  : fail('the "#t=" fragment is scrubbed even when the token was never saved');
const sr = /function selfRefresh\(\) \{([\s\S]*?)\n\}/.exec(src);
sr && /location\.replace\([\s\S]*?location\.hash\)?;/.test(sr[1])
  ? pass('the self-reload carries the "#t=" fragment through')
  : fail('the self-reload drops the fragment, losing an unsaved token');
// ca7a: the cache is the only large thing in localStorage, so it must be the
// thing dropped when the token write hits quota — never the other way round.
const bt = /function bootstrapToken\(\) \{([\s\S]*?)\n\}/.exec(src);
bt && /removeItem\(CACHE_KEY\)[\s\S]*setItem\(TOKEN_KEY/.test(bt[1])
  ? pass('a full store drops the cache to keep the access token')
  : fail('a full store leaves the user unable to save their access link');
// Nothing may ever wipe the whole store — the token lives there too.
/localStorage\.clear\(/.test(src)
  ? fail('localStorage.clear() would take the access token with it')
  : pass('no path clears all of localStorage');

console.log(failed ? `\nstaleness self-check: ${failed} FAILED` : '\nstaleness self-check: PASS');
process.exit(failed ? 1 : 0);
