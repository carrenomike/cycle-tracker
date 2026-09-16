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
     queueParse, lostQueueText, queueBannerLines };`)();

// The refusal list lives with the write path, in the ENTRY block, because that
// is where it is used first. Check it from here too: which errors never queue
// is a queue rule.
const ea = src.indexOf('// >>> ENTRY');
const eb = src.indexOf('// <<< ENTRY');
const E = new Function(`${src.slice(ea, eb)}; return { isRefusal, describeValues, writeWarnings };`)();

let failed = 0;
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

  console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();
