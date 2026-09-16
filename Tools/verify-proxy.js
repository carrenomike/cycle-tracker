#!/usr/bin/env node
// Headless verification of the read proxy and the ca5 write endpoint.
//
//   node Tools/verify-proxy.js <execUrl> <readerToken> <writerToken> [sheetId]
//
// Tokens and the sheet ID are arguments, not constants: this repo is public.
// Pass the sheet ID to also confirm the sheet itself is private to the world.
//
// Checks the four rejection paths, exercises the write endpoint end to end
// against a sentinel date, then pulls the real rows through the SAME
// adapter and the SAME safety engine the app uses — both extracted out of
// index.html rather than copied, so a later edit to one cannot quietly drift
// from the other — and asserts the dashboard numbers still come out the way
// the old sheet gave them, including every cycle's safe-window opening.
//
// This is the only check that sees the real temperatures; the offline
// Tools/safety-selfcheck.js covers the edges the real data does not contain.

const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');

// Expected shape of the migrated sheet (Plan/cycle-app/slice-ca3-*.md).
//
// These are what the ca2 paste put in the sheet, and the sheet only ever grows
// from here: ca5 appends a row per logged day. So the counts and the last date
// are FLOORS, not equalities — an equality would start failing on Mike's first
// new entry and there is no worse failure mode for a safety check than one that
// cries wolf. `first` and the completed-cycle facts stay exact: nothing may
// rewrite history.
const EXPECT = {
  minRows: 165,
  first: '2026-03-25',
  notBefore: '2026-09-11',   // the last migrated date; later is fine, earlier is a loss
  day1: ['Mar 25', 'Apr 26', 'May 25', 'Jul 1', 'Aug 14'],
  ovDays: [16, 18, 23, 31, 23],
  // ca2 dropped the source sheet's Time column and nothing noticed for two
  // slices. Counted straight off the original export: 88 of the 165 migrated
  // rows carry a time. A floor means the recovery cannot quietly regress while
  // new entries can still add to it.
  minTimes: 88,
  // The cycle day each cycle's post-ovulation safe window opens on, recomputed
  // in integer hundredths against the migrated data on 2026-09-13. Cycles 1-4
  // reproduce the values the 2026-08-26 prototype gave and have not moved since.
  // Cycle 5 read 27 on 2026-09-13 (its day-23 marker + 4, three-over-six silent).
  // Raised to 30 on 2026-09-15: cycle 5 is the live one, and the temperatures
  // logged since push three-over-six to day 30, which delays the opening from 27
  // to 30. The engine and adapter blocks are byte-identical to the 2026-09-13
  // run, so this is new data, not a rule that moved. Once three-over-six has
  // fired the day is fixed, so cycle 5 should now hold at 30 until cycle 6.
  // Any OTHER change here is a rule that broke or history being rewritten
  // — never a shrug.
  opensOn: [24, 22, 30, 37, 30],
};

let failed = 0;
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const is = (actual, expected, what) =>
  JSON.stringify(actual) === JSON.stringify(expected)
    ? pass(`${what}: ${JSON.stringify(actual)}`)
    : fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
// A write check that shows the reply when it fails. `r.ok === true && r.action`
// collapses a server error into a bare `false`, which hides the one thing worth
// reading — and a write can land and still report a problem (textNotStored,
// unreadableDates), so those are printed on success too.
const wrote = (r, action, what) => {
  if (!r || r.ok !== true || r.action !== action)
    return fail(`${what}: expected "${action}", got ${JSON.stringify(r).slice(0, 300)}`);
  pass(`${what}: "${action}"`);
  if (r.textNotStored)   console.log(`  warn  the server could not store text as text: ${JSON.stringify(r.textNotStored)}`);
  if (r.unreadableDates) console.log(`  warn  date cells the server could not read: ${JSON.stringify(r.unreadableDates)}`);
};
const atLeast = (actual, floor, what) =>
  actual >= floor
    ? pass(`${what}: ${JSON.stringify(actual)} (floor ${JSON.stringify(floor)})`)
    : fail(`${what}: expected at least ${JSON.stringify(floor)}, got ${JSON.stringify(actual)}`);

function block(name, returns) {
  const src = fs.readFileSync(INDEX, 'utf8');
  const a = src.indexOf(`// >>> ${name}`);
  const b = src.indexOf(`// <<< ${name}`);
  if (a < 0 || b < 0) throw new Error(`Could not find the ${name} markers in index.html`);
  return new Function(`${src.slice(a, b)}; return ${returns};`)();
}

const loadAdapter = () => block('ADAPTER', 'adaptRows');
const loadSafety  = () => block('SAFETY',
  '{ isOv, isBleeding, detectOvDay, threeOverSixDay, safeWindowOpensOn, openingBleedEnd }');

// Apps Script redirects /exec to a second Google host, and that second hop
// intermittently 404s or 5xxs under back-to-back requests. Retry a few times,
// out loud — a genuine 404 still fails the run rather than hiding in here.
// ca10 gave the app the same rule, in index.html's postEntry(): 4 attempts, the
// same attempt * 1000 backoff, said out loud. Keep the two in step — a flake
// this tool tolerates and the app calls a failure means this tool is not
// verifying the app. If they ever have to differ, say why in BOTH places. The
// app's deadline IS deliberately different: it stops on wall-clock time as well,
// because a phone has someone watching a spinner and this does not.
async function call(url, token, attempt = 1) {
  const res = await fetch(token === null ? url : `${url}?t=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(45000) });
  if ((res.status === 404 || res.status >= 500) && attempt < 4) {
    console.log(`  retry  HTTP ${res.status} from Google, attempt ${attempt} — waiting ${attempt}s`);
    await new Promise(r => setTimeout(r, attempt * 1000));
    return call(url, token, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Response was not JSON: ${text.slice(0, 200)}`); }
}

// The write side of the same flaky hop. Kept a "simple" request (text/plain)
// for exactly the reason the app does it: Apps Script cannot answer a preflight.
async function post(url, body, attempt = 1) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    // Without this a request that never comes back leaves the run sitting on a
    // blank line forever, which reads exactly like a passing check that is slow.
    signal: AbortSignal.timeout(45000),
  });
  if ((res.status === 404 || res.status >= 500) && attempt < 4) {
    console.log(`  retry  HTTP ${res.status} from Google, attempt ${attempt} — waiting ${attempt}s`);
    await new Promise(r => setTimeout(r, attempt * 1000));
    return post(url, body, attempt + 1);
  }
  // An HTML page here means the deployment has no doPost — it is still on the
  // version from before ca5. Say that instead of "not JSON".
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch {
    throw new Error(/<html/i.test(text)
      ? 'the /exec URL answered a POST with a web page, not JSON — the live deployment ' +
        'predates doPost. Deploy > Manage deployments > edit > New version.'
      : `Response was not JSON: ${text.slice(0, 200)}`);
  }
}

const pause = () => new Promise(r => setTimeout(r, 400));

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
        : r.error === 'not-configured'
        ? fail(`${what}: the deployment has blank constants — the repo's Code.gs is a TEMPLATE, ` +
               `pasting it over the editor wipes SHEET_ID and both tokens. Re-enter them and redeploy.`)
        : fail(`${what} returned ${JSON.stringify(r).slice(0, 200)}`);
    } catch (e) { fail(`${what}: ${e.message}`); }
    await pause();
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
  atLeast(rows.length, EXPECT.minRows, 'row count');
  is(rows[0].Date, EXPECT.first, 'first date');
  atLeast(rows[rows.length - 1].Date, EXPECT.notBefore, 'last date');
  const dupes = rows.map(r => r.Date).filter((d, i, a) => a.indexOf(d) !== i);
  dupes.length ? fail(`duplicate dates: ${dupes.join(', ')}`) : pass('no duplicate dates');
  const outOfOrder = rows.filter((r, i) => i && r.Date <= rows[i - 1].Date).map(r => r.Date);
  outOfOrder.length ? fail(`dates out of order at: ${outOfOrder.join(', ')}`) : pass('dates strictly ascending');

  if (!reader.cols.includes('Time')) fail('the sheet has no Time column (ca2a recovery not pasted yet)');
  else {
    atLeast(rows.filter(r => r.Time).length, EXPECT.minTimes, 'rows carrying a time');
    // A time is rendered through the spreadsheet's timezone on the way out and
    // was stored through it on the way in, so the round trip only cancels while
    // the two agree. Code.gs falls back to Etc/GMT if the sheet reports none —
    // that fallback would shift every time by hours, in silence.
    reader.tz && reader.tz !== 'Etc/GMT'
      ? pass(`sheet timezone reported as ${reader.tz}`)
      : fail(`sheet timezone is ${JSON.stringify(reader.tz)} — times are rendered through it ` +
             `and a missing one shifts them all (redeploy Code.gs, check File > Settings)`);
    const oddTimes = rows.filter(r => r.Time && !/^\d{1,2}:\d{2} (AM|PM)$/.test(r.Time))
                         .map(r => `${r.Date}="${r.Time}"`);
    oddTimes.length
      ? fail(`Time is not "h:mm AM" on: ${oddTimes.slice(0, 5).join(', ')}`)
      : pass('every time reads as h:mm AM/PM');
    // A time that arrives as a date means the proxy formatted a time-of-day cell
    // with the calendar format -- see cell() in Apps Script/Code.gs.
    const asDates = rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.Time)).map(r => r.Date);
    asDates.length
      ? fail(`Time arrived as a date on: ${asDates.slice(0, 5).join(', ')} (redeploy Code.gs)`)
      : pass('times arrive as times, not dates');
  }

  console.log('\n--- ADAPTED ROWS REPRODUCE THE DASHBOARD ---');
  const adapted = loadAdapter()(rows).filter(r => r.Day && /^\d+$/.test(r.Day.trim()));
  const cycles = splitCycles(adapted);
  is(cycles.length, EXPECT.day1.length, 'cycle count');
  is(cycles.map(c => c[0].Date), EXPECT.day1, 'Day-1 dates');
  const S = loadSafety();
  is(cycles.map(S.detectOvDay), EXPECT.ovDays, 'ovulation days');

  const spottingAsBlood = adapted.filter(r => r.Flow === 'spotting' && S.isBleeding(r));
  spottingAsBlood.length
    ? fail(`${spottingAsBlood.length} spotting row(s) became 'Blood'`)
    : pass("no spotting row was turned into 'Blood'");

  console.log('\n--- THE SAFETY ENGINE ON THE REAL DATA ---');
  // The whole point of the slice: the same engine the phone runs, on the same
  // rows the phone reads, reproducing the hand-checked openings.
  is(cycles.map(S.safeWindowOpensOn), EXPECT.opensOn, 'safe window opens on cycle day');
  // Take the marker away and no cycle may open a window at all, however
  // convincing its temperatures are. Three-over-six delays, it never triggers.
  const unmarked = cycles.map(c => c.map(r => Object.assign({}, r, { Ovulation: '' })));
  is(unmarked.map(S.safeWindowOpensOn), cycles.map(() => null),
     'with the ovulation marker removed no window ever opens');
  console.log(`  info  three-over-six fires on: ${JSON.stringify(cycles.map(S.threeOverSixDay))}`);
  console.log(`  info  opening bleed run ends on: ${JSON.stringify(cycles.map(S.openingBleedEnd))}`);

  const start = cycles[cycles.length - 1][0]._date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  console.log(`  info  cycle day today: ${Math.round((today - start) / 86400000) + 1} (current cycle started ${cycles[cycles.length - 1][0].Date})`);

  console.log('\n--- THE ca5 WRITE ENDPOINT ---');
  // A date one day before the first migrated row and before any Cycle Start.
  // The adapter gives it no Day number, so it is filtered out of every cycle,
  // count and verdict — and if a crash ever leaves one behind, the "first date"
  // check above fails loudly on the next run rather than hiding it.
  const SENTINEL = '2026-03-24';
  console.log(`  info  writing to the sentinel date ${SENTINEL}, then deleting it again`);
  const rowsAt = async token => {
    const r = await call(url, token);
    if (r.ok !== true) throw new Error(JSON.stringify(r).slice(0, 200));
    return r.rows.map(cells => {
      const o = {};
      r.cols.forEach((c, i) => { o[c] = cells[i] == null ? '' : String(cells[i]); });
      return o;
    });
  };
  const sentinelRow = rs => rs.filter(x => x.Date === SENTINEL || x.Date === 'Mar 24');

  try {
    const before = (await rowsAt(writerToken)).length;

    // The whole point of the gate: the token decides, on the server. Hiding the
    // Log tab from a reader is cosmetic — this is the part that holds.
    for (const [what, token, expected] of [
      ['reader token', readerToken, 'read-only'],
      ['wrong token', 'not-a-real-token', 'no-access'],
      ['no token', undefined, 'no-access'],
    ]) {
      const r = await post(url, { t: token, date: SENTINEL, values: { Temp: '99.99' } });
      r.ok === false && r.error === expected
        ? pass(`a write with a ${what} is refused by the server (${expected})`)
        : fail(`a write with a ${what} returned ${JSON.stringify(r).slice(0, 200)}`);
      await pause();
    }

    // Bad requests are refused before anything is written.
    // The expected error is named, not just `ok === false`. A run where the token
    // was intermittently rejected passed all three of these as "refused" — refused
    // for the wrong reason is not the check this is meant to be.
    for (const [what, body, expected] of [
      ['a malformed date', { t: writerToken, date: '24/03/2026', values: { Temp: '97.11' } },
       'bad-request: date must be YYYY-MM-DD'],
      ['a column the sheet does not have', { t: writerToken, date: SENTINEL, values: { Mood: 'fine' } },
       'unknown-column: Mood'],
      ['Date sent as a value', { t: writerToken, date: SENTINEL, values: { Date: '2026-01-01' } },
       'bad-request: Date is the key, not a value'],
    ]) {
      const r = await post(url, body);
      r.ok === false && r.error === expected
        ? pass(`${what} is refused (${r.error})`)
        : fail(`${what}: expected the error "${expected}", got ${JSON.stringify(r).slice(0, 200)}`);
      await pause();
    }

    // 1. A new day lands in date order, not on the end — the read path assumes
    //    strictly ascending dates and splitCycles depends on it.
    const ins = await post(url, { t: writerToken, date: SENTINEL,
      values: { Temp: '97.11', Time: '6:32 AM', Flow: 'spotting', Note: 'verify-proxy sentinel' } });
    ins.ok === true && (ins.action === 'inserted' || ins.action === 'appended')
      ? pass(`a writer write lands (${ins.action}, row ${ins.row})`)
      : fail(`the writer write returned ${JSON.stringify(ins).slice(0, 200)}`);
    await pause();

    let rs = await rowsAt(writerToken);
    is(rs.length, before + 1, 'exactly one row was added');
    let got = sentinelRow(rs);
    is(got.length, 1, 'the sentinel date appears once');
    if (got.length === 1) {
      is(got[0].Temp, '97.11', 'the temperature landed');
      is(got[0].Time, '6:32 AM', 'the time landed as h:mm AM');
      is(got[0].Flow, 'spotting', 'spotting was written as spotting, never as bleeding');
    }
    is(rs[0].Date === SENTINEL || rs[0].Date === 'Mar 24', true,
       'the backdated row was inserted in date order, not appended');
    const misordered = rs.filter((r, i) => i && r.Date <= rs[i - 1].Date).map(r => r.Date);
    misordered.length ? fail(`dates out of order after the write at: ${misordered.join(', ')}`)
                      : pass('dates are still strictly ascending after the write');

    // 2. Idempotence. Google's /exec redirect intermittently 404s and the app
    //    retries; the same date must never become a second row.
    const again = await post(url, { t: writerToken, date: SENTINEL, values: { Temp: '97.22' } });
    wrote(again, 'updated', 'a second write to the same date updates it');
    await pause();
    rs = await rowsAt(writerToken);
    is(rs.length, before + 1, 'still exactly one added row — the retry did not duplicate');
    got = sentinelRow(rs);
    if (got.length === 1) {
      is(got[0].Temp, '97.22', 'the update changed the temperature');
      // Read-patch-write: a column the write never mentioned must survive,
      // including the `cervix: …` text ca2 folded into the Note.
      is(got[0].Note, 'verify-proxy sentinel', 'a column the update did not mention was left alone');
      is(got[0].Flow, 'spotting', 'the untouched Flow survived the update');
    }

    // 2b. The checkbox columns and the one value setValues() would eat.
    //     ca5a: unticking a flag used to write a blank string into a cell that
    //     carries a checkbox, and a Note starting with '=' was stored as a
    //     formula and came back as its result. Neither is reachable from the
    //     offline checks — both need the real sheet.
    const fl = await post(url, { t: writerToken, date: SENTINEL,
      values: { Ovulation: 'TRUE', Exclude: 'TRUE', Note: '=1+1' } });
    wrote(fl, 'updated', 'the flags and the formula-shaped note were written');
    await pause();
    got = sentinelRow(await rowsAt(writerToken));
    if (got.length === 1) {
      is(got[0].Ovulation, 'TRUE', 'a ticked Ovulation reads back as TRUE');
      is(got[0].Exclude, 'TRUE', 'a ticked Exclude reads back as TRUE');
      is(got[0].Note, '=1+1', 'a note starting with = survived as text, not as 2');
    }

    const unfl = await post(url, { t: writerToken, date: SENTINEL, values: { Ovulation: '', Exclude: '' } });
    wrote(unfl, 'updated', 'unticking the flags was accepted');
    await pause();
    got = sentinelRow(await rowsAt(writerToken));
    if (got.length === 1) {
      is(got[0].Ovulation, '', 'an unticked Ovulation reads back blank');
      is(got[0].Exclude, '', 'an unticked Exclude reads back blank');
      is(got[0].Temp, '97.22', 'the temperature was not disturbed by the flag writes');
      // The write above never mentioned Note, but read-patch-write re-enters the
      // whole row — so this is the check that the cell stayed plain text.
      is(got[0].Note, '=1+1', 'the formula-shaped note survived a save that never mentioned it');
    }

    // 3. Cleanup. There is no delete in the app — it exists so this check can
    //    put the sheet back exactly as it found it.
    const del = await post(url, { t: writerToken, date: SENTINEL, op: 'delete' });
    wrote(del, 'deleted', 'the sentinel row was deleted');
    await pause();
    rs = await rowsAt(writerToken);
    is(rs.length, before, 'the sheet is back to the row count it started with');
    is(sentinelRow(rs).length, 0, 'the sentinel date is gone');
  } catch (e) {
    fail(`the write checks could not finish: ${e.message} ` +
         `— check the sheet for a leftover row dated ${SENTINEL} before trusting the next run`);
  }

  console.log(failed ? `\n${failed} CHECK(S) FAILED\n` : '\nAll checks passed.\n');
  process.exit(failed ? 1 : 0);
})();
