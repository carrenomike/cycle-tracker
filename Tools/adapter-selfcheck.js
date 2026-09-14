#!/usr/bin/env node
// Offline check of index.html's row adapter — no network, no tokens.
//
//   node Tools/adapter-selfcheck.js
//
// The adapter is what lets ca3 be a transport change: it synthesises the Day
// and Cycle fields the new sheet no longer has, so the twenty-odd downstream
// readers of those two fields keep working untouched. It is extracted from
// index.html rather than copied, so this cannot drift from the shipped code.
//
// Tools/verify-proxy.js checks the same adapter against the real sheet; this
// one covers the edges real data may not contain (a DST crossing, a row before
// the first Cycle Start, an unreadable date).

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = src.indexOf('// >>> ADAPTER');
const b = src.indexOf('// <<< ADAPTER');
if (a < 0 || b < 0) throw new Error('Could not find the ADAPTER markers in index.html');
const adaptRows = new Function(`${src.slice(a, b)}; return adaptRows;`)();

const row = (Date_, cycleStart, Flow, Ovulation) =>
  ({ Date: Date_, 'Cycle Start': cycleStart, Flow, Ovulation });

const got = adaptRows([
  row('2026-03-24', '', '', ''),            // before any Cycle Start — no day number
  row('2026-03-25', 'TRUE', 'bleeding', ''),
  row('2026-03-26', '', 'spotting', ''),    // spotting must NOT become 'Blood'
  row('2026-03-29', '', '', ''),            // a gap must not shift the day number
  row('2026-04-09', '', '', 'TRUE'),
  row('2026-11-05', 'TRUE', '', ''),        // after the Nov 1 DST change
  row('2026-11-06', '', '', ''),
  row('bad-date', '', '', ''),              // skipped, with a warning
]).map(r => [r.Date, r.Day, r.Cycle].join('|'));

const want = [
  'Mar 24||',
  'Mar 25|1|Blood',
  'Mar 26|2|',
  'Mar 29|5|',
  'Apr 9|16|Ovulation',
  'Nov 5|1|',
  'Nov 6|2|',
];

console.log(got.join('\n'));
if (JSON.stringify(got) !== JSON.stringify(want)) {
  console.error(`\nFAIL\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`);
  process.exit(1);
}
console.log('\nadapter self-check: PASS');
