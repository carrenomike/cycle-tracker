#!/usr/bin/env node
// Offline check that index.html's dashboard actually renders — no network, no
// tokens, no browser.
//
//   node Tools/render-selfcheck.js
//
// The other three self-checks extract one marked block each and test it in
// isolation. Nothing ran render(), so ca4 shipped a reference to a variable it
// had just deleted (`ovDay` in the Cycle History row) and every self-check
// still said PASS while the dashboard threw before it drew anything.
//
// This one loads the WHOLE page script under stub browser globals and renders
// real fixtures through renderPayload(), the same entry point the live and the
// cached paths both use. It does not check what the dashboard looks like —
// that is Mike's browser pass — only that every code path in it runs.

const { NEW_COLS } = require('./migrate-sheet.js');
const { bootPage } = require('./page-harness.js');

// The stub browser lives in page-harness.js so the queue self-check can boot the
// same page the same way — twice over, which is how a reload is tested.
const api = bootPage({ expose:
  `{ renderPayload, buildLogRows, splitCycles, adaptRows, safetyVerdict,
     setProvisional: v => { _provisional = v; },
     setScreen: (tab, role) => { _tab = tab; _role = role; },
     setOpenDate: v => { _openDate = v; }, entryFormHTML, entryDiff,
     setQueue: (entries, note) => { _queue = entries; _queueNote = note || null; },
     queueBannerHTML }` });
const app = api._el('app');

// ── Fixtures ───────────────────────────────────────────────────────────────
// Dates are anchored to today so dayNumber is the same arithmetic the phone
// does, including the unlogged-days gap at the end.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

// [days before today, temp, flow, cycleStart, ovulation]
const spec = (back, Temp, Flow, start, ov) => {
  const r = {};
  NEW_COLS.forEach(c => { r[c] = ''; });
  r.Date = iso(daysAgo(back));
  r.Temp = Temp == null ? '' : String(Temp);
  r.Flow = Flow || '';
  r['Cycle Start'] = start ? 'TRUE' : '';
  r.Ovulation = ov ? 'TRUE' : '';
  return NEW_COLS.map(c => r[c]);
};

// A completed cycle, then a current one with a marker and a three-day gap at
// the end — so past, current, the average footer and the unlogged count all
// have something to render.
const TEMPS = [97.80, 97.82, 97.85, 97.88, 97.80, 97.84, 97.99, 98.00, 98.18, 98.20];
// ovOffset of -1 means no marker anywhere in that cycle.
const cycle = (firstBack, ovOffset) => TEMPS.map((t, i) =>
  spec(firstBack - i, t, i < 3 ? 'bleeding' : '', i === 0, i === ovOffset));

const PAST = cycle(40, 6);
const withMarker    = [...PAST, ...cycle(24, 6)];
const withoutMarker = [...PAST, ...cycle(24, -1)];

let failed = 0;
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const renders = (rows, what) => {
  app.innerHTML = '';
  try { api.renderPayload(NEW_COLS, rows); }
  catch (e) { fail(`${what} — render threw: ${e.message}`); return ''; }
  pass(`${what} — render ran clean`);
  return app.innerHTML;
};
const has = (html, needle, what) =>
  html.includes(needle) ? pass(what) : fail(`${what} — not in the rendered page`);

console.log('\n--- A CYCLE WITH AN OVULATION MARKER ---');
{
  const html = renders(withMarker, 'marked cycle');
  has(html, 'Safe Sex Status', 'the safety card is drawn');
  has(html, 'Cycle History', 'the history table is drawn');
  has(html, 'tag-current', 'the current cycle has a row in the history table');
  has(html, 'Daily Log', 'the log table is drawn');
  has(html, 'unlogged', 'the unlogged-days gap is shown');
  /Day \d+<\/td>/.test(html)
    ? pass('the history table prints an ovulation day')
    : fail('the history table prints no ovulation day — the ca4 `ovDay` bug is back');
}

console.log('\n--- THE CACHED COPY DRAWN BEFORE THE READ ANSWERS ---');
{
  // The saved copy is drawn first so the phone is not staring at a spinner for
  // the 1-3s the Apps Script proxy takes. Everything on it may be a day or two
  // out of date, which is fine for a chart and not fine for a verdict: a "Safe"
  // the sheet would disagree with is the one wrong answer this app must not
  // give. It has to read Checking until the live reply lands.
  api.setProvisional(true);
  const html = renders(withMarker, 'provisional render');
  has(html, 'Checking', 'the safety card says Checking, not a verdict');
  /status-(safe|unsafe)"/.test(html)
    ? fail('a provisional render shows a Safe/Unsafe verdict from the saved copy')
    : pass('no Safe or Unsafe verdict is shown from the saved copy');
  has(html, 'Cycle Day', 'the rest of the dashboard is drawn as normal');
  has(html, 'Daily Log', 'the log table is drawn as normal');

  // And it must clear by itself: the same data, no longer provisional, is a
  // verdict again. A flag that never clears is a dashboard stuck on Checking.
  api.setProvisional(false);
  const live = renders(withMarker, 'the live reply that follows');
  /status-(safe|unsafe)"/.test(live)
    ? pass('the verdict appears once the read has answered')
    : fail('the verdict never comes back after the read answers');
}

console.log('\n--- A CYCLE WITH NO MARKER ---');
{
  // The other half of the same table cell: the em-dash branch. A marker-less
  // cycle must also render, and must never read Safe.
  const html = renders(withoutMarker, 'unmarked cycle');
  has(html, 'Unsafe', 'an unmarked cycle reads Unsafe');
  has(html, 'Ovulation not yet confirmed', 'and says why');
}

console.log('\n--- THE LOG TABLE FOR EVERY CYCLE ---');
{
  const objs = withMarker.map(cells => Object.fromEntries(NEW_COLS.map((c, i) => [c, cells[i]])));
  const cycles = api.splitCycles(api.adaptRows(objs).filter(r => r.Day));
  try {
    cycles.forEach(c => api.buildLogRows(c));
    pass(`buildLogRows runs for all ${cycles.length} cycles`);
  } catch (e) { fail(`buildLogRows threw: ${e.message}`); }
}

console.log('\n--- THE LOG EXIT (writer only) ---');
{
  // ca5 gave render() a second exit the dashboard half never reaches — exactly
  // the shape of the ca4 bug: a path every self-check skipped. Render it closed,
  // render it with a card open, then render the dashboard again; the round trip
  // is what rebuilds the charts.
  api.setScreen('log', 'writer');
  const closed = renders(withMarker, 'the log tab');
  has(closed, 'Log a day', 'the catch-up list is drawn');
  has(closed, 'day-card', 'there are day cards');
  has(closed, 'Show 14 more days', 'the show-more button is drawn');
  /chartTimeline|Cycle Day/.test(closed)
    ? fail('dashboard markup leaked into the log screen')
    : pass('no dashboard markup leaks into the log screen');

  api.setOpenDate(iso(daysAgo(0)));
  const open = renders(withMarker, 'the log tab with a card open');
  has(open, 'saveEntry(', 'the entry form is drawn');
  has(open, 'Temp (', 'the form carries the ca2 fields');

  // A migrated row can hold a value this app never offers — an old mucus
  // wording, a cervix note ca2 folded into the Note. Opening such a row must
  // not rewrite it to the first option, and saving an unrelated field must not
  // carry it along. (Target 7; the live half is Tools/verify-proxy.js.)
  const awkward = {
    Temp: '', Time: '', Flow: '',
    'Cervical Mucus': 'Lotiony',
    Ovulation: 'TRUE',
    Note: 'cervix: high and open',
  };
  const form = api.entryFormHTML(iso(daysAgo(1)), awkward);
  /<option value="Lotiony" selected>/.test(form)
    ? pass('a mucus value the option list does not know stays selected')
    : fail('an unknown mucus value was not preserved in the form');
  has(form, 'cervix: high and open', 'the migrated cervix note is shown, not dropped');

  // ca6a: escHTML is the guard on attribute values too, and it did not escape
  // quotes. A migrated cell holding a " would close `value="` early and put the
  // rest of the sheet text into the markup as attributes.
  const quoted = api.entryFormHTML(iso(daysAgo(1)),
    { 'Cervical Mucus': 'creamy "eggwhite"', Note: 'she said "fine" & left' });
  /value="creamy &quot;eggwhite&quot;"/.test(quoted)
    ? pass('a quote in a sheet value stays inside the attribute')
    : fail(`a quote in a sheet value was not escaped: ${
        (quoted.match(/value="[^>]*eggwhite[^>]*/) || ['nothing matched'])[0]}`);
  has(quoted, 'she said &quot;fine&quot; &amp; left', 'and quotes and ampersands survive in the note');
  const d = api.entryDiff(awkward, { Temp: '98.10', Time: '', 'Temp Quality': [],
    Exclude: false, Flow: '', 'Cervical Mucus': 'Lotiony', 'Cervix Texture': '',
    'Cervix Position': '', Breasts: '', Ovulation: true, 'Cycle Start': false,
    Note: 'cervix: high and open' });
  JSON.stringify(Object.keys(d)) === JSON.stringify(['Temp'])
    ? pass('saving a temp on that row sends the temp and nothing else')
    : fail(`the diff carried more than the temp: ${JSON.stringify(d)}`);

  api.setOpenDate(null);

  // Back to the dashboard: the charts the log exit destroyed have to come back.
  api.setScreen('dashboard', 'writer');
  const back = renders(withMarker, 'dashboard after the log tab');
  has(back, 'Safe Sex Status', 'the dashboard is whole again');
  has(back, 'chartTimeline', 'the timeline canvas is back in the page');
  api.setScreen('dashboard', null);

  // ca6: the queue banner must reach BOTH exits, because the screen it matters
  // on is the log tab and the screen Mike is usually looking at is the other.
  console.log('\n--- THE UNSENT QUEUE BANNER (ca6) ---');
  const unsentIso = iso(daysAgo(1));
  api.setQueue([{ iso: unsentIso, values: { Temp: '97.80', Note: '' }, at: Date.now(), tries: 1,
                  lastError: 'the server did not reply within 30 seconds.' }], null);

  api.setScreen('log', 'writer');
  const qlog = renders(withMarker, 'the log tab with an unsent entry');
  has(qlog, 'banner queue', 'the queue banner is on the log screen');
  has(qlog, 'has not reached the sheet yet', 'and says so in words');
  has(qlog, 'flushQueue(true)', 'with a way to try again by hand');
  // ca7's banner is dismissible; this one is not, and both can be on screen at
  // once. Ask the queue banner alone, or the other one's cross answers for it.
  /banner-x|dismissBanner/.test(api.queueBannerHTML())
    ? fail('the queue banner has a dismiss cross — it must not be dismissible')
    : pass('the queue banner has no dismiss cross');
  has(qlog, 'not sent yet: Temp: 97.80', 'the day card flags the unsent values rather than hiding them');
  // ca6a: a flush that lands while a card is open does not re-render the cards,
  // so refreshQueueBanner has to find these spans and drop the stale ones. The
  // hook it uses is this attribute; without it the spans would sit there claiming
  // work the sheet already has.
  has(qlog, `class="unsent" data-iso="${unsentIso}"`,
    'the unsent span names its day, so a landed flush can drop it');
  has(qlog, 'Note: (cleared)', 'including a field the entry cleared');

  api.setScreen('dashboard', 'writer');
  const qdash = renders(withMarker, 'the dashboard with an unsent entry');
  has(qdash, 'banner queue', 'the queue banner is on the dashboard too');

  // Tirzah never sees it. She cannot write, so she can never have a queue —
  // but the banner is state, and state renders whatever the role.
  api.setScreen('dashboard', 'reader');
  const qreader = renders(withMarker, 'the dashboard as the reader');
  /banner queue/.test(qreader)
    ? fail('the reader was shown the writer-only unsent banner')
    : pass('the reader is never shown the unsent banner');

  // ca6a: `_role` only arrives from the display cache or a live read, and
  // saveQueue() deletes that cache to make room. A writer offline with no cache
  // has role null — and that is exactly when unsent entries must not vanish.
  api.setScreen('dashboard', null);
  /banner queue/.test(api.queueBannerHTML())
    ? pass('an unsent entry is still shown before the role is known')
    : fail('the queue banner was hidden because the role had not arrived yet');

  api.setQueue([], null);
  api.setScreen('dashboard', null);
}

console.log(failed ? `\nrender self-check: ${failed} FAILED\n` : '\nrender self-check: PASS\n');
process.exit(failed ? 1 : 0);
