# Slice lw1 — Fix the four live defects

## Scope

The shipped app has four confirmed bugs. None of them depend on any design decision, and all four survive into the
demoted dashboard tab, so fixing them now is not throwaway work. After this slice:

1. The phase card reads the last **logged** rows, not the blank pre-created placeholder rows at the end of the sheet.
2. Nothing in the app infers an ovulation day from cervical mucus. Ovulation is a manual marker or it is nothing.
3. The "Cycle Day" number is **today's** cycle day, computed from dates — not the day number of the last logged row.
4. `deploy.bat` stages every changed file and shouts when a step fails, instead of silently pushing only `index.html`.

## Verified facts

All line numbers confirmed by reading `index.html` at commit `1065c1e`.

- `index.html:272-279` — `detectPhase(cycle)` takes `cycle.slice(-5)`, the literal last five rows of the cycle array.
  The sheet contains pre-created future rows through 2026-09-17 that are blank, so on most days `last5` is all
  blanks and the function falls through to `'follicular'` regardless of what was actually logged.
- `index.html:268-270` — `hasData(r)` already exists and is the right test for "this row was actually logged".
- `index.html:355-361` — `lastDataIndex(cycle)` already exists and walks backwards to the last `hasData` row. Reuse
  what is there; do not write a second version.
- `index.html:283-287` — `detectOvRow(cycle)` falls back to the first row whose `Cervical Mucus` contains `"egg"`.
- `index.html:289-292` — `detectOvDay(cycle)` is the day-number view of `detectOvRow`.
- Callers of the mucus fallback: `index.html:502` (`pastOvDays` feeding the `avgOvDay` stat), `index.html:521`
  (history table "Ovulation" column), `index.html:523` (`moonCell` for moon-at-ovulation), `index.html:493`
  (the current-cycle history row).
- **Impact of removing the fallback, measured against the live sheet on 2026-08-26: zero today.** All four completed
  cycles have a real `Cycle = 'Ovulation'` marker (days 16 / 18 / 23 / 31) and the marker wins the `||` chain, so
  the fallback never fires. It is being removed because it *would* fire the moment a marker is missing — cycle 2's
  mucus would have claimed day 12 against a real marker of day 18. The em-dash for cycle 5 is the correct output.
- `index.html:375-377` — `dayNumber` is `parseInt(current[lastDataIndex(current)].Day)`, i.e. the last logged row's
  day number. It is behind by one per unlogged day.
- `index.html:1013-1016` — every row already carries `_date`, a real local `Date` object parsed from the sheet's
  `Date(y,m,d)` cell value, with a `console.warn` when parsing fails. Use `_date` for the arithmetic; do not
  re-parse the display string.
- `index.html:390-394` — `nextPeriodDate` already does `new Date(anchorRow._date)` plus `setDate`, the same pattern.
- `index.html:379-380` — `const ovRow = current.find(r => r.Cycle === 'Ovulation')` — the next-period prediction
  already uses the marker only and is correct. Leave it alone.
- `deploy.bat` — the whole file is `git add index.html`, `git commit -m "Update dashboard"`, `git push`, with no
  error checking, then an unconditional `echo Done!`. Any file other than `index.html` is silently never deployed,
  and a rejected push still prints "Done!".

## Locked decisions

- Ovulation day is a **manual marker only**. No calculation may declare one. That is the whole reason bug 2 is a bug.
- Cycle day is **date arithmetic**, never a lookup of the last logged row.
- The wheel's phase vocabulary will later be **Bleeding / Follicular / Luteal** only. **This slice does not change
  the dashboard's existing four-value vocabulary** (`Menstrual / Follicular / Ovulation / Luteal` at
  `index.html:370`) — that belongs to the wheel, and changing it here would widen the slice. Fix the window the
  function reads, not the words it prints.
- Removing the mucus fallback makes the Ovulation column show an em-dash for any cycle with no marker. That is the
  intended, correct output — not a regression to be "fixed" by reinstating an estimate.
- **Surface failures loudly.** Where a fix needs a fallback path, `console.warn` on it rather than failing silently.

## Implementation notes

Everything is in `index.html` plus `deploy.bat`. No new files.

**1. `detectPhase` (index.html:272)** — bound the lookback to real rows. Replace `cycle.slice(-5)` with the last
five rows that pass `hasData`, leaving the rest of the function untouched. `hasData` counts `r.Cycle` as data, so a
bleed-only row with no temp still counts, which is what we want.

**2. `detectOvRow` (index.html:283)** — delete the mucus line from the `||` chain so the function returns the
`Cycle === 'Ovulation'` row or `null`, and rewrite the comment above it to say the marker is never inferred.
`detectOvDay` needs no change. Grep `detectOvRow` and `detectOvDay` first to confirm no other caller leaned on the
fallback.

**3. `dayNumber` (index.html:375-377)** — compute from today, with a loud fallback:

- Take `current[0]?._date` as the cycle start.
- If it is a valid `Date`: normalise both it and `new Date()` to local midnight (`new Date(y, m, d)` on each), take
  the millisecond difference, `Math.round` it over `86400000`, add 1. Local-midnight normalisation on both sides is
  deliberate — it makes the difference an exact whole number of days and immune to DST.
- Otherwise: `console.warn` that the cycle start date is missing, and fall back to the old
  `parseInt(current[lastDataIndex(current)].Day)` behaviour rather than rendering nothing.

Check what else consumed `ldIdx` before deleting the variable.

Two knock-on checks before calling this done:

- `index.html:493` prints the current-cycle length in the history table off `dayNumber` — confirm it still reads
  sensibly now that it means "days elapsed as of today" rather than "days logged".
- If `dayNumber` can now exceed `current.length` (today is past the last pre-created row), make sure nothing indexes
  into `current` with it.

**4. `deploy.bat`** — stage everything and check each step:

- `git add -A` instead of `git add index.html`.
- `git diff --cached --quiet` immediately after; it exits 0 when nothing is staged, so that branch prints
  "Nothing to deploy" and exits 0 rather than making an empty commit.
- Check `errorlevel` after both `git commit` and `git push`; on failure jump to a label that prints a loud
  `*** DEPLOY FAILED — the site was NOT updated ***` banner, pauses, and exits 1.
- Only print "Done!" on the path where the push actually succeeded.

The repo is public, so `git add -A` must never pick up a secret — check `git status` before running it.

## Exit criteria

- No typecheck, test or build exists in this project. Do not invent one.
- **Headless check before handing over**, as a throwaway script in the scratchpad over the real sheet rows:
  (a) print `detectPhase` for the current cycle before and after the fix; (b) confirm `detectOvDay` is unchanged for
  all four completed cycles and `null` for cycle 5; (c) print the computed cycle day for today and compare it to the
  hand-count from the Day-1 date. State all three results in the STATE line.
- **Live test is Mike's**, in Chrome on his phone against the deployed page. What he should see:
  - Cycle Day matches today's real cycle day even with unlogged days at the end of the sheet.
  - The phase card shows a phase consistent with what was actually logged recently, not a stuck "Follicular".
  - The Cycle History "Ovulation" column unchanged for cycles 1-4, em-dash for the current cycle.
- `deploy.bat` verified by running it: it should commit both `index.html` and the plan files, and print the failure
  banner rather than "Done!" if the push is rejected.
