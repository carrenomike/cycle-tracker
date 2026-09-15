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
const missing = NEW_COLS.filter(c => c !== 'Date' && !hasDataBody[1].includes(c));
if (missing.length) {
  console.error(`\nFAIL  hasData() does not count: ${missing.join(', ')} — those days would render as empty`);
  process.exit(1);
}
console.log(`hasData covers all ${NEW_COLS.length - 1} loggable columns`);

console.log('\nadapter self-check: PASS');
