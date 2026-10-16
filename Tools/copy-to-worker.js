#!/usr/bin/env node
// Copies every day from the Google proxy into the Cloudflare Worker, then reads
// both back and compares them value by value (Docs/Cloudflare Migration Spec.md).
//
//   node Tools/copy-to-worker.js            copy, then compare
//   node Tools/copy-to-worker.js --compare  compare only, write nothing
//
// No arguments carry secrets — this repo is public. It reads the same files
// verify.bat does, both OUTSIDE the repo:
//   %USERPROFILE%\.cycle-proxy.txt   line 1 the Google /exec URL, line 3 the writer token
//   %USERPROFILE%\.cycle-worker.txt  line 1 the Worker URL
// The Worker uses the same writer token (the links do not change).
//
// It reads through the old proxy's doGet, not the sheet: those are already the
// flat strings the app uses. It copies every column of every day, blanks
// included, so a re-run makes the Worker match the sheet — except a day that
// exists only in the Worker, which it never deletes; the compare reports it.
// Safe to re-run: a write is keyed on the date and rewrites the same day.

const fs = require('fs');
const os = require('os');
const path = require('path');

const lines = f => {
  const p = path.join(os.homedir(), f);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p} — see Worker/SETUP.md`);
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
};

async function read(url, token, who) {
  let res;
  try { res = await fetch(`${url}?t=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(60000) }); }
  catch (e) {
    // Node's bare "fetch failed" names neither the server nor the reason.
    throw new Error(`could not reach ${who} at ${url}: ${(e.cause && (e.cause.code || e.cause.message)) || e.message}`);
  }
  if (!res.ok) throw new Error(`${who}: HTTP ${res.status} ${res.statusText} — run again`);
  const text = await res.text();
  let r;
  try { r = JSON.parse(text); } catch { throw new Error(`${who} did not answer JSON: ${text.slice(0, 200)}`); }
  if (r.ok !== true) throw new Error(`${who} refused the read: ${r.error}`);
  if (r.role !== 'writer') throw new Error(`${who} reads this token as "${r.role}", not writer`);
  return r;
}

// date -> { col: value }. Duplicate dates would hide in a Map, so refuse them.
function byDate(r, who) {
  const out = new Map();
  for (const cells of r.rows) {
    const o = {};
    r.cols.forEach((c, i) => { o[c] = cells[i] == null ? '' : String(cells[i]); });
    if (out.has(o.Date)) throw new Error(`${who} has the date ${o.Date} twice — fix that first`);
    out.set(o.Date, o);
  }
  return out;
}

(async () => {
  const compareOnly = process.argv.includes('--compare');
  const proxy = lines('.cycle-proxy.txt');
  const [workerUrl] = lines('.cycle-worker.txt');
  const [sheetUrl, , token] = proxy;
  if (!sheetUrl || !token || !workerUrl) throw new Error('the config files are missing a line — see Worker/SETUP.md');
  // cf2 points line 1 of .cycle-proxy.txt at the Worker once the app has
  // switched. Then this would compare the Worker with itself and pass — so stop.
  if (!/script\.google\.com/.test(sheetUrl)) {
    throw new Error('line 1 of .cycle-proxy.txt is not the Google /exec URL any more — the switch (cf2) ' +
      'is done and the sheet is a frozen backup, so there is nothing left to copy');
  }

  console.log('Reading the sheet and the Worker...');
  const sheet = await read(sheetUrl, token, 'the sheet');
  let worker = await read(workerUrl, token, 'the Worker');

  // The Worker's column list must be the sheet's header exactly, same order.
  if (JSON.stringify(sheet.cols) !== JSON.stringify(worker.cols)) {
    const missing = sheet.cols.filter(c => !worker.cols.includes(c));
    const extra = worker.cols.filter(c => !sheet.cols.includes(c));
    console.log(`\nFAIL  the Worker's columns do not match the sheet's header. Nothing was copied.`);
    console.log(`  sheet:  ${JSON.stringify(sheet.cols)}`);
    console.log(`  Worker: ${JSON.stringify(worker.cols)}`);
    if (missing.length) console.log(`  in the sheet, not in the Worker: ${missing.join(', ')}`);
    if (extra.length) console.log(`  in the Worker, not in the sheet: ${extra.join(', ')}`);
    if (!missing.length && !extra.length) console.log('  same names, different order');
    console.log('  Fix COLS in Worker/worker.js, deploy again, and re-run.\n');
    process.exitCode = 1;
    return;
  }

  const old = byDate(sheet, 'the sheet');
  const odd = [...old.keys()].filter(d => !/^\d{4}-\d{2}-\d{2}$/.test(d));
  if (odd.length) throw new Error(`the sheet has dates that are not YYYY-MM-DD: ${odd.join(', ')}`);

  if (!compareOnly) {
    console.log(`Copying ${old.size} days...`);
    let n = 0;
    for (const [date, row] of old) {
      const values = {};
      for (const c of sheet.cols) if (c !== 'Date') values[c] = row[c];
      let res;
      try {
        res = await fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ t: token, date, values }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (e) {
        throw new Error(`writing ${date} failed after ${n} days: could not reach the Worker: ` +
          `${(e.cause && (e.cause.code || e.cause.message)) || e.message} — safe to run again`);
      }
      const r = res.ok ? await res.json() : { ok: false, error: `HTTP ${res.status}` };
      if (r.ok !== true) throw new Error(`writing ${date} failed after ${n} days: ${r.error} — safe to run again`);
      if (++n % 25 === 0) console.log(`  ${n} / ${old.size}`);
    }
    worker = await read(workerUrl, token, 'the Worker');
  }

  console.log('Comparing every value...');
  const neu = byDate(worker, 'the Worker');
  const problems = [];
  for (const [date, row] of old) {
    const got = neu.get(date);
    if (!got) {
      const blank = sheet.cols.every(c => c === 'Date' || row[c] === '');
      problems.push(`${date}: in the sheet, not in the Worker` +
        (blank ? ' (the sheet row is blank — the Worker deletes a day with every field blank)' : ''));
      continue;
    }
    for (const c of sheet.cols) {
      if (row[c] !== got[c]) problems.push(`${date} ${c}: sheet ${JSON.stringify(row[c])}, Worker ${JSON.stringify(got[c])}`);
    }
  }
  for (const date of neu.keys()) if (!old.has(date)) problems.push(`${date}: in the Worker, not in the sheet`);

  if (problems.length) {
    console.log(`\nFAIL  ${problems.length} difference(s):`);
    for (const p of problems.slice(0, 50)) console.log(`  ${p}`);
    if (problems.length > 50) console.log(`  ...and ${problems.length - 50} more`);
    console.log('');
    process.exitCode = 1;
    return;
  }
  console.log(`\nMatch: ${old.size} days, ${sheet.cols.length} columns, every value the same.\n`);
})().catch(e => { console.log(`\nFAIL  ${e.message}\n`); process.exitCode = 1; });
