#!/usr/bin/env node
// Offline check of index.html's row adapter — no network, no tokens.
//
//   node Tools/adapter-selfcheck.js
//
// The adapter synthesises the Day number the new sheet no longer carries and
// normalises its three yes/no columns. It is extracted from index.html rather
// than copied, so this cannot drift from the shipped code. (ca4 removed the
// Cycle half of the synthesis — the rules read Flow and Ovulation directly
// now, and Tools/safety-selfcheck.js covers them.)
//
// Tools/verify-proxy.js checks the same adapter against the real sheet; this
// one covers the edges real data may not contain (a DST crossing, a row before
// the first Cycle Start, an unreadable date, an odd yes/no spelling).

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = src.indexOf('// >>> ADAPTER');
const b = src.indexOf('// <<< ADAPTER');
if (a < 0 || b < 0) throw new Error('Could not find the ADAPTER markers in index.html');
const adaptRows = new Function(`${src.slice(a, b)}; return adaptRows;`)();

const row = (Date_, cycleStart, Flow, Ovulation, Exclude) =>
  ({ Date: Date_, 'Cycle Start': cycleStart, Flow, Ovulation, Exclude });

const got = adaptRows([
  row('2026-03-24', '', '', ''),            // before any Cycle Start — no day number
  row('2026-03-25', 'TRUE', 'bleeding', ''),
  row('2026-03-26', '', 'spotting', ''),    // spotting must NOT become 'Blood'
  row('2026-03-29', '', '', ''),            // a gap must not shift the day number
  row('2026-04-09', '', '', 'y'),           // hand-typed yes/no spellings still count
  row('2026-11-05', 'Yes', '', ''),         // after the Nov 1 DST change
  row('2026-11-06', '', '', '', 'TRUE'),
  row('2026-11-07', 'maybe', '', ''),       // not a yes/no value — warns, reads as unset
  row('bad-date', '', '', ''),              // skipped, with a warning
]).map(r => [r.Date, r.Day, r.Flow || '', r.Ovulation, r.Exclude].join('|'));

const want = [
  'Mar 24||||',
  'Mar 25|1|bleeding||',
  'Mar 26|2|spotting||',
  'Mar 29|5|||',
  'Apr 9|16||TRUE|',
  'Nov 5|1|||',
  'Nov 6|2|||TRUE',
  'Nov 7|3|||',
];

console.log(got.join('\n'));
if (JSON.stringify(got) !== JSON.stringify(want)) {
  console.error(`\nFAIL\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`);
  process.exit(1);
}
// hasData() is the third independent list of "what a logged day can hold",
// after NEW_COLS in the migration and the placeholder test inside it. Nothing
// binds them, and a column missing from hasData makes real days render blank
// and drop out of detectPhase. So bind them here: every column of the new
// sheet except Date must be named in hasData's body.
const { NEW_COLS } = require('./migrate-sheet.js');
const hasDataBody = /function hasData\(r\) \{([\s\S]*?)\n\}/.exec(src);
if (!hasDataBody) { console.error('\nFAIL  could not find hasData() in index.html'); process.exit(1); }
// The Log writes columns the migration never had (the Symptoms picker's six), so
// every column ENTRY_FIELDS names counts too.
const e1 = src.indexOf('// >>> ENTRY'), e2 = src.indexOf('// <<< ENTRY');
const entry = new Function(`${src.slice(e1, e2)}; return ENTRY_FIELDS;`)();
const loggable = [...new Set([...NEW_COLS.filter(c => c !== 'Date'), ...entry.map(f => f.col)])];
const missing = loggable.filter(c => !hasDataBody[1].includes(c));
if (missing.length) {
  console.error(`\nFAIL  hasData() does not count: ${missing.join(', ')} — those days would render as empty`);
  process.exit(1);
}
console.log(`hasData covers all ${loggable.length} loggable columns`);

// Every yes/no the Log writes is read back as one, or a hand-typed "yes" in the
// sheet would show as unticked.
const flagCols = new Function(`${src.slice(a, b)}; return FLAG_COLS;`)();
const unread = entry.filter(f => f.type === 'flag' && flagCols.indexOf(f.col) < 0).map(f => f.col);
if (unread.length) {
  console.error(`\nFAIL  FLAG_COLS does not read: ${unread.join(', ')}`);
  process.exit(1);
}
console.log('FLAG_COLS reads every yes/no the Log writes');

// The server side of the same lists: Code.gs writes a yes/no as a real checkbox
// value, and free text as text (so "=anxious" is never run as a formula).
const gs = fs.readFileSync(path.join(__dirname, '..', 'Apps Script', 'Code.gs'), 'utf8');
const gsList = name => JSON.parse((new RegExp(`var ${name} = (\\[[^\\]]*\\]);`).exec(gs) || [, 'null'])[1]
  .replace(/'/g, '"'));
const gsFlags = gsList('FLAG_COLS'), gsText = gsList('TEXT_COLS');
const gsMiss = [
  ...entry.filter(f => f.type === 'flag' && !(gsFlags || []).includes(f.col)).map(f => `${f.col} (FLAG_COLS)`),
  ...entry.filter(f => ['text', 'mood'].includes(f.type) && !(gsText || []).includes(f.col)).map(f => `${f.col} (TEXT_COLS)`),
];
if (gsMiss.length) {
  console.error(`\nFAIL  Apps Script/Code.gs is missing: ${gsMiss.join(', ')}`);
  process.exit(1);
}
console.log('Code.gs writes every yes/no as a checkbox and every free-text field as text');

console.log('\nadapter self-check: PASS');
