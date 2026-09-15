#!/usr/bin/env node
// Offline check of index.html's safety engine — no network, no tokens.
//
//   node Tools/safety-selfcheck.js
//
// The engine is EXTRACTED from index.html between the SAFETY markers rather
// than copied, so this cannot quietly drift from the code the phone runs.
//
// Tools/verify-proxy.js runs the same engine against the real sheet and asserts
// the five known safe-window openings. This one covers the edges the real data
// does not contain: a temperature that exactly ties the coverline, a cycle with
// its ovulation marker removed, mid-cycle breakthrough bleeding, and a
// three-over-six baseline that would overlap its own highs.

const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(INDEX, 'utf8');

const a = src.indexOf('// >>> SAFETY');
const b = src.indexOf('// <<< SAFETY');
if (a < 0 || b < 0) throw new Error('Could not find the SAFETY markers in index.html');
const E = new Function(`${src.slice(a, b)}; return {
  hasData, isOv, isBleeding, phaseTag, isUsableTemp, cents, detectPhase,
  detectOvRow, detectOvDay, coverlineCents, calcCoverline, lastDataIndex,
  unloggedDays, openingBleedEnd, threeOverSixDay, safeWindowOpensOn, safetyVerdict };`)();

let failed = 0;
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const is = (actual, expected, what) =>
  JSON.stringify(actual) === JSON.stringify(expected)
    ? pass(`${what}: ${JSON.stringify(actual)}`)
    : fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

// A cycle is built from compact day specs so the temperatures stay readable:
//   [day, temp, flow, ovulation, exclude]
const cyc = specs => specs.map(([Day, Temp, Flow, Ovulation, Exclude]) => ({
  Day: String(Day),
  Temp: Temp == null ? '' : String(Temp),
  Flow: Flow || '',
  Ovulation: Ovulation ? 'TRUE' : '',
  Exclude: Exclude ? 'TRUE' : '',
}));

// Six flat baseline days whose maximum is 97.88, so the coverline is 97.98.
const BASE = [97.80, 97.82, 97.85, 97.88, 97.80, 97.84];
const baseline = (fromDay = 1) => BASE.map((t, i) => [fromDay + i, t, 'bleeding']);

console.log('\n--- OPENING BLEED RUN ---');
{
  // Days 1-4 bleed, day 5 only spots. Spotting is not bleeding, so the run ends
  // at 4 — otherwise it would swallow the spotting days that trail cycles 3-4.
  const c = cyc([[1, 97.9, 'bleeding'], [2, 97.9, 'bleeding'], [3, 97.9, 'bleeding'],
                 [4, 97.9, 'bleeding'], [5, 97.9, 'spotting'], [6, 97.9]]);
  is(E.openingBleedEnd(c), 4, 'run ends at the last consecutive bleeding day');
  is(E.safetyVerdict(c, 3).safe, true, 'day 3 of the run is Safe');
  is(E.safetyVerdict(c, 4).safe, true, 'the last day of the run is Safe');
  is(E.safetyVerdict(c, 5).safe, false, 'the spotting day after the run is Unsafe');
}
{
  // A day nobody logged is not evidence of bleeding.
  const c = cyc([[1, 97.9, 'bleeding'], [3, 97.9, 'bleeding'], [4, 97.9, 'bleeding']]);
  is(E.openingBleedEnd(c), 1, 'a missing day ends the run');
}
{
  // Breakthrough bleeding mid-cycle must never flip a fertile day to Safe.
  const c = cyc([[1, 97.9, 'bleeding'], [2, 97.9, 'bleeding'],
                 [13, 97.9], [14, 97.9, 'bleeding'], [15, 97.9]]);
  is(E.safetyVerdict(c, 14).safe, false, 'mid-cycle breakthrough bleeding is still Unsafe');
}
{
  // A cycle whose first logged day is not a bleed has no opening run at all.
  const c = cyc([[1, 97.9, 'spotting'], [2, 97.9, 'bleeding']]);
  is(E.openingBleedEnd(c), 0, 'no run when day 1 is not a bleed');
  is(E.safetyVerdict(c, 1).safe, false, 'day 1 without a bleed is Unsafe');
}

console.log('\n--- THREE OVER SIX ---');
{
  // Baseline max 97.88 -> coverline 97.98. The third high must reach 98.18.
  const fires = cyc([...baseline(), [7, 97.99], [8, 98.00], [9, 98.18]]);
  is(E.threeOverSixDay(fires), 9, 'three clear highs fire on the third');

  // The tie. 97.88 + 0.1 is 97.97999999999999 in floating point, so a first
  // high of exactly 97.98 used to count as above the line. It ties it.
  const ties = cyc([...baseline(), [7, 97.98], [8, 98.30], [9, 98.40]]);
  is(E.threeOverSixDay(ties), null, 'a temp that exactly ties the coverline does not clear it');

  // The third high must clear by 0.2, not merely exceed the line.
  const short = cyc([...baseline(), [7, 97.99], [8, 98.00], [9, 98.17]]);
  is(E.threeOverSixDay(short), null, 'a third high 0.19 above the line does not fire');
}
{
  // Non-overlap: the six baseline days are the six usable temps BEFORE the
  // first high. If the window overlapped the highs, the 98.60 would land in the
  // baseline, lift the coverline to 98.70 and the rule would never fire —
  // exactly the bug the prototype had.
  const c = cyc([...baseline(), [7, 98.60], [8, 98.60], [9, 98.60]]);
  is(E.threeOverSixDay(c), 9, 'the baseline six do not overlap the three highs');
  is(E.threeOverSixDay(cyc([...baseline(), [7, 98.6], [8, 98.6]])), null,
     'eight usable temps cannot fire — there is no room for six plus three');
}
{
  // Temp-less days and excluded readings are skipped, not read as zeros and not
  // counted towards the six or the three. Day 4 has no temperature at all and
  // day 8 is excluded; the fire therefore lands on day 11, not day 9.
  const c = cyc([[1, 97.80, 'bleeding'], [2, 97.82, 'bleeding'], [3, 97.85, 'bleeding'],
                 [4, null], [5, 97.88], [6, 97.80], [7, 97.84],
                 [8, 99.90, '', false, true], [9, 97.99], [10, 98.00], [11, 98.18]]);
  is(E.threeOverSixDay(c), 11, 'temp-less and excluded rows are skipped, not counted');
}

console.log('\n--- THE WINDOW ONLY OPENS BEHIND A MARKER ---');
{
  const fires = [...baseline(), [7, 97.99], [8, 98.00], [9, 98.18]];
  // Same temperatures, no ovulation marker anywhere: three-over-six may delay
  // an opening but must never trigger one.
  const noMarker = cyc(fires);
  is(E.safeWindowOpensOn(noMarker), null, 'no marker means the window never opens');
  is(E.threeOverSixDay(noMarker), 9, 'three-over-six still fires — it just may not open the window');
  is(E.safetyVerdict(noMarker, 40).safe, false, 'day 40 with no marker is still Unsafe');

  // Marker on day 3: marker + 4 is day 7, but the rule fired on day 9, so the
  // later of the two wins and the window opens on 9.
  const early = cyc(fires.map(r => (r[0] === 3 ? [3, r[1], 'bleeding', true] : r)));
  is(E.safeWindowOpensOn(early), 9, 'three-over-six delays an opening past marker + 4');

  // Marker on day 8 and no fire after it: marker + 4 = day 12.
  const late = cyc([...baseline(), [7, 97.90], [8, 97.90, '', true], [9, 97.91]]);
  is(E.threeOverSixDay(late), null, 'no fire in this cycle');
  is(E.safeWindowOpensOn(late), 12, 'with no fire the window opens at marker + 4');
  is(E.safetyVerdict(late, 11).safe, false, 'the day before the opening is Unsafe');
  is(E.safetyVerdict(late, 12).safe, true, 'the opening day itself is Safe');
}

console.log('\n--- COVERLINE ---');
{
  const c = cyc([[1, 97.80], [2, 97.82], [3, 99.99, '', false, true], [4, 97.88],
                 [5, 97.80], [6, 97.84], [7, 97.86], [8, 97.90, '', true]]);
  is(E.coverlineCents(c), 9798, 'excluded readings are left out of the coverline');
  is(E.calcCoverline(c), 97.98, 'the degrees view matches the cents');
  is(E.coverlineCents(cyc([[1, 97.8], [2, 97.9]])), null, 'no marker means no coverline');
}

console.log('\n--- PHASE VOCABULARY ---');
{
  is(E.detectPhase(cyc([[1, 97.9, 'bleeding']])), 'bleeding', 'a bleeding day reads as bleeding');
  is(E.detectPhase(cyc([[1, 97.9], [2, 97.9, '', true], [3, 97.9]])), 'luteal',
     'a marked cycle reads as luteal, never as ovulation');
  is(E.detectPhase(cyc([[1, 97.9], [2, 97.9]])), 'follicular', 'an unmarked cycle reads as follicular');
  const label = /const phaseLabel = \{([^}]*)\}/.exec(src);
  !label ? fail('could not find phaseLabel in index.html')
    : /Ovulation/.test(label[1]) ? fail(`phaseLabel still offers Ovulation: ${label[1].trim()}`)
    : pass('the Current Phase card has no Ovulation value');
}

console.log('\n--- UNLOGGED DAYS ---');
{
  const c = cyc([[1, 97.9, 'bleeding'], [2, 97.9], [3, 97.9]]);
  is(E.unloggedDays(c, 6), 3, 'three days behind reads as three');
  is(E.unloggedDays(c, 3), 0, 'up to date reads as zero');
  // The count is shown on the Cycle Day card in a warning colour and nothing
  // else. There is deliberately no "period may have started" message at any
  // cycle day: cycles here often run to 37 days, so a day-29 prompt would cry
  // wolf most cycles (Mike, 2026-09-15).
  const render = /function render\(cycles\) \{([\s\S]*?)\n\}/.exec(src);
  if (!render) fail('could not find render() in index.html');
  else {
    /status-caution/.test(render[1])
      ? pass('the unlogged count is shown in a warning colour')
      : fail('the unlogged count is not flagged in colour');
    /Period may have started|dayNumber >= 29/.test(render[1])
      ? fail('a cycle-day threshold is guessing at a missed period again')
      : pass('no cycle-day threshold guesses at a missed period');
  }
}

console.log(failed ? `\nsafety self-check: ${failed} FAILED\n` : '\nsafety self-check: PASS\n');
process.exit(failed ? 1 : 0);
