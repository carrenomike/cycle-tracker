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

const fs = require('fs');
const path = require('path');
const { NEW_COLS } = require('./migrate-sheet.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = src.indexOf('<script>');
const b = src.lastIndexOf('</script>');
if (a < 0 || b < 0 || b < a) throw new Error('Could not find the page script in index.html');
const script = src.slice(a + '<script>'.length, b);

// ── Stub browser ───────────────────────────────────────────────────────────
// Deliberately dumb: anything the page needs that is missing here shows up as
// the failure it would be on the phone, not as a silent no-op.
const app = { innerHTML: '', remove() {}, getContext: () => ({}) };
const store = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
};
class ChartStub {
  constructor() { this.data = { datasets: [] }; }
  destroy() {} update() {}
  getDatasetMeta() { return { hidden: false }; }
}
const env = {
  document: {
    getElementById: () => app,
    createElement: () => ({ set src(_) {}, onerror: null }),
    head: { appendChild() {} },
  },
  localStorage: store(),
  sessionStorage: store(),
  location: { hash: '', pathname: '/', search: '', replace() {} },
  history: { replaceState() {} },
  navigator: {},
  window: {},
  alert() {},
  Chart: ChartStub,
  // The page schedules a 10-minute refresh and a 20s load timeout; neither
  // should hold this process open or fire mid-check.
  setTimeout: () => 0,
  setInterval: () => 0,
  clearTimeout: () => {},
};
const api = new Function(...Object.keys(env),
  `${script}\n; return { renderPayload, buildLogRows, splitCycles, adaptRows, safetyVerdict };`
)(...Object.values(env));

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

console.log(failed ? `\nrender self-check: ${failed} FAILED\n` : '\nrender self-check: PASS\n');
process.exit(failed ? 1 : 0);
