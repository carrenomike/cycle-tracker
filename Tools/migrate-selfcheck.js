#!/usr/bin/env node
// Checks on migrate-sheet.js that do not need the network or the old sheet.
//
//   node Tools/migrate-selfcheck.js
//
// These exist because of ca2: the original run dropped the source sheet's `Time`
// column and reported "nothing lost", because every check it had compared a
// source column against a destination that existed. A column with no destination
// was invisible. The last check here is the one that would have caught it.

const assert = require('assert');
const { migrate, verify, fmtTime, SOURCE_COLS } = require('./migrate-sheet.js');

// Build a source row the way fetchRows does: gviz labels as keys, plus _date.
const row = (y, m, d, extra = {}) =>
  Object.assign({ Day: '', Date: '', Temp: '', Time: '', 'Cervix Texture': '',
    'Cervical Mucus': '', Breasts: '', Exclude: '', Cycle: '', Note: '',
    _date: new Date(y, m - 1, d) }, extra);

// --- fmtTime ---------------------------------------------------------------
assert.strictEqual(fmtTime([6, 32, 0, 0]), '6:32 AM', 'gviz morning time');
assert.strictEqual(fmtTime([13, 5, 0, 0]), '1:05 PM', 'gviz afternoon time');
assert.strictEqual(fmtTime([0, 7, 0, 0]), '12:07 AM', 'midnight is 12, not 0');
assert.strictEqual(fmtTime([12, 0, 0, 0]), '12:00 PM', 'noon is 12 PM');
assert.strictEqual(fmtTime('  6:32 AM '), '6:32 AM', 'text cell kept verbatim');
assert.strictEqual(fmtTime(''), '', 'empty stays empty');
assert.strictEqual(fmtTime(null), '', 'null stays empty');

// --- Time survives the migration -------------------------------------------
const src = [
  row(2026, 4, 4, { Day: 1, Temp: 97.9, Time: [6, 32, 0, 0], Cycle: 'Blood' }),
  row(2026, 4, 5, { Day: 2, Temp: 98.1 }),                       // temp, no time
  row(2026, 4, 6, { Day: 3, Time: [5, 15, 0, 0] }),              // time, no temp
  row(2026, 4, 7, { Day: 4 }),                                   // truly empty
];
const { out, dropped } = migrate(src);
assert.deepStrictEqual(out.map(r => r.Time), ['6:32 AM', '', '5:15 AM'], 'times carried');

// A row whose only content is a time is a logged day, not a placeholder. Before
// ca2a the emptiness test did not look at Time, so this row vanished silently.
assert.strictEqual(out.length, 3, 'time-only row is kept');
assert.deepStrictEqual(dropped.map(d => d[0]), ['2026-04-07'], 'only the empty row drops');
assert.deepStrictEqual(verify(src, out), [], 'a faithful migration verifies clean');

// --- the guard: a source column with no destination ------------------------
const withMood = src.map(r => Object.assign({ Mood: '' }, r));
withMood[0].Mood = 'good';
const fails = verify(withMood, migrate(withMood).out);
assert.ok(fails.some(f => /does not handle: Mood/.test(f)),
  `an unmapped source column must fail verification, got: ${JSON.stringify(fails)}`);

// And it must fail on the column's mere presence, not on it having values --
// `Time` was populated, but a column that is empty today can be filled tomorrow.
const blankMood = src.map(r => Object.assign({ Mood: '' }, r));
assert.ok(verify(blankMood, migrate(blankMood).out).some(f => /does not handle: Mood/.test(f)),
  'an empty unmapped column must fail too');

// --- the other half of the gate: listed, but it landed nowhere --------------
// This is the ca2 bug itself. `Time` was a known column with a known
// destination; the destination simply never got written. Listing a name must
// not be enough to satisfy the check.
const blanked = out.map(r => Object.assign({}, r, { Time: '' }));
assert.ok(verify(src, blanked).some(f => /source column Time carries values but its destination Time came out empty/.test(f)),
  'a source column whose destination is empty on every row must fail verification');

// A destination that is not a column of the new sheet is a typo, and a typo
// would otherwise pass silently forever.
SOURCE_COLS.Note = 'Notes';
assert.ok(verify(src, migrate(src).out).some(f => /maps Note to "Notes", which is not a column/.test(f)),
  'a destination outside NEW_COLS must fail verification');
SOURCE_COLS.Note = 'Note';
assert.deepStrictEqual(verify(src, out), [], 'and the check is clean again once it is corrected');

console.log('migrate-sheet self-check: all checks passed');
