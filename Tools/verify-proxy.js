#!/usr/bin/env node
// Headless verification of the ca3 read proxy.
//
//   node Tools/verify-proxy.js <execUrl> <readerToken> <writerToken> [sheetId]
//
// Tokens and the sheet ID are arguments, not constants: this repo is public.
// Pass the sheet ID to also confirm the sheet itself is private to the world.
//
// Checks the four rejection paths, then pulls the real rows through the SAME
// adapter the app uses — extracted out of index.html rather than copied, so a
// later edit to one cannot quietly drift from the other — and asserts the
// dashboard numbers still come out the way the old sheet gave them.

const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');

// Expected shape of the migrated sheet (Plan/cycle-app/slice-ca3-*.md).
const EXPECT = {
  rows: 165,
  first: '2026-03-25',
  last: '2026-09-11',
  day1: ['Mar 25', 'Apr 26', 'May 25', 'Jul 1', 'Aug 14'],
  ovDays: [16, 18, 23, 31, 23],
};

let failed = 0;
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const is = (actual, expected, what) =>
  JSON.stringify(actual) === JSON.stringify(expected)
    ? pass(`${what}: ${JSON.stringify(actual)}`)
    : fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

function loadAdapter() {
  const src = fs.readFileSync(INDEX, 'utf8');
  const a = src.indexOf('// >>> ADAPTER');
  const b = src.indexOf('// <<< ADAPTER');
  if (a < 0 || b < 0) throw new Error('Could not find the ADAPTER markers in index.html');
  return new Function(`${src.slice(a, b)}; return adaptRows;`)();
}

async function call(url, token) {
  const res = await fetch(token === null ? url : `${url}?t=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Response was not JSON: ${text.slice(0, 200)}`); }
}

// splitCycles, duplicated deliberately: it is three lines and the app's copy is
// wrapped in browser-only code. If it grows, extract it behind markers instead.
function splitCycles(rows) {
  const cycles = [];
  let cur = [];
  for (const r of rows) {
    const d = parseInt(r.Day);
    if (isNaN(d)) continue;
    if (d === 1 && cur.length) { cycles.push(cur); cur = []; }
    cur.push(r);
  }
  if (cur.length) cycles.push(cur);
  return cycles;
}

(async () => {
  const [url, readerToken, writerToken, sheetId] = process.argv.slice(2);
  if (!url || !readerToken || !writerToken) {
    console.error('usage: node Tools/verify-proxy.js <execUrl> <readerToken> <writerToken> [sheetId]');
    process.exit(2);
  }

  console.log('\n--- ACCESS CONTROL ---');
  for (const [what, token] of [['no token', null], ['empty token', ''], ['wrong token', 'not-a-real-token']]) {
    try {
      const r = await call(url, token);
      r.ok === false && r.error === 'no-access'
        ? pass(`${what} is rejected cleanly (error: no-access)`)
        : fail(`${what} returned ${JSON.stringify(r).slice(0, 200)}`);
    } catch (e) { fail(`${what}: ${e.message}`); }
  }

  console.log('\n--- ROLES ---');
  let reader;
  try {
    reader = await call(url, readerToken);
    reader.ok === true && reader.role === 'reader'
      ? pass('reader token reads, role "reader"')
      : fail(`reader token returned ${JSON.stringify(reader).slice(0, 200)}`);
  } catch (e) { fail(`reader token: ${e.message}`); }
  try {
    const w = await call(url, writerToken);
    w.ok === true && w.role === 'writer'
      ? pass('writer token reads, role "writer"')
      : fail(`writer token returned ${JSON.stringify(w).slice(0, 200)}`);
  } catch (e) { fail(`writer token: ${e.message}`); }
  console.log('  note  there is no write endpoint yet, so no wrong-role write to reject — that lands in ca5.');

  if (sheetId) {
    console.log('\n--- SHEET IS PRIVATE ---');
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`);
      const body = await res.text();
      // A public sheet answers 200 with a gviz payload. A private one either
      // errors or bounces an anonymous fetch to the Google sign-in page.
      const isPublic = res.ok && body.includes('google.visualization.Query.setResponse');
      isPublic
        ? fail('the sheet is still readable by a logged-out fetch — it is NOT private')
        : pass(`a logged-out fetch of the sheet is refused (HTTP ${res.status})`);
    } catch (e) { pass(`a logged-out fetch of the sheet failed: ${e.message}`); }
  } else {
    console.log('\n--- SHEET IS PRIVATE ---\n  skip  pass the sheet ID as a 4th argument to check this.');
  }

  if (!reader || reader.ok !== true) {
    console.log('\nNo rows to check — stopping.\n');
    process.exit(1);
  }

  console.log('\n--- THE ca2 PASTE ---');
  const rows = reader.rows.map(cells => {
    const o = {};
    reader.cols.forEach((c, i) => { o[c] = cells[i] == null ? '' : String(cells[i]); });
    return o;
  });
  is(rows.length, EXPECT.rows, 'row count');
  is(rows[0].Date, EXPECT.first, 'first date');
  is(rows[rows.length - 1].Date, EXPECT.last, 'last date');
  const dupes = rows.map(r => r.Date).filter((d, i, a) => a.indexOf(d) !== i);
  dupes.length ? fail(`duplicate dates: ${dupes.join(', ')}`) : pass('no duplicate dates');
  const outOfOrder = rows.filter((r, i) => i && r.Date <= rows[i - 1].Date).map(r => r.Date);
  outOfOrder.length ? fail(`dates out of order at: ${outOfOrder.join(', ')}`) : pass('dates strictly ascending');

  console.log('\n--- ADAPTED ROWS REPRODUCE THE DASHBOARD ---');
  const adapted = loadAdapter()(rows).filter(r => r.Day && /^\d+$/.test(r.Day.trim()));
  const cycles = splitCycles(adapted);
  is(cycles.length, EXPECT.day1.length, 'cycle count');
  is(cycles.map(c => c[0].Date), EXPECT.day1, 'Day-1 dates');
  is(cycles.map(c => {
    const ov = c.find(r => r.Cycle === 'Ovulation');
    return ov ? parseInt(ov.Day) : null;
  }), EXPECT.ovDays, 'ovulation days');

  const spottingAsBlood = adapted.filter(r => r.Flow === 'spotting' && r.Cycle === 'Blood');
  spottingAsBlood.length
    ? fail(`${spottingAsBlood.length} spotting row(s) became 'Blood'`)
    : pass("no spotting row was turned into 'Blood'");

  const start = cycles[cycles.length - 1][0]._date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  console.log(`  info  cycle day today: ${Math.round((today - start) / 86400000) + 1} (current cycle started ${cycles[cycles.length - 1][0].Date})`);

  console.log(failed ? `\n${failed} CHECK(S) FAILED\n` : '\nAll checks passed.\n');
  process.exit(failed ? 1 : 0);
})();
