
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

---

## 2026-09-13 — Plan restructure: the lunation wheel is scrapped

Not a slice. Mike ran `/grill-me` with "scrap the whole moon cycle circle page — my wife didn't like it. I do still
want to save the mobile app data entry and some of the rule changes." Nine questions; every answer below is his.

**What died.** `slice-lw4-wheel-home-tab.md` (the circular wheel + home tab) and `slice-lw8-dashboard-restyle.md`
(the earthy restyle), deleted. The **design gate** — the checkpoint where Tirzah approved the visual direction —
died with them: she asked to be hands off. `Assets/` (68 files, 273K of wheel mockups and palette studies) was
untracked with no git history, so deleting it was unrecoverable; Mike was told that explicitly and said "Make it
gone."

**What was nearly lost with it.** lw4 was named for the wheel, but the *safety engine* lived inside it — the full
Safe/Unsafe rule, three-over-six, the coverline, the Bleeding/Follicular/Luteal vocabulary, the missed-Day-1
guard. That is the actual product; the circle was only a way of drawing it. Extracted whole into the new
`slice-ca4-safety-engine.md`, which edits the existing dashboard's stat cards in place and adds no new screen. Its
locked decisions and the **d24 / d22 / d30 / d37 / never** regression target are carried over verbatim.

**The gate's replacement is a constraint, not a freedom.** With no approval checkpoint, Tirzah's screen changes
**only** where a change is a correctness or safety requirement. Cosmetic changes to surfaces she sees are now out
of scope for every slice in this plan. The one new thing this plan puts in front of her is ca7's staleness banner.

**Tab shape settled.** Reader sees a single screen with **no tab bar at all**; writer sees `Dashboard | Log`.
Flagged to Mike and restated in both STATE.md and ca5: hiding the tab is cosmetic, **not** a security boundary —
the Apps Script rejecting writes without the writer token is the only thing that actually stops a write.

**Dependency rewiring.** lw5 and lw7 were both blocked on lw4 *and* the design gate; both are dead, so both
unblock. ca5 (catch-up entry) now depends on ca4 — Mike chose "safety first", so a backdated entry lands into a
verdict that is already correct rather than one still being fixed. ca7 (viewer staleness) was repointed at ca3,
since it touches only the read path, and can be pulled forward.

**Renames.** `Plan/lunation-wheel/` → `Plan/cycle-app/`; `Docs/Archive/Lunation Wheel Log.md` → `Cycle App Log.md`;
slices lw1-lw3 → ca1-ca3, lw5→ca5, lw6→ca6, lw7→ca7, lw9→ca8. The project `CLAUDE.md` session-start prompt and
README's slice index follow. STATE.md's locked decisions were regrouped into Scope / Data and access / Shape /
Rules, wheel geometry stripped, the design-gate block and the stale lw4 deviation removed.

**Unchanged:** the moon stays exactly where it already shipped — the glyph strip above the timeline chart and the
Moon at Day 1 / Moon at Ovulation columns. Nothing else lunar gets built. The dashboard is the app and is not
restyled.
