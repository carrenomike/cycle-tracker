#!/usr/bin/env node
// Offline check of index.html's catch-up entry rules — no network, no tokens.
//
//   node Tools/entry-selfcheck.js
//
// Everything that decides what a Save actually sends to the sheet lives in one
// marked block: the field list, the two time spellings, the diff, the refusals
// and the Cycle Start suggestion. Extracted from index.html rather than copied,
// so a change to the app cannot quietly pass a check written against old code.

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = src.indexOf('// >>> ENTRY');
const b = src.indexOf('// <<< ENTRY');
if (a < 0 || b < 0) throw new Error('Could not find the ENTRY markers in index.html');
const E = new Function(
  `${src.slice(a, b)}; return { QUALITY_OPTS, ENTRY_FIELDS, isoOf, isoShift, toSheetTime, fromSheetTime,
     sheetValue, sameTemp, entryDiff, entryProblem, CYCLE_START_LOOKBACK, suggestCycleStart,
     confirmText, writeErrorText };`)();

let failed = 0;
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const is = (actual, expected, what) =>
  actual === expected ? pass(what)
    : fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const same = (actual, expected, what) =>
  is(JSON.stringify(actual), JSON.stringify(expected), what);

// A blank form, so each check can set only the field it is about.
const blank = () => {
  const f = {};
  for (const fld of E.ENTRY_FIELDS) {
    f[fld.col] = fld.type === 'flag' ? false : fld.type === 'quality' ? [] : '';
  }
  return f;
};

console.log('the field list matches the ca2 schema');
const COLS = ['Temp', 'Time', 'Temp Quality', 'Exclude', 'Flow', 'Cervical Mucus',
  'Cervix Texture', 'Cervix Position', 'Breasts', 'Ovulation', 'Cycle Start', 'Note'];
same(E.ENTRY_FIELDS.map(f => f.col), COLS, 'every column, and nothing the sheet has no home for');
// 'Date' is the key the write is addressed to, not a value — the endpoint
// rejects it outright, so the form must never offer it.
is(E.ENTRY_FIELDS.some(f => f.col === 'Date'), false, 'Date is not an editable field');
// ca4: a Flow of 'Bleeding' or 'yes' is invisible to the safety engine, which
// matches the literal string. Spotting is never bleeding.
const flow = E.ENTRY_FIELDS.find(f => f.col === 'Flow');
same(flow.options, ['', 'spotting', 'bleeding'], 'Flow writes the literal "bleeding", and spotting stays spotting');
const mucus = E.ENTRY_FIELDS.find(f => f.col === 'Cervical Mucus');
is(mucus.options.length, 6, 'mucus is the 5-point scale plus blank');
is(mucus.options.includes('Egg-white'), true, 'the migrated spelling "Egg-white" is one of the options');

console.log('\ntime — the sheet holds "h:mm AM" and nothing else (ca3a)');
is(E.toSheetTime('06:32'), '6:32 AM',  'morning, no leading zero');
is(E.toSheetTime('00:05'), '12:05 AM', 'after midnight is 12, not 0');
is(E.toSheetTime('12:00'), '12:00 PM', 'noon is PM');
is(E.toSheetTime('13:07'), '1:07 PM',  'afternoon');
is(E.toSheetTime(''),      '',         'no time entered stays empty');
is(E.toSheetTime('25:00'), '',         'an impossible hour is not written');
is(E.fromSheetTime('6:32 AM'),  '06:32', 'back to what <input type=time> wants');
is(E.fromSheetTime('12:05 AM'), '00:05', '12 AM round-trips to midnight');
is(E.fromSheetTime('1:07 PM'),  '13:07', 'PM round-trips');
is(E.fromSheetTime(''),         '',      'a row with no time opens with an empty field');
for (const t of ['00:00', '06:32', '11:59', '12:00', '23:59']) {
  is(E.fromSheetTime(E.toSheetTime(t)), t, `${t} survives a round trip`);
}

console.log('\nsheetValue — flags are the literal TRUE the safety engine looks for (ca4)');
const flag = { type: 'flag' };
is(E.sheetValue(flag, true),  'TRUE', 'a ticked flag');
is(E.sheetValue(flag, false), '',     'an unticked flag clears the cell');
is(E.sheetValue({ type: 'quality' }, ['off-time', 'disturbed']), 'off-time, disturbed', 'both quality flags');
is(E.sheetValue({ type: 'quality' }, []), '', 'no quality flags');
is(E.sheetValue({ type: 'text' }, '  a note  '), 'a note', 'text is trimmed');

console.log('\nentryDiff — only what changed leaves the phone');
{
  const f = blank();
  f.Temp = '97.88'; f.Time = '06:32'; f.Flow = 'bleeding'; f['Cycle Start'] = true;
  same(E.entryDiff(null, f),
    { Temp: '97.88', Time: '6:32 AM', Flow: 'bleeding', 'Cycle Start': 'TRUE' },
    'a new day sends exactly the fields that were filled in');
}
{
  // The row as ca2 migrated it: the old free-text cervix wording was folded
  // into the Note. Editing anything else must not take that with it.
  const row = { Temp: '97.90', Time: '6:32 AM', Note: 'cervix: high and soft', Breasts: 'minor' };
  const f = blank();
  f.Temp = '97.9'; f.Time = '06:32'; f.Note = 'cervix: high and soft'; f.Breasts = 'sore';
  same(E.entryDiff(row, f), { Breasts: 'sore' }, 'one changed field, and the migrated note is left alone');
}
{
  const row = { Temp: '97.90' };
  const f = blank(); f.Temp = '97.90';
  same(E.entryDiff(row, f), {}, 'saving an unchanged row sends nothing at all');
}
{
  // Idempotence is what makes a retry safe after the /exec redirect 404s: the
  // same form sent twice is the same values into the same dated row.
  const row = { Temp: '97.88', Flow: 'spotting' };
  const f = blank(); f.Temp = '97.88'; f.Flow = 'spotting';
  same(E.entryDiff(row, f), {}, 'a re-send after a flaky redirect is a no-op');
}
{
  const row = { Flow: 'bleeding', Exclude: 'TRUE' };
  const f = blank();
  // Key order follows ENTRY_FIELDS, which is the order the confirmation reads in.
  same(E.entryDiff(row, f), { Exclude: '', Flow: '' }, 'clearing a field is sent as a clear, not skipped');
}
is(E.sameTemp('97.9', '97.90'), true,  '97.9 and 97.90 are the same reading');
is(E.sameTemp('97.9', '97.91'), false, 'a hundredth apart is a change');
is(E.sameTemp('', ''),          true,  'no temp either side');
is(E.sameTemp('97.9', ''),      false, 'clearing a temp is a change');

console.log('\nentryProblem — refusals, so a saved entry is never a guess');
{
  const f = blank();
  // Readings get missed and the day still happened. Nothing else on the form
  // depends on a temperature, and the coverline skips a row without one.
  f.Flow = 'bleeding';
  is(E.entryProblem(null, f), null, 'a new day with no temperature still saves');
  is(E.entryProblem({ Flow: 'bleeding' }, f), null, 'so does an existing temp-less row');
  f.Flow = '';
  f.Temp = '97.88';
  is(E.entryProblem(null, f), null, 'a temperature in range saves');
  for (const bad of ['80', '120', '9.7', 'abc', '97.888']) {
    const g = blank(); g.Temp = bad;
    is(E.entryProblem(null, g) !== null, true, `"${bad}" is refused`);
  }
  const h = blank(); h.Time = '06:32';
  is(E.entryProblem({ Flow: '' }, h) !== null, true, 'a time with no temperature is refused');
}

console.log('\nsuggestCycleStart — suggested, never set');
{
  const flows = {
    '2026-09-01': 'bleeding', '2026-09-02': 'bleeding',
    '2026-09-10': 'spotting', '2026-09-11': 'bleeding',
  };
  const on = iso => flows[iso] || '';
  is(E.suggestCycleStart(on, '2026-09-01'), true,  'bleeding after a clear stretch suggests Day 1');
  is(E.suggestCycleStart(on, '2026-09-02'), false, 'the second day of a period does not');
  is(E.suggestCycleStart(on, '2026-09-11'), true,  'spotting the day before does not block the suggestion');
  is(E.suggestCycleStart(on, '2026-09-10'), false, 'spotting on its own never suggests Day 1');
  is(E.suggestCycleStart(on, '2026-09-20'), false, 'a day with no flow never suggests Day 1');
  is(E.suggestCycleStart(iso => (iso === '2026-09-20' ? 'Bleeding' : ''), '2026-09-20'), true,
    'capitalisation in the sheet still matches');
}
// Nothing may ever suggest ovulation — that marker is Mike's hand alone, and a
// wrong one opens the safe window early.
/Ovulation/.test(src.slice(src.indexOf('function suggestCycleStart')).slice(0, 400))
  ? fail('something in the suggestion path touches Ovulation')
  : pass('no suggestion path touches the ovulation marker');

console.log('\nthe confirmation says what is about to be written (ca4)');
{
  const t = E.confirmText('Mon, Sep 14', { Temp: '97.88', Flow: 'bleeding', Exclude: '' });
  is(/97\.88/.test(t) && /bleeding/.test(t), true, 'it lists the values, not a count');
  is(/Exclude: \(cleared\)/.test(t), true, 'a cleared field says so rather than showing blank');
  is(/Mon, Sep 14/.test(t), true, 'it names the day being written to');
}

console.log('\nwrite errors are spoken out loud, never swallowed');
is(E.writeErrorText('read-only').length > 10, true, 'a rejected reader token gets a real sentence');
is(E.writeErrorText('write-failed: boom'), 'write-failed: boom', 'an unknown error is shown verbatim');
is(E.writeErrorText(undefined).length > 0, true, 'even an empty reply produces a message');

console.log('\nthe app itself');
// The token in the address bar is the only copy when storage refuses it (ca7a).
src.slice(src.indexOf('function postEntry'), src.indexOf('async function saveEntry')).includes('localStorage')
  ? fail('the write path reads the token from storage instead of TOKEN')
  : pass('the write path uses TOKEN, so an address-bar-only token can still save');
/Content-Type': 'text\/plain/.test(src)
  ? pass('the POST stays a simple request — Apps Script cannot answer a preflight')
  : fail('the POST content type would trigger a CORS preflight');
// No optimistic UI: the only thing that updates the screen after a write is a
// fresh read of the sheet.
/setSaveStatus\('Saved[\s\S]{0,60}loadData\(\)/.test(src)
  ? pass('a successful write re-reads the sheet rather than patching the screen')
  : fail('the screen is updated without re-reading the sheet');
/_role !== 'writer'\) return ''/.test(src)
  ? pass('the tab bar is hidden from a reader')
  : fail('the tab bar is shown to everyone');

console.log(failed ? `\nentry self-check: ${failed} FAILED` : '\nentry self-check: PASS');
process.exit(failed ? 1 : 0);
