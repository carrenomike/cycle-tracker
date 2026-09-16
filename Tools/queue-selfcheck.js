#!/usr/bin/env node
// Offline check of index.html's unsent-queue rules — no network, no tokens.
//
//   node Tools/queue-selfcheck.js
//
// Everything that decides whether an unsent entry survives is in one marked
// block: how two edits to the same day are merged, what is salvaged out of
// storage, and what the persistent banner says. Extracted from index.html
// rather than copied, so a change to the app cannot quietly pass a check
// written against old code.

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = src.indexOf('// >>> QUEUE');
const b = src.indexOf('// <<< QUEUE');
if (a < 0 || b < 0) throw new Error('Could not find the QUEUE markers in index.html');
const Q = new Function(
  `${src.slice(a, b)}; return { QUEUE_KEY, QUEUE_STUCK_MS, isQueueEntry, queueMerge,
     queueParse, lostQueueText, queueBannerLines, unsentNoteText };`)();

// The refusal list lives with the write path, in the ENTRY block, because that
// is where it is used first. Check it from here too: which errors never queue
// is a queue rule.
const ea = src.indexOf('// >>> ENTRY');
const eb = src.indexOf('// <<< ENTRY');
const E = new Function(`${src.slice(ea, eb)}; return { isRefusal, describeValues, writeWarnings,
  writeFailureKind, writeAttemptText, RETRY_ATTEMPTS, ATTEMPT_TIMEOUT_MS };`)();

let failed = 0;
// Three false greens in this plan have been node exiting 0 on an await nobody
// resolved, so the run ending is itself a check.
let finished = false;
process.on("exit", code => {
  if (!finished && code === 0) {
    console.log("\n"+"  FAIL  the run ended before the last check");
    process.exitCode = 1;
  }
});
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const is = (actual, expected, what) =>
  actual === expected ? pass(what)
    : fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const same = (actual, expected, what) => is(JSON.stringify(actual), JSON.stringify(expected), what);
const has = (lines, needle, what) =>
  lines.some(l => l.includes(needle)) ? pass(what)
    : fail(`${what}: no line contained ${JSON.stringify(needle)} in ${JSON.stringify(lines)}`);
const hasNo = (lines, needle, what) =>
  lines.some(l => l.includes(needle)) ? fail(`${what}: a line contained ${JSON.stringify(needle)}`) : pass(what);

const label = iso => 'day ' + iso.slice(8);
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

console.log('storage key — the display cache must never be able to take the queue with it');
is(Q.QUEUE_KEY, 'cycleQueue', 'the queue has its own key');
is(Q.QUEUE_KEY === 'cycleCache', false, 'it is not ca7\'s display-cache key');

console.log('\nqueueMerge — one entry per date, or an edit is lost');
let q = Q.queueMerge([], '2026-09-10', { Temp: '97.80' }, NOW);
is(q.length, 1, 'the first entry is queued');
same(q[0].values, { Temp: '97.80' }, 'with exactly what was sent');
is(q[0].at, NOW, 'stamped with the time of the first attempt');

q = Q.queueMerge(q, '2026-09-10', { Flow: 'bleeding' }, NOW + 5000);
is(q.length, 1, 'a second edit to the same day does not become a second entry');
same(q[0].values, { Temp: '97.80', Flow: 'bleeding' },
  'the earlier field survives — two patches for one day merge, they do not replace');
is(q[0].at, NOW, 'the stuck clock still runs from the first attempt, not the latest');

q = Q.queueMerge(q, '2026-09-10', { Temp: '97.95' }, NOW + 6000);
is(q[0].values.Temp, '97.95', 'the newest value of a field wins');

q = Q.queueMerge(q, '2026-09-08', { Temp: '97.10' }, NOW + 7000);
same(q.map(e => e.iso), ['2026-09-08', '2026-09-10'], 'entries stay in date order');
is(q[1].values.Flow, 'bleeding', 'merging another day leaves the first alone');

// A cleared field is a real value ('' means "empty this cell"), so it must
// merge like any other rather than be treated as nothing to say.
q = Q.queueMerge(q, '2026-09-08', { Note: '' }, NOW + 8000);
same(q[0].values, { Temp: '97.10', Note: '' }, 'a cleared field is carried, not dropped');

console.log('\nqueueParse — salvage, never discard quietly');
same(Q.queueParse(null), { entries: [], note: null, lost: 0 }, 'nothing stored is not a loss');
same(Q.queueParse(''), { entries: [], note: null, lost: 0 }, 'an empty string is not a loss');
is(Q.queueParse('{not json').lost, -1, 'unreadable storage reports a loss of unknown size');
is(Q.queueParse('{"entries":"nope"}').lost, -1, 'the wrong shape reports a loss too');

const stored = JSON.stringify({
  entries: [
    { iso: '2026-09-10', values: { Temp: '97.80' }, at: NOW, tries: 1 },
    { iso: 'not-a-date', values: { Temp: '97.80' } },
    { iso: '2026-09-11', values: {} },
    { iso: '2026-09-12', values: null },
    null,
  ],
  note: { at: NOW, text: ['something happened'] },
});
const parsed = Q.queueParse(stored);
same(parsed.entries.map(e => e.iso), ['2026-09-10'], 'only readable entries come back');
is(parsed.lost, 4, 'and every one that did not is counted, not swallowed');
same(parsed.note.text, ['something happened'], 'the note from the last flush survives a reload');
is(Q.queueParse(JSON.stringify({ entries: [], note: { at: NOW, text: [] } })).note, null,
  'an empty note is no note');

is(Q.lostQueueText(0), null, 'no loss, nothing said');
has([Q.lostQueueText(1)], 'could not be read back', 'one lost entry says so');
has([Q.lostQueueText(3)], '3 unsent entries', 'three lost entries says how many');
has([Q.lostQueueText(-1)], 'could not be read back', 'an unknown loss still says so');

console.log('\nqueueBannerLines — the persistent banner');
same(Q.queueBannerLines([], null, NOW, label), [], 'an empty queue with nothing to report shows no banner');

const one = [{ iso: '2026-09-10', values: { Temp: '97.80' }, at: NOW - 60_000 }];
let lines = Q.queueBannerLines(one, null, NOW, label);
has(lines, '1 entry has not reached the sheet yet', 'it says how many are unsent');
has(lines, 'day 10', 'and which day');
has(lines, 'will be sent again', 'a fresh entry reads as something to wait for');
has(lines, 'has not been looked at again', 'it says the patch was never re-checked against the sheet');
hasNo(lines, 'more than a day', 'a fresh entry is not called stuck');

const old = [{ iso: '2026-09-10', values: { Temp: '97.80' }, at: NOW - DAY - 1 }];
lines = Q.queueBannerLines(old, null, NOW, label);
has(lines, 'more than a day', 'past the cutoff it reads as stuck, not as waiting');
hasNo(lines, 'will be sent again', 'and stops promising it is about to go');
is(Q.QUEUE_STUCK_MS, DAY, 'the cutoff is 24 hours');

// The trap ca7a left: bannerHTML truncates _dataWarnings at 4. The queue
// banner is the one that must never drop a line.
const many = [];
for (let i = 1; i <= 9; i++) many.push({ iso: `2026-09-0${i}`, values: { Temp: '97.80' }, at: NOW });
const note = { at: NOW, text: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] };
lines = Q.queueBannerLines(many, note, NOW, label);
for (const w of note.text) has(lines, w, `flush warning "${w}" is shown, not capped away`);
hasNo(lines, '…and', 'nothing is summarised into a "and N more"');

lines = Q.queueBannerLines([], note, NOW, label);
same(lines, note.text, 'a note outlives the entries it describes, so a finished flush still reports');

lines = Q.queueBannerLines(
  [{ iso: '2026-09-10', values: { Temp: '97.80' }, at: NOW, lastError: 'the server did not reply.' }],
  null, NOW, label);
has(lines, 'Last attempt: the server did not reply.', 'the reason the last attempt failed is on screen');

console.log('\nwhich failures never queue');
is(E.isRefusal('read-only'), true, 'a reader link is a refusal');
is(E.isRefusal('no-access'), true, 'a dead token is a refusal');
is(E.isRefusal('not-configured'), true, 'an unconfigured server is a refusal');
is(E.isRefusal('Failed to fetch'), false, 'no signal is not a refusal — that one queues');
is(E.isRefusal(undefined), false, 'an unreadable reply is not a refusal — that one queues');

console.log('\nthe write reply is read, not just its status (ca5a)');
same(E.writeWarnings({ ok: true }), [], 'a clean write says nothing');
has(E.writeWarnings({ ok: true, textNotStored: ['Note'] }), 'formula',
  'a write that did not store the text still warns');
has(E.writeWarnings({ ok: true, unreadableDates: ['13/09/2026'] }), 'date order',
  'a row that could not be ordered still warns');
is(E.writeWarnings({ ok: true, textNotStored: ['Note'], unreadableDates: ['x'] }).length, 2,
  'both warnings survive together');

console.log('\nwriteFailureKind — worth retrying, and did it land? (ca10)');
const named = n => { const e = new Error('x'); e.name = n; return e; };
same(E.writeFailureKind(named('TimeoutError'), true), { retryable: true, unknown: true },
  'a timeout is retried, and may already be on the sheet — ca10\'s live failure');
const hop = new Error('the server answered HTTP 404.'); hop.hopStatus = 404;
same(E.writeFailureKind(hop, true), { retryable: true, unknown: true },
  'the flaky second hop is retried, and the write may have run before the reply was lost');
same(E.writeFailureKind(named('TypeError'), false), { retryable: false, unknown: false },
  'no connection at all: nothing landed, and retrying now is pointless');
same(E.writeFailureKind(named('TypeError'), true), { retryable: true, unknown: true },
  'a TypeError with a connection is a redirect that failed CORS — retry, and claim nothing');
same(E.writeFailureKind(new Error('not an answer (HTTP 200)'), true),
  { retryable: false, unknown: false },
  'a reply that was read and made no sense is not bad luck — asking again gets it again');

console.log('\nwriteAttemptText — say what was observed, never what it means');
const to = named('TimeoutError'); to.unknown = true;
has([E.writeAttemptText(to)], String(E.ATTEMPT_TIMEOUT_MS / 1000) + ' seconds',
  'the timeout says how long it waited');
has([E.writeAttemptText(to)], 'not known', 'and that whether it reached the sheet is not known');
hasNo([E.writeAttemptText(to)], 'could not', 'it never claims the write did not happen');
is(E.writeAttemptText(new Error('This link is not valid any more.')),
  'This link is not valid any more.',
  'a refusal is quoted as-is — nothing is softened onto the end of it');

console.log('\nunsentNoteText — one wording for both write paths');
has([Q.unsentNoteText('day 15', 'x', false)], 'could not be sent',
  'an observed failure says so plainly');
hasNo([Q.unsentNoteText('day 15', 'x', true)], 'could not be sent',
  'an unconfirmed one does not');
has([Q.unsentNoteText('day 15', 'x', true)], 'sending it again is safe',
  'and says re-sending is safe, because doPost rewrites that day');

console.log('\nthe banner does not assert what was never observed (ca10)');
const unk = [{ iso: '2026-09-15', values: { Temp: '99' }, at: NOW, tries: 1, unknown: true }];
hasNo(Q.queueBannerLines(unk, null, NOW, label), 'has not reached the sheet yet',
  'after a timeout it does not tell Mike the sheet is missing it');
has(Q.queueBannerLines(unk, null, NOW, label), 'may already be on the sheet',
  'it says what is actually true: it may be there');
has(Q.queueBannerLines([{ iso: '2026-09-15', values: { Temp: '99' }, at: NOW, tries: 1 }],
  null, NOW, label), 'has not reached the sheet yet',
  'an ordinary offline entry keeps the plain wording');
hasNo(Q.queueBannerLines(unk, null, NOW, label), 'Sent again',
  'one send is not worth counting out loud');
has(Q.queueBannerLines([Object.assign({}, unk[0], { tries: 3 })], null, NOW, label),
  'Sent again 3 times', 'but a stuck entry shows its count — a flake and an outage look different');

console.log('\ndescribeValues — one wording for confirm, card and discard');
same(E.describeValues({ Temp: '97.80', Note: '' }), ['Temp: 97.80', 'Note: (cleared)'],
  'a cleared field says so rather than showing blank');

// ── End to end, through the real page ──────────────────────────────────────
// The rules above are only half the slice. The other half is that a failed save
// actually reaches the queue, that the queue survives a reload, and that a
// partial flush leaves exactly the entries that failed — none of which a pure
// function can be asked. So boot the whole page script twice against one store,
// which is what a reload is.

const { NEW_COLS } = require('./migrate-sheet.js');
const { bootPage, makeStore } = require('./page-harness.js');

const EXPOSE = `{ renderPayload, saveEntry, flushQueue, loadData,
  getQueue: () => _queue, getNote: () => _queueNote,
  getRole: () => _role, remember: r => rememberRole(r),
  setScreen: (tab, role) => { _tab = tab; _role = role; },
  setOpenDate: v => { _openDate = v; } }`;

const isoOfDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const row = (back, temp, first) => {
  const r = {}; NEW_COLS.forEach(c => { r[c] = ''; });
  r.Date = isoOfDate(daysAgo(back));
  r.Temp = String(temp);
  r['Cycle Start'] = first ? 'TRUE' : '';
  return NEW_COLS.map(c => r[c]);
};
const FIXTURE = [row(6, 97.8, true), row(5, 97.82), row(4, 97.85), row(3, 97.88)];

const DAY_A = isoOfDate(daysAgo(2));   // two unlogged days at the end of the
const DAY_B = isoOfDate(daysAgo(1));   // fixture, so both are new rows

// A fetch stub whose answer is chosen per request, and that records what it saw.
function fetchStub(answer) {
  const calls = [];
  const fn = (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const a = answer(body);
    if (a instanceof Error) return Promise.reject(a);
    return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify(a)) });
  };
  fn.calls = calls;
  return fn;
}

function openLog(api) {
  api.setScreen('log', 'writer');
  api.renderPayload(NEW_COLS, FIXTURE);
}

// Fill the form as if Mike typed one temperature and nothing else.
function typeTemp(api, temp) {
  const tempField = api._el('f0');   // ENTRY_FIELDS[0] is Temp
  tempField.value = String(temp);
}

(async () => {
  console.log('\nan entry queued while offline survives a reload');
  const store = makeStore();
  const offline = fetchStub(() => new Error('Failed to fetch'));
  {
    const api = bootPage({ store, fetch: offline, expose: EXPOSE });
    openLog(api);
    typeTemp(api, '97.90');
    await api.saveEntry(DAY_A);
    is(api.getQueue().length, 1, 'a write that could not go out is kept, not lost');
    same(api.getQueue()[0].values, { Temp: '97.90' }, 'with exactly the fields that were changed');
    is(api.getQueue()[0].lastError, 'Failed to fetch', 'and why it did not go');
  }
  {
    // A second boot on the same store is a reload.
    const api = bootPage({ store, fetch: offline, expose: EXPOSE });
    is(api.getQueue().length, 1, 'it is still there after a reload');
    is(api.getQueue()[0].iso, DAY_A, 'and it is the same day');
    openLog(api);
    is(api._el('app').innerHTML.includes('has not reached the sheet yet'), true,
      'and the banner says so on the first paint, before any read answers');
  }

  console.log('\na successful flush removes it and re-reads the sheet');
  {
    const online = fetchStub(() => ({ ok: true, action: 'inserted' }));
    const api = bootPage({ store, fetch: online, expose: EXPOSE });
    openLog(api);
    api.setOpenDate(null);
    await api.flushQueue(true);
    same(online.calls, [{ t: '', date: DAY_A, values: { Temp: '97.90' } }],
      'the queued patch is what was sent, unchanged');
    is(api.getQueue().length, 0, 'a confirmed write is the one thing that empties the queue');
    is(api.getNote(), null, 'and a clean flush leaves nothing to report');
    // The flush must not answer from the display cache — it re-reads.
    const api2 = bootPage({ store, fetch: online, expose: EXPOSE });
    is(api2.getQueue().length, 0, 'and it stays empty across a reload');
  }

  console.log('\na flush that only half works leaves exactly what failed');
  {
    const s2 = makeStore();
    const half = fetchStub(b => (b.date === DAY_A
      ? { ok: true, action: 'inserted' }
      : new Error('Failed to fetch')));
    const dead = fetchStub(() => new Error('Failed to fetch'));
    const api = bootPage({ store: s2, fetch: dead, expose: EXPOSE });
    openLog(api);
    typeTemp(api, '97.90'); await api.saveEntry(DAY_A);
    openLog(api); api.setOpenDate(null);
    typeTemp(api, '97.95'); await api.saveEntry(DAY_B);
    is(api.getQueue().length, 2, 'two days queued');

    const api2 = bootPage({ store: s2, fetch: half, expose: EXPOSE });
    openLog(api2);
    api2.setOpenDate(null);
    await api2.flushQueue(true);
    same(api2.getQueue().map(e => e.iso), [DAY_B], 'the one that landed is gone, the one that did not is still here');
    has(api2.getNote().text, 'could not be sent', 'and the failure is on screen, not only in the console');
    const api3 = bootPage({ store: s2, fetch: dead, expose: EXPOSE });
    same(api3.getQueue().map(e => e.iso), [DAY_B], 'a reload agrees about which one is still owed');
  }

  console.log('\na refusal is never queued — it would never clear');
  {
    const s3 = makeStore();
    const refused = fetchStub(() => ({ ok: false, error: 'read-only' }));
    const api = bootPage({ store: s3, fetch: refused, expose: EXPOSE });
    openLog(api);
    typeTemp(api, '97.90');
    await api.saveEntry(DAY_A);
    is(api.getQueue().length, 0, 'a read-only link does not fill the queue with writes it can never send');
    is(api._el('saveStatus').textContent.startsWith('NOT saved'), true,
      'it says NOT saved, in the same words ca5 used');
  }

  console.log('\na write that succeeded but did not store what was sent still says so (ca5a)');
  {
    const s4 = makeStore();
    const dead = fetchStub(() => new Error('Failed to fetch'));
    const api = bootPage({ store: s4, fetch: dead, expose: EXPOSE });
    openLog(api); typeTemp(api, '97.90'); await api.saveEntry(DAY_A);

    const odd = fetchStub(() => ({ ok: true, action: 'inserted', textNotStored: ['Note'] }));
    const api2 = bootPage({ store: s4, fetch: odd, expose: EXPOSE });
    openLog(api2); api2.setOpenDate(null);
    await api2.flushQueue(true);
    is(api2.getQueue().length, 0, 'the row was written, so the entry goes');
    has(api2.getNote().text, 'formula', 'but the warning it came back with does not go with it');
    const api3 = bootPage({ store: s4, fetch: odd, expose: EXPOSE });
    has(api3.getNote().text, 'formula', 'and it survives a reload, so it cannot be missed');
  }

  console.log('\nsaving while a flush is in flight (ca6a)');
  {
    // The banner's "Try sending now" is allowed to run with a card open, so the
    // form's Save button is live while a flush is in flight. Before ca6a, saving
    // into that window merged the new fields into the entry the flush was already
    // sending — and the flush's own filter then dropped the merged entry whole.
    const s5 = makeStore();
    const dead = fetchStub(() => new Error('Failed to fetch'));
    const api = bootPage({ store: s5, fetch: dead, expose: EXPOSE });
    openLog(api); typeTemp(api, '97.90'); await api.saveEntry(DAY_A);
    is(api.getQueue().length, 1, 'one day queued to flush');

    // A stub that holds the flush's reply open and refuses everything after it,
    // so the save really does land mid-flush and really does fail — which is the
    // only shape in which the old code lost the edit: saveEntry merged 97.99 into
    // the entry the flush was sending, and the flush then dropped it whole on the
    // ok:true it was waiting for.
    const sent = [];
    let release, calls = 0;
    const held = new Promise(r => { release = r; });
    const slow = (url, init) => {
      sent.push(JSON.parse(init.body));
      return calls++
        ? Promise.reject(new Error('Failed to fetch'))
        : held.then(a => ({ status: 200, text: () => Promise.resolve(JSON.stringify(a)) }));
    };
    const api2 = bootPage({ store: s5, fetch: slow, expose: EXPOSE });
    openLog(api2);
    api2.setOpenDate(DAY_A);            // a card is open: this is the manual flush
    const flushing = api2.flushQueue(true);
    await Promise.resolve();            // let the flush reach its await

    typeTemp(api2, '97.99');
    await api2.saveEntry(DAY_A);        // returns at the guard; unguarded it posts
    is(api2._el('saveStatus').textContent.startsWith('Still sending'), true,
      'a save during a flush is refused, in words, rather than racing it');
    is(sent.length, 1, 'and it never reached the network behind the flush');

    release({ ok: true, action: 'inserted' });
    await flushing;
    same(sent.map(c => c.values), [{ Temp: '97.90' }],
      'the flush sent the value it started with, once');
    is(api2.getQueue().length, 0, 'and the confirmed entry left the queue');
    // Nothing re-read the sheet: the form is still open over a stale list.
    has(api2.getNote().text, 'not been re-read',
      'a flush that landed behind an open form says the list is older than the write');
  }


  // ── ca10: the flaky second hop ─────────────────────────────────────────────
  // Apps Script's /exec redirects to a second Google host that intermittently
  // 404s, 5xxs, or simply never answers. verify-proxy has retried that since ca5;
  // the app did not, and on 2026-09-15 a row that WAS written was reported to
  // Mike as a write that failed.
  //
  // The backoff is a real await, so these boots get a real setTimeout — but only
  // for the sub-second retry pause. The page's own 20s load timer stays the no-op
  // it is in every other check here, or every boot would hold the process open.
  const realTimeout = setTimeout;
  const RETRY_ENV = { setTimeout: (fn, ms) => (ms >= 5000 ? 0 : realTimeout(fn, ms)) };
  const RETRY_EXPOSE = EXPOSE.replace('{',
    '{ postEntry, setRetryPause: ms => { RETRY_PAUSE_MS = ms; },');
  const bootRetry = o => {
    const api = bootPage(Object.assign({ expose: RETRY_EXPOSE, env: RETRY_ENV }, o));
    api.setRetryPause(5);
    return api;
  };

  // Answers a scripted sequence of HTTP outcomes, so "flaked once, then worked"
  // is a real second request rather than a mocked verdict. A number is an HTTP
  // status with Google's error page in the body; 'timeout' is the AbortSignal
  // rejection; anything else is a JSON reply. Past the end the last step repeats,
  // which is what an outage looks like.
  function scriptedStub(steps) {
    const calls = [];
    const fn = (url, init) => {
      calls.push(JSON.parse(init.body));
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      if (step === 'timeout') {
        const e = new Error('signal timed out');
        e.name = 'TimeoutError';
        return Promise.reject(e);
      }
      if (typeof step === 'number') return Promise.resolve({
        status: step,
        text: () => Promise.resolve('<html>Sorry, the file you have requested does not exist.</html>'),
      });
      return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify(step)) });
    };
    fn.calls = calls;
    return fn;
  }

  console.log('\na flake on the second hop is retried, not reported as a failure (ca10)');
  {
    const s6 = makeStore();
    const dead = fetchStub(() => new Error('Failed to fetch'));
    const api = bootRetry({ store: s6, fetch: dead });
    openLog(api); typeTemp(api, '97.90'); await api.saveEntry(DAY_A);
    is(api.getQueue().length, 1, 'one day waiting to be sent');

    const flaky = scriptedStub([404, { ok: true, action: 'inserted' }]);
    const api2 = bootRetry({ store: s6, fetch: flaky });
    openLog(api2); api2.setOpenDate(null);
    await api2.flushQueue(true);
    is(flaky.calls.length, 2, 'the 404 from Google is tried again rather than believed');
    same(flaky.calls[1], flaky.calls[0], 'and the retry sends exactly the same patch');
    is(api2.getQueue().length, 0, 'the entry leaves on the confirmation, and only then');
    is(api2.getNote(), null, 'a flake that was survived is not reported as a problem');
    const api3 = bootRetry({ store: s6, fetch: dead });
    is(api3.getQueue().length, 0, 'and it does not come back on a reload — it was sent once');
  }

  console.log('\na retry while Mike is watching says so on screen');
  {
    const s7 = makeStore();
    const flaky = scriptedStub([500, { ok: true, action: 'inserted' }]);
    const api = bootRetry({ store: s7, fetch: flaky });
    openLog(api);
    // The page overwrites #saveStatus as it goes, so keep every line it wrote:
    // "Saving…" followed two seconds later by "Saved" tells nobody a retry
    // happened, and a silent spinner is the failure this project keeps paying for.
    const seen = [];
    const el = api._el('saveStatus');
    Object.defineProperty(el, 'textContent', {
      set(v) { seen.push(v); this._v = v; }, get() { return this._v || ''; },
    });
    typeTemp(api, '97.90');
    await api.saveEntry(DAY_A);
    is(flaky.calls.length, 2, 'the save itself retried');
    has(seen, 'trying again', 'and the spinner said why it was still going');
    is(api.getQueue().length, 0, 'a write that got through on the retry is not queued');
  }

  // ── ca11: the refusal that never happened ──────────────────────────
  // Google runs doPost on the first hop and 302s to a one-time URL holding the
  // answer. Fetching that URL twice runs doGet with no token, which answers
  // `no-access` — a refusal for a write that is already on the sheet. Seen twice
  // in four verify.bat runs on 2026-09-15. So a refusal is confirmed by one
  // extra send, and only the second one counts.

  // Counts the times the remembered role was actually dropped from storage, so
  // "forgotten once" is checked rather than assumed. ca9a broke twice over this.
  function roleStore() {
    const st = makeStore();
    st.forgets = 0;
    const drop = st.removeItem;
    st.removeItem = k => { if (k === 'cycleRole') st.forgets++; return drop(k); };
    return st;
  }

  console.log('\na refusal is confirmed before it is believed (ca11)');
  {
    const s11 = roleStore();
    const phantom = scriptedStub([{ ok: false, error: 'no-access' },
                                  { ok: true, action: 'inserted' }]);
    const api = bootRetry({ store: s11, fetch: phantom });
    api.remember('writer');
    s11.forgets = 0;
    openLog(api); typeTemp(api, '97.90');
    await api.saveEntry(DAY_A);
    is(phantom.calls.length, 2, 'the refusal is sent again rather than believed on sight');
    same(phantom.calls[1], phantom.calls[0], 'and the confirming send carries the same patch');
    is(api.getQueue().length, 0, 'the write landed on the second send, so nothing is owed');
    is(api.getNote(), null, 'a phantom that was survived is not reported as a problem');
    is(api.getRole(), 'writer', 'and Mike is still the writer');
    is(s11.forgets, 0, 'the remembered role was never dropped on an unconfirmed refusal');
    is(api._el('saveStatus').textContent.startsWith('NOT saved'), false,
      'nothing told him the save failed');
  }

  console.log('\na real refusal still refuses — once, and it still forgets the role');
  {
    const s12 = roleStore();
    const refused = scriptedStub([{ ok: false, error: 'no-access' }]);
    const api = bootRetry({ store: s12, fetch: refused });
    api.remember('writer');
    s12.forgets = 0;
    openLog(api); typeTemp(api, '97.90');
    await api.saveEntry(DAY_A);
    is(refused.calls.length, 2,
      'one confirming send, not a budget — a refusal behind a retry loop is a banner nothing clears');
    is(api.getRole(), null, 'a refusal that repeated is the server proving the remembered role wrong');
    is(s12.forgets, 1, 'and it is forgotten exactly once');
    is(api.getQueue().length, 0, 'a confirmed refusal is still never queued');
    is(api._el('saveStatus').textContent.startsWith('NOT saved'), true,
      'a refusal WAS observed, so it may still say NOT saved');
  }

  console.log('\nthe confirming send is not a licence to retry a refusal for ever');
  {
    // `read-only` cannot be a phantom — doGet has no such answer — but it costs
    // one extra send rather than a second classification of refusals. What it
    // must never cost is a third.
    const s13 = roleStore();
    const refused = scriptedStub([{ ok: false, error: 'read-only' }]);
    const api = bootRetry({ store: s13, fetch: refused });
    openLog(api); typeTemp(api, '97.90');
    await api.saveEntry(DAY_A);
    is(refused.calls.length, 2, 'two sends and no more, whatever the refusal says');
    is(api.getQueue().length, 0, 'and it is still never queued');
  }

  console.log('\na refusal that cannot be confirmed is a write that may have landed');
  {
    // The phantom means the row may be sitting in the sheet. If the confirming
    // send never gets an answer, nothing has been observed that proves it is not
    // — so the entry is kept and marked unconfirmed, rather than dropped the way
    // a refusal is.
    const s14 = roleStore();
    const lost = scriptedStub([{ ok: false, error: 'no-access' }, 'timeout']);
    const api = bootRetry({ store: s14, fetch: lost });
    api.remember('writer');
    s14.forgets = 0;
    openLog(api); typeTemp(api, '97.90');
    await api.saveEntry(DAY_A);
    is(api.getQueue().length, 1, 'the entry is kept rather than dropped on an unconfirmed refusal');
    is(api.getQueue()[0].unknown, true, 'and marked as one that may already be on the sheet');
    is(api.getRole(), 'writer', 'the role survives: nothing confirmed the refusal');
    is(s14.forgets, 0, 'so nothing was forgotten');
  }

  console.log('\nan outage exhausts the budget, and is visible when it does');
  {
    const s9 = makeStore();
    const outage = scriptedStub([500]);
    const api = bootRetry({ store: s9, fetch: outage });
    openLog(api); typeTemp(api, '97.90');
    await api.saveEntry(DAY_A);
    is(outage.calls.length, E.RETRY_ATTEMPTS,
      'it stops at the shared attempt count — a retry with no end hides a real outage');
    is(api.getQueue().length, 1, 'the entry stays, because nothing confirmed it');
    is(api.getQueue()[0].unknown, true,
      'and it is marked unconfirmed: the hop can 500 after doPost has already run');

    const api2 = bootRetry({ store: s9, fetch: outage });
    openLog(api2);
    const html = api2._el('app').innerHTML;
    is(html.includes('may already be on the sheet'), true,
      'the banner says what was observed and no more');
    is(html.includes('has not reached the sheet yet'), false,
      'it does not tell Mike the sheet is missing a row that may be sitting in it');
  }

  console.log('\nthe budget, not the attempt count, is what stops a timeout retrying');
  {
    // A timeout costs 45 seconds a go; a 404 costs a moment. Same four attempts,
    // very different waits — so the stop is a wall-clock deadline.
    const s10 = makeStore();
    const slow = scriptedStub(['timeout']);
    const api = bootRetry({ store: s10, fetch: slow });
    let caught = null;
    try { await api.postEntry(DAY_A, { Temp: '99' }, 0); } catch (e) { caught = e; }
    is(slow.calls.length, 1, 'a budget with no room does not start an attempt it cannot pay for');
    is(caught && caught.unknown, true, 'and what it throws says the write may have landed anyway');
    has([E.writeAttemptText(caught)], 'not known', 'which is what the person is told');

    const slow2 = scriptedStub(['timeout']);
    const api2 = bootRetry({ store: s10, fetch: slow2 });
    try { await api2.postEntry(DAY_A, { Temp: '99' }, 200000); } catch (e) { /* expected */ }
    is(slow2.calls.length, E.RETRY_ATTEMPTS,
      'with room, a timeout IS retried — re-sending a date doPost already has rewrites it, never doubles it');
  }

  finished = true;
  console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("  FAIL  the check itself threw:", e); process.exit(1); });
