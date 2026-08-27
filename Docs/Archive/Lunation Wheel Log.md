
## Slice lw1 — Fix the four live defects (2026-08-26, from commit 1065c1e)

**1. `detectPhase` read blank rows.** `cycle.slice(-5)` took the literal last five array entries. The sheet carries
pre-created future rows through 2026-09-17 with every field blank, so on most days the lookback window was all
blanks and the function fell through to `'follicular'` no matter what had been logged. Fixed by slicing
`cycle.filter(hasData)` instead — reusing the existing `hasData` predicate. Measured today: the window moved from
rows Day 31-35 (all blank) to Day 9-13 (all logged). Both windows happen to yield `follicular` on 2026-08-26
because neither contains a Blood or Ovulation marker, so Mike will not see a visible change today; the fix is real
regardless.

**2. Ovulation inferred from cervical mucus.** `detectOvRow` fell back to the first row whose `Cervical Mucus`
contained `"egg"`. Removed that arm of the `||` chain; the function now returns the `Cycle === 'Ovulation'` row or
`null`. Callers untouched (`index.html` lines ~502 `pastOvDays`, ~521 history Ovulation column, ~523 moon-at-
ovulation). Impact against the live sheet: zero today — all four completed cycles carry a real marker (days
16/18/23/31) which already won the `||`, and cycle 5 has neither a marker nor egg-white mucus logged. The fallback
was removed because of what it *would* have done: cycle 2's mucus would have claimed day 12 against a real marker
of day 18. An em-dash for a markerless cycle is now the correct, intended output.

**3. Cycle Day was the last logged row's `Day`.** `parseInt(current[lastDataIndex(current)].Day)` fell behind by one
per unlogged day. Replaced with date arithmetic off `current[0]._date` (the real `Date` parsed from the sheet's
`Date(y,m,d)` cell), normalising both the start date and `new Date()` to local midnight so the difference is an
exact whole number of days and DST-immune, then `Math.round(diff / 86400000) + 1`. If `_date` is missing or
invalid it `console.warn`s and falls back to the old behaviour rather than rendering nothing. `ldIdx` had no other
consumer and is gone. Verified: cycle start 2026-08-14, today 2026-08-26 → day 13, matching both the hand-count
and the old value (day 13 happens to be logged today). `dayNumber` is arithmetic-only at lines ~405-420 and ~495 —
it never indexes into `current` — so it exceeding `current.length` on a future day is harmless. The current-cycle
history row now reads "days elapsed as of today" rather than "days logged", which is the correct meaning for an
in-progress cycle.

**4. `deploy.bat` deployed one file and never failed.** Was `git add index.html` / `git commit` / `git push` /
unconditional `echo Done!`. Any other changed file was silently never deployed, and a rejected push still printed
success. Rewritten: `git add -A`, then `git diff --cached --quiet` to exit 0 with "Nothing to deploy" instead of
making an empty commit, a `git diff --cached --name-status` echo so the staged file list is visible, and
`errorlevel` checks after add/commit/push jumping to a `:fail` label that prints a
`*** DEPLOY FAILED - the site was NOT updated ***` banner, pauses and exits 1. "Done!" prints only on the
successful-push path. `git status` checked before switching to `-A`: the only untracked paths are `Docs/` and
`Plan/`, no secrets.

**Headless verification** — throwaway `check.js` in the scratchpad, fetching the live gviz JSON and replicating the
parse and both old/new function bodies. Not committed.
