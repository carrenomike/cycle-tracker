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
const { bootPage, makeStore } = require('./page-harness.js');
// The Symptoms picker's six columns were added by hand, after the migration
// (Apps Script/SETUP.md §8), so the fixtures carry them on top of NEW_COLS.
const COLS = [...NEW_COLS, 'Arousal', 'Acne', 'Cramps', 'Penetration', 'Protected', 'Mood'];

// The stub browser lives in page-harness.js so the queue self-check can boot the
// same page the same way — twice over, which is how a reload is tested.
const EXPOSE =
  `{ renderPayload, buildLogRows, splitCycles, adaptRows, safetyVerdict,
     setProvisional: v => { _provisional = v; },
     setScreen: (tab, role) => { _tab = tab; _role = role; },
     typeField, pickOption, toggleFlag, toggleMood, addMood, openPicker, closePicker, saveAll, openReview, getDrafts: () => _drafts,
     clearDrafts: () => { _drafts = new Map(); _suggested = new Set(); _logNote = null; _reviewing = false; },
     setQueue: (entries, note) => { _queue = entries; _queueNote = note || null; },
     queueBannerHTML, failLoad, switchTab, rememberRole,
     sheetCallback: r => window._sheetCallback(r),
     getQueue: () => _queue, getRole: () => _role, getTab: () => _tab,
     stored: k => localStorage.getItem(k) }`;
const api = bootPage({ expose: EXPOSE });
const app = api._el('app');

// ── Fixtures ───────────────────────────────────────────────────────────────
// Dates are anchored to today so dayNumber is the same arithmetic the phone
// does, including the unlogged-days gap at the end.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

// [days before today, temp, flow, cycleStart, ovulation]
const spec = (back, Temp, Flow, start, ov) => {
  const r = {};
  COLS.forEach(c => { r[c] = ''; });
  r.Date = iso(daysAgo(back));
  r.Temp = Temp == null ? '' : String(Temp);
  r.Flow = Flow || '';
  r['Cycle Start'] = start ? 'TRUE' : '';
  r.Ovulation = ov ? 'TRUE' : '';
  return COLS.map(c => r[c]);
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
  try { api.renderPayload(COLS, rows); }
  catch (e) { fail(`${what} — render threw: ${e.message}`); return ''; }
  pass(`${what} — render ran clean`);
  return app.innerHTML;
};
const is_ = (got, want, what) =>
  got === want ? pass(what) : fail(`${what} — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
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
  const objs = withMarker.map(cells => Object.fromEntries(COLS.map((c, i) => [c, cells[i]])));
  const cycles = api.splitCycles(api.adaptRows(objs).filter(r => r.Day));
  try {
    cycles.forEach(c => api.buildLogRows(c));
    pass(`buildLogRows runs for all ${cycles.length} cycles`);
  } catch (e) { fail(`buildLogRows threw: ${e.message}`); }

  // Missed days get a greyed "not logged" row each, dated and numbered, so
  // the days either side of a gap don't read as consecutive. Two days are cut
  // from the middle of the first cycle, which must already have none missing.
  const first = cycles[0];
  const count = html => (html.match(/not logged/g) || []).length;
  if (count(api.buildLogRows(first)) === 0) pass('an unbroken cycle has no "not logged" rows');
  else fail('an unbroken cycle drew "not logged" rows');
  const cut = first.filter((r, i) => i !== 3 && i !== 4);
  const html = api.buildLogRows(cut);
  if (count(html) === 2) pass('two missed days draw two "not logged" rows');
  else fail(`two missed days drew ${count(html)} "not logged" rows`);
  has(html, `<td>${first[3].Day}</td>\n      <td style="white-space:nowrap">${first[3].Date}</td>`,
      'a missed row carries its own Day and Date');
}

console.log('\n--- THE LOG EXIT (writer only) ---');
{
  // ca5 gave render() a second exit the dashboard half never reaches — exactly
  // the shape of the ca4 bug: a path every self-check skipped. Render it with the
  // panel shut and open, with and without changes, then render the dashboard again;
  // the round trip is what rebuilds the charts.
  api.setScreen('log', 'writer');
  // Two rows inside the 14 days on screen: one with every field filled, and one
  // holding what a migrated row can hold that this app never offers.
  const row = (back, vals) => COLS.map(c => c === 'Date' ? iso(daysAgo(back)) : (vals[c] || ''));
  const FULL = { Temp: '97.8', Time: '7:05 AM', 'Temp Quality': 'off-time', Exclude: 'TRUE',
    Flow: 'spotting', 'Cervical Mucus': 'Creamy', 'Cervix Texture': 'soft', 'Cervix Position': 'high',
    Breasts: 'sore', Arousal: 'med', Acne: 'TRUE', Cramps: 'TRUE', Penetration: 'TRUE', Protected: 'TRUE',
    Mood: 'anxious, Restless', Ovulation: 'TRUE', 'Cycle Start': 'TRUE', Note: 'tired' };
  const AWKWARD = { 'Cervical Mucus': 'Lotiony', Ovulation: 'TRUE', Note: 'she said "fine" & left' };
  const rows = [...withMarker, row(2, FULL), row(1, AWKWARD)];
  const d0 = iso(daysAgo(0)), d1 = iso(daysAgo(1)), d2 = iso(daysAgo(2));
  const summaryOf = (html, day) =>
    ((html.match(new RegExp(`id="sum-${day}">([\\s\\S]*?)</div>\\s*<div class="day-problem"`)) || [])[1] || '');
  const pickerOf = html => (html.split('id="pickerBody"')[1] || '').split('class="pk-foot"')[0];

  const closed = renders(rows, 'the log tab');
  /setQuestion|class="qbar"/.test(closed) ? fail('the question bar is still drawn') : pass('there is no question bar');
  has(closed, 'day-card', 'there are day cards');
  has(closed, "typeField('" + d0 + "','Temp'", 'every day has a Temp box');
  has(closed, "typeField('" + d0 + "','Time'", 'and a Time box');
  has(closed, "openPicker('" + d0 + "')\" aria-label=\"Symptoms\" title=\"Symptoms\">+</button>", 'and a + button that opens Symptoms, named for screen readers');
  /role="dialog"/.test(closed) ? fail('the panel was open before anything was tapped') : pass('the panel starts closed');
  has(closed, 'Show 14 more days', 'the show-more button is drawn');
  /chartTimeline|Cycle Day/.test(closed)
    ? fail('dashboard markup leaked into the log screen')
    : pass('no dashboard markup leaks into the log screen');

  // Only temp and time have boxes on the row; everything else has to be in the
  // line under it, or a day would look blank for what the panel holds.
  const full = summaryOf(closed, d2);
  const WANT = ['spotting', 'sore breasts', 'creamy mucus', 'cervix soft high', 'arousal med', 'acne',
                'cramps', 'penetration (protected)', 'mood anxious, restless', 'off-time', 'excluded',
                'ovulation', 'day 1', 'note: tired'];
  const missing = WANT.filter(w => !full.includes(w));
  missing.length ? fail(`the row line left out ${missing.join(', ')}: ${full}`)
                 : pass('every field on a logged day is in its row line');
  /97\.8|7:05/.test(full) ? fail('the row line repeats the temp or time the boxes already show')
                          : pass('and not the temp or time, which have boxes');
  is_(summaryOf(closed, d0), 'not logged', 'an unlogged day says so');

  // Every field the panel promises is a control in it.
  api.openPicker(d2);
  const pk = app.innerHTML;
  has(pk, 'role="dialog"', 'Symptoms opens the panel');
  has(pk, 'class="picker pk-open"', 'sliding up the first time it is drawn');
  const body = pickerOf(pk);
  const REACH = [`pickOption('${d2}','Flow'`, `pickOption('${d2}','Cervical Mucus'`,
    `pickOption('${d2}','Cervix Texture'`, `pickOption('${d2}','Cervix Position'`, `pickOption('${d2}','Breasts'`,
    `pickOption('${d2}','Arousal'`, `toggleFlag('${d2}','Acne')`, `toggleFlag('${d2}','Cramps')`,
    `toggleFlag('${d2}','Penetration')`, `toggleFlag('${d2}','Protected')`, `toggleMood('${d2}',`,
    `addMood('${d2}'`, `toggleQuality('${d2}',`, `toggleFlag('${d2}','Exclude')`,
    `toggleFlag('${d2}','Ovulation')`, `toggleFlag('${d2}','Cycle Start')`, `typeField('${d2}','Note'`];
  const unreached = REACH.filter(r => !body.includes(r));
  unreached.length ? fail(`the panel cannot reach: ${unreached.join(' | ')}`)
                   : pass('every field but temp and time can be set from the panel');
  has(body, '>restless</button>', "a mood only this row's sheet cell holds is offered");
  has(pk, 'closePicker()', 'with a Done button');
  api.toggleFlag(d2, 'Acne');
  /class="picker pk-open"/.test(app.innerHTML)
    ? fail('the panel slid up again on a tap inside it') : pass('a tap inside does not replay the slide-up');
  has(summaryOf(app.innerHTML, d2), 'acne cleared', 'every tap is a change straight away, shown on the row');
  api.closePicker();
  /role="dialog"/.test(app.innerHTML) ? fail('Done left the panel open') : pass('Done closes it');
  JSON.stringify([...api.getDrafts().keys()]) === JSON.stringify([d2])
    ? pass('and closing keeps the change — Discard is the undo') : fail('closing the panel lost the change');
  api.clearDrafts();

  // An unknown sheet value is shown, selected, and not rewritten.
  api.openPicker(d1);
  /class="opt on"[^>]*>Lotiony \(already in the sheet\)/.test(app.innerHTML)
    ? pass('a mucus value the option list does not know is shown, and selected')
    : fail('an unknown mucus value was not preserved');

  // Protected waits for Penetration, and goes with it.
  /<button class="opt"[^>]*toggleFlag\('[^']*','Protected'\)" disabled>/.test(app.innerHTML)
    ? pass('Protected is greyed out without Penetration') : fail('Protected can be ticked without Penetration');
  api.toggleFlag(d1, 'Protected');
  is_(api.getDrafts().has(d1), false, 'and tapping it anyway does nothing');
  api.toggleFlag(d1, 'Penetration');
  has(summaryOf(app.innerHTML, d1), 'penetration (unprotected)', 'Penetration alone reads "penetration (unprotected)"');
  api.toggleFlag(d1, 'Protected');
  has(summaryOf(app.innerHTML, d1), 'penetration (protected)', 'with Protected it reads "penetration (protected)"');
  /disabled>Protected/.test(app.innerHTML) ? fail('Protected stayed greyed out with Penetration ticked')
                                           : pass('ticking Penetration lets Protected be ticked');
  api.toggleFlag(d1, 'Penetration');
  /class="opt on[^"]*"[^>]*toggleFlag\('[^']*','Protected'\)/.test(app.innerHTML) || api.getDrafts().has(d1)
    ? fail('unticking Penetration left Protected ticked') : pass('unticking Penetration unticks Protected');
  api.clearDrafts();
  api.closePicker();

  // An old row with Protected but not Penetration is shown as it is.
  const ODD = [...rows.slice(0, -1), row(1, { Protected: 'TRUE' })];
  renders(ODD, 'a row that already holds Protected alone');
  api.openPicker(d1);
  /class="opt on"[^>]*toggleFlag\('[^']*','Protected'\)">Protected/.test(app.innerHTML)
    ? pass('it shows ticked, and can be unticked') : fail('an existing lone Protected was hidden or locked');
  is_(summaryOf(app.innerHTML, d1).includes('protected') && !summaryOf(app.innerHTML, d1).includes('penetration'), true,
      'and its row line says "protected", without inventing a penetration');
  api.closePicker();

  // "+ add": lowercase, no comma, no repeats — and remembered only by the sheet.
  renders(rows, 'the log tab again');
  api.openPicker(d0);
  has(String(api.addMood(d0, 'tired, sad')), 'cannot have a comma', 'a comma is refused in words');
  is_(api.getDrafts().has(d0), false, 'and nothing is added');
  has([api.addMood(d0, 'Restless') || ''].join(''), 'already one of the moods',
      'one the sheet already holds is refused, whatever its case');
  is_(api.addMood(d0, '  Wired '), null, 'a new one is accepted');
  is_(JSON.stringify(api.getDrafts().get(d0).Mood), '["wired"]', 'lowercased, trimmed and picked for the day');
  has(pickerOf(app.innerHTML), '>wired</button>', 'and offered as a button');
  api.closePicker();
  api.clearDrafts();
  renders(rows, 'the log tab after Discard');
  api.openPicker(d0);
  /<\/button>[^<]*wired|>wired</.test(pickerOf(app.innerHTML))
    ? fail('an unsaved mood outlived its change — the app kept a list of its own')
    : pass('an unsaved mood goes with the change: no list but the sheet');
  api.closePicker();
  const SAVED = [...rows.slice(0, -1), row(1, Object.assign({}, AWKWARD, { Mood: 'wired' }))];
  renders(SAVED, 'the sheet as read back after saving it');
  api.openPicker(d0);
  has(pickerOf(app.innerHTML), '>wired</button>', 'once in the sheet, it comes back on every day after a reload');
  api.closePicker();

  // A draft survives redraws, and only what was touched goes.
  renders(rows, 'the log tab once more');
  api.typeField(d1, 'Temp', '98.1');
  api.openPicker(d1);
  api.closePicker();
  const after = app.innerHTML;
  JSON.stringify([...api.getDrafts().keys()]) === JSON.stringify([d1])
    ? pass('opening and closing the panel keeps the typed temp') : fail('the panel lost the draft');
  has(after, 'class="fld chg"', 'and the Temp box shows it as a change');
  has(after, '1 day changed', 'the save bar counts it');
  api.openReview();
  const review = api._el('saveBar').innerHTML;
  has(review, 'Temp: 98.1', 'the review list shows the temp as typed');
  /Lotiony|Ovulation|Note/.test(review)
    ? fail(`the review carried an untouched field: ${review}`)
    : pass('and nothing untouched on that row rides along');

  // ca6a: quotes inside an attribute value and inside a textarea.
  api.clearDrafts();
  api.typeField(d0, 'Temp', '9"8');
  has(renders(rows, 'a typed quote'), 'value="9&quot;8"', 'a quote in a value stays inside the attribute');
  api.openPicker(d1);
  has(app.innerHTML, 'she said &quot;fine&quot; &amp; left', 'and quotes and ampersands survive in the note box');
  api.closePicker();

  // A suggested Day 1 must say so everywhere Mike reads before it is saved.
  api.clearDrafts();
  api.pickOption(d0, 'Flow', 2);   // bleeding, after days with none
  const sug = app.innerHTML;
  has(summaryOf(sug, d0), 'day 1 (suggested)', 'bleeding after a clear stretch suggests Day 1, marked as such');
  api.openPicker(d0);
  has(app.innerHTML, '(Day 1) (suggested)', 'and the panel says so on the Day 1 button');
  api.closePicker();
  api.openReview();
  has(api._el('saveBar').innerHTML, 'Cycle Start: TRUE — day 1 (suggested)', 'and the review list says so too');
  api.clearDrafts();

  // The dashboard: four columns became one, and the tooltip reads the same.
  api.setScreen('dashboard', 'writer');
  // A day inside the current cycle, so it is in the Daily Log on screen.
  const dash = renders([...withMarker, row(14, Object.assign({}, FULL, { 'Cycle Start': '' }))],
    'the dashboard with symptoms logged');
  has(dash, '<th>Symptoms</th>', 'the Daily Log has a Symptoms column');
  /<th[^>]*>(Cervix|Pos|Mucus|Breasts)<\/th>/.test(dash)
    ? fail('the old Cervix / Pos / Mucus / Breasts columns are still there') : pass('in place of Cervix, Pos, Mucus and Breasts');
  has(dash, '<td class="wrap sym">sore breasts, creamy mucus, cervix soft high, arousal med, acne, cramps, ' +
    'penetration (protected), mood anxious, restless</td>', 'listing every symptom the day holds');
  api.setScreen('log', 'writer');

  // Tirzah never gets any of it, whatever _tab says.
  api.setScreen('log', 'reader');
  const rd = renders(rows, 'the log tab as the reader');
  /openPicker|typeField|save-bar/.test(rd)
    ? fail('the reader was shown the Log screen') : pass('the reader gets no Log screen');

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
                  lastError: 'the server did not reply within 45 seconds.' }], null);

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

// ── ca9: the cold start with no signal and no saved copy ───────────────────
// The one state nothing above covers: not a stale dashboard, but no dashboard.
// Every ca6 mechanism exists for it and, until ca9, none of them was reachable
// from it — showError() had no tab bar, so the entry form had no door.
(async () => {
  console.log('\n--- CHART.JS DID NOT LOAD (ca9) ---');
  {
    // Offline the CDN script is simply absent. `new Chart(...)` would throw
    // AFTER #app was written, and failLoad() would then replace the whole drawn
    // dashboard with an error screen — the ca4a failure, exactly.
    const noChart = bootPage({ env: { Chart: undefined }, expose: EXPOSE });
    const el = noChart._el('app');
    try {
      noChart.renderPayload(COLS, withMarker);
      pass('the dashboard renders with no charting library');
    } catch (e) { fail(`Chart.js missing threw the whole render: ${e.message}`); }
    has(el.innerHTML, 'Safe Sex Status', 'and the safety card — the part that matters — is on it');
    const wrap = noChart._el('chartTimeline').closest('.chart-wrap').innerHTML;
    /need an internet connection/.test(wrap)
      ? pass('the empty chart says why it is empty')
      : fail(`the missing chart said nothing: ${JSON.stringify(wrap)}`);
  }

  console.log('\n--- COLD START, NO SIGNAL, NO SAVED COPY (ca9) ---');
  {
    // Only `cycleRole` in the store: this is ca7 or ca6 having dropped the
    // display cache to make room, or simply a phone that has never had one.
    const store = makeStore();
    store.setItem('cycleToken', 'writer-token');
    const cold = bootPage({
      store,
      fetch: () => Promise.reject(new Error('offline')),
      expose: EXPOSE,
    });
    // One successful live read, exactly as the phone would have had at home...
    cold.sheetCallback({ ok: true, role: 'writer', cols: COLS, rows: withMarker });
    // ...and then ca7 or ca6 drops the display cache to make room, which is the
    // whole reason the role needs a key of its own.
    store.removeItem('cycleCache');
    const again = bootPage({ store, fetch: () => Promise.reject(new Error('offline')), expose: EXPOSE });
    is_(again.getRole(), 'writer', 'a reload with no cache still knows this is the writer');

    const app = again._el('app');
    again.failLoad('Could not reach the server — check your internet connection');
    has(app.innerHTML, 'Could not load data.', 'with nothing cached, the screen says so');
    has(app.innerHTML, "switchTab('log')", 'and still offers the Log tab');

    again.switchTab('log');
    has(app.innerHTML, 'openPicker(', 'the Log tab opens with no cycle data at all');
    has(app.innerHTML, 'not logged', 'every day in the catch-up list is unlogged, which is true');
    /&middot; Day \d/.test(app.innerHTML)
      ? fail('a cycle day was printed with no cycle data to derive it from')
      : pass('no day number is invented');

    const today = iso(new Date());
    has(app.innerHTML, "typeField('" + today + "','Temp'", 'and every day can take a temp');
    again.typeField(today, 'Temp', '97.90');
    await again.saveAll();
    const q = again.getQueue();
    q.length === 1 && q[0].iso === today && q[0].values.Temp === '97.90'
      ? pass('the entry is kept in the unsent queue, not lost')
      : fail(`the offline save did not queue: ${JSON.stringify(q)}`);
    has(app.innerHTML, 'banner queue', 'and the unsent banner is on the cold-start screen');

    // Tirzah, same situation: no data, no signal, and no writer surface.
    const rstore = makeStore();
    rstore.setItem('cycleToken', 'reader-token');
    const r1 = bootPage({ store: rstore, expose: EXPOSE });
    r1.sheetCallback({ ok: true, role: 'reader', cols: COLS, rows: withMarker });
    rstore.removeItem('cycleCache');
    const reader = bootPage({ store: rstore, expose: EXPOSE });
    reader.failLoad('offline');
    /switchTab|openPicker/.test(reader._el('app').innerHTML)
      ? fail('the reader was offered the Log tab on the offline screen')
      : pass('the reader gets no tab bar and no entry form');
  }

  console.log('\n--- A SAVED COPY WITH NO ROLE IN IT (ca9) ---');
  {
    // A cache written before ca9, or one the server answered with no role at
    // all. bootFromCache() must fill the role in, never overwrite the one
    // recallRole() already found.
    const store = makeStore();
    store.setItem('cycleToken', 'writer-token');
    const a = bootPage({ store, expose: EXPOSE });
    a.sheetCallback({ ok: true, role: 'writer', cols: COLS, rows: withMarker });
    const cached = JSON.parse(store.getItem('cycleCache'));
    cached.role = null;
    store.setItem('cycleCache', JSON.stringify(cached));
    is_(bootPage({ store, expose: EXPOSE }).getRole(), 'writer',
      'a role-less saved copy does not wipe the remembered role');
  }

  console.log('\n--- A DEAD LINK IS NOT HIDDEN BEHIND THE LOG TAB (ca9) ---');
  {
    // The remembered role outlives the token. If the server says the link is
    // gone, showMessage() must not draw the entry form over the refusal.
    const store = makeStore();
    store.setItem('cycleToken', 'old-token');
    const a = bootPage({ store, expose: EXPOSE });
    a.rememberRole('writer');
    const b = bootPage({ store, expose: EXPOSE });
    b.switchTab('log');
    b.sheetCallback({ ok: false, error: 'no-access' });
    has(b._el('app').innerHTML, 'This link is not valid any more.', 'the refusal is what is on screen');
    /openPicker/.test(b._el('app').innerHTML)
      ? fail('the entry form was drawn over a rejected link')
      : pass('the entry form is not drawn over a rejected link');
    is_(b.getRole(), null, 'and the remembered writer role is forgotten');
  }

  console.log('\n--- A NEW LINK DOES NOT INHERIT THE OLD ONE’S ROLE (ca9a) ---');
  {
    // `cycleRole` and `cycleCache` are both keyed on PROXY_URL, never on the
    // token. Swap Mike's link for Tirzah's in one browser and, until the first
    // successful read, the role still says "writer" — so a cold start with no
    // signal in that window draws HER the Log tab and the entry form. It
    // self-corrects online, which is exactly why it would sit there unnoticed.
    const store = makeStore();
    store.setItem('cycleToken', 'writer-token');
    store.setItem('cycleQueue', JSON.stringify({
      entries: [{ iso: '2026-09-01', values: { Temp: '97.50' }, tries: 1 }], note: null }));
    const a = bootPage({ store, expose: EXPOSE });
    a.sheetCallback({ ok: true, role: 'writer', cols: COLS, rows: withMarker });
    is_(a.stored('cycleRole') !== null, true, 'the writer link remembered its role');
    is_(a.stored('cycleCache') !== null, true, 'and saved a copy of the dashboard');

    const atHash = t => ({ location: { hash: '#t=' + t, pathname: '/', search: '', replace() {} } });
    const swapped = bootPage({ store, env: atHash('reader-token'), expose: EXPOSE });
    is_(swapped.stored('cycleRole'), null, 'a DIFFERENT token clears the remembered role');
    is_(swapped.stored('cycleCache'), null, "and the previous link's saved dashboard");
    is_(swapped.getRole(), null, 'so the new link has no role to open the Log tab with');
    is_(swapped.getQueue().length, 1,
      'the unsent queue survives — it is unsaved work, and a reader link refuses it rather than losing it');

    // The common case must not throw the cache away every time Mike reopens
    // his own link, or the offline shell would be empty on every visit.
    const s2 = makeStore();
    s2.setItem('cycleToken', 'writer-token');
    const b = bootPage({ store: s2, expose: EXPOSE });
    b.sheetCallback({ ok: true, role: 'writer', cols: COLS, rows: withMarker });
    const again2 = bootPage({ store: s2, env: atHash('writer-token'), expose: EXPOSE });
    is_(again2.getRole(), 'writer', 're-opening the SAME link keeps the role');
    is_(again2.stored('cycleCache') !== null, true, 'and the saved dashboard');
  }

  console.log('\n--- THE WRITE PATH REFUSES: read-only (ca9a) ---');
  {
    // The third refusal shape, and the only one the READ path can never see:
    // doPost answers `read-only` when a reader token tries to write. It is the
    // server proving a remembered "writer" wrong, so the role must go with it.
    const store = makeStore();
    store.setItem('cycleToken', 'a-token');
    const a = bootPage({ store, expose: EXPOSE });
    a.sheetCallback({ ok: true, role: 'writer', cols: COLS, rows: withMarker });

    const b = bootPage({
      store,
      fetch: () => Promise.resolve({ status: 200,
        text: () => Promise.resolve(JSON.stringify({ ok: false, error: 'read-only' })) }),
      expose: EXPOSE,
    });
    is_(b.getRole(), 'writer', 'it starts out remembering the writer role');
    b.switchTab('log');
    const today = iso(new Date());
    b.typeField(today, 'Temp', '97.90');
    await b.saveAll();
    is_(b.getQueue().length, 0, 'a refusal is never queued');
    is_(b.getRole(), null, 'and the remembered writer role is forgotten');
    is_(b.getTab(), 'dashboard', 'the Log tab is left');
    is_(b.stored('cycleRole'), null,
      'in storage too, so the next cold start does not offer the entry form again');
  }

  console.log(failed ? `\nrender self-check: ${failed} FAILED\n` : '\nrender self-check: PASS\n');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('\nThe check itself threw:', e); process.exit(1); });
