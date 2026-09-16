
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


## Slice ca2 — New schema and migration (2026-09-13, commit 8ca2a9a)

**Tool.** `Tools/migrate-sheet.js`, plain Node, no dependencies. Takes the old sheet ID as a CLI argument rather
than a constant — this repo is public and must never carry an ID again — and writes its TSV to a path the caller
gives, which must be outside the repo because the output is personal health data.

**Source shape.** The old sheet's columns were Day, Date, Temp, Time, Cervix Texture, Cervical Mucus, Breasts,
Exclude, Cycle, Note. ~~`Time` was empty on every row.~~ **FALSE — corrected 2026-09-14 (ca2a).** `Time` held 88
values across 177 rows, 5-6am on almost all of them. Nothing in the migration ever established this; the sentence
was written from assumption and ca3a then trusted it and deleted the display column. `Cycle` carried two different kinds of fact — `Blood` (30
rows) and `Ovulation` (5 rows) — which split into the new `Flow` and `Ovulation` columns. The `Day` column was
checked against date arithmetic from each Day-1 date: zero mismatches across 177 rows, so no cycle-boundary
ambiguity to resolve. Dates are continuous from 2026-03-25 to 2026-09-17 with no gaps.

**Dropped rows (12).** A row carrying nothing but Day and Date is a pre-created placeholder, not a logged day.
Six are past missed days (04-24, 05-02, 05-06, 05-11, 05-24, 07-26) and six are the future rows 09-12..09-17 that
caused the ca1 `detectPhase` bug. Rows with no Temp but *some* other data were kept, not dropped — five bleeding
days and one travel note, including 2026-03-25, which is Day 1 of cycle 1 and carries a Cycle Start flag.

**Never parsed a note into a Temp.** Seven notes carry a second thermometer reading (07-10 `97.62`, 07-11 `98.02
(7am) after moving`, 07-17 `97.37 (4a)`, 08-12 `Spotting, 98.74`, 08-22 `97.59`, 08-24 `97.88`, 09-07 `97.8
(3am)`, 09-08 `97.89 (3:30)`). All stayed in the Note. The ca2 spec claimed cycle 5's second readings sat on days
7 and 8 with values 97.64 and 97.59; the sheet actually has 97.59 on day 9 and 97.88 on day 11, and no 97.64
anywhere. The rule holds regardless of which rows are misaligned.

**Free text mapped, wording preserved.** 13 cervix-texture and 16 cervical-mucus entries were free text. Each maps
to the new enum and the original wording is appended to the Note (`cervix: Harder, closer to opening`), so the
mapping is lossless and reversible. Mucus: Watery/Copius fluid to Watery; Sticky/Thick and sticky to Sticky; Thick
lotion/Clumpy lotion/Thick jelly mucus/Thick mucus to Creamy; every egg-white variant to Egg-white. Texture:
Squishy/Soft/Softer/Super soft/Very soft to soft; Getting firmer/Firm inside (soft outside) to medium; Harder,
closer to opening/Little harder and rubbery to firm.

**Outliers, decided with Mike.** (a) `Breasts = sore` recovered on ten rows 08-02..08-11 where he had logged the
symptom in the Note instead of the column. (b) `Cervix Position` filled only where the source names a position —
one row, 2026-04-13 `low`. Mike asked whether texture and position could be mapped to each other since they are
correlated; they are (soft/high/open/wet near ovulation, firm/low/closed/dry away from it) but the correlation is
a tendency, not a rule, and a position derived from texture is not an independent observation, so a later ca4 rule
reading both would count one data point twice. Left blank. (c) `Temp Quality` left blank on all 165 rows; 15 rows
have notes hinting off-time or disturbed readings and are listed in the tool's output for Mike to set by hand.

**Verification.** The tool verifies against the source and refuses to write if anything fails: every temperature
identical by date, every Day-1 date, every ovulation marker, every Exclude flag and every bleeding day present,
every source note contained in the migrated note, no duplicate dates, and no Temp cell that did not exist in the
source. 177 rows in, 165 out. Five Cycle Starts, five ovulation markers, 159 temps, three Excludes.

**Found in passing:** cycle 5 now carries an ovulation marker on day 23, 2026-09-05. Both ca1's verification and
the ca2 spec state that cycle 5 has none — Tirzah marked it some time after 2026-08-26. Recorded as an open
deviation because ca4's safety engine plans around the marker count.

**Handover.** Mike created the new sheet and pasted the 165 rows on 2026-09-13. Its ID is deliberately not
recorded here or anywhere else in the repo — ca3 decides where it lives, which will be the Apps Script, not
source. The app was not switched over and still reads the old sheet, exactly as ca2 requires. Nobody has yet read
the new sheet programmatically; ca3's first successful read is the real proof the paste is intact.

---

## ca3 — Apps Script proxy, two tokens, private sheet (2026-09-13)

**Shape of the change.** `Apps Script/Code.gs` is a `doGet` that compares `?t=` against a reader and a writer
token *before* it opens the sheet, then returns the rows as JSON, or as JSONP when a `callback` is asked for.
JSONP because the app must keep working from `file://` as well as GitHub Pages, and because it is the transport
the app already used against gviz — the smallest change that keeps both. Read only; there is no `doPost`, by
design, until ca5. The sheet ID and both tokens live in that file, which lives in the Apps Script editor; the copy
in this repo has them blanked, and `Apps Script/SETUP.md` is the by-hand sequence.

**The adapter.** The new sheet has no `Day` and no `Cycle`, and the app reads those two in about twenty places.
Rather than twenty edits in a transport slice, one adapter at the parse boundary (`index.html`, between the
`>>> ADAPTER` / `<<< ADAPTER` markers) synthesises both onto each row: `Day` by date arithmetic from the nearest
preceding `Cycle Start`, `Cycle` as `Ovulation` or `Blood` from the `Ovulation` and `Flow` columns. It also
restores the old display format for `Date` ("Mar 25" rather than "2026-03-25"), so no surface Tirzah sees changes
in this slice. Spotting is deliberately not `Blood`. A row marked both ovulation and bleeding resolves to
ovulation and logs a warning — dropping the manual marker silently would be the worse failure. ca4 deletes the
`Cycle` half of this when it rewrites those call sites against `Flow` and `Ovulation` directly.

**Found in passing — a real regression the slice spec did not list.** `calcCoverline` filtered excluded rows with
`Exclude.toUpperCase() !== 'Y'`, but ca2 writes `TRUE`, not `Y`. Switching transports would have silently pulled
excluded temperatures back into every coverline. Fixed at the call site rather than papered over in the adapter:
any non-empty `Exclude` now means excluded, which is true of both the old `Y` and the new `TRUE`. Grepped for
sibling cases of the same root cause — an enum whose spelling ca2 changed being compared to a literal — and
`Exclude` was the only one; `Day`, `Cycle`, `Flow` and `Ovulation` are all handled by the adapter.

**Failure paths, all visible.** No token, an unknown token, a revoked token, no `PROXY_URL` configured, a
network error, a sheet that will not open, a malformed response, and a request that simply never comes back
(a 20-second timeout, because JSONP reports nothing at all when that happens) each render their own message.
None of them retries silently and none leaves the spinner spinning.

**Token delivery.** `#t=...` on first open. The fragment never leaves the browser, so it stays out of server logs
and `Referer` headers. The app stores it, calls `navigator.storage.persist()`, and immediately rewrites the
address bar without it. If `localStorage` refuses the write the session still works and the user is told plainly,
rather than silently losing access at the next restart. `manifest.json` and `icon.svg` make Add to Home Screen
install cleanly; on Chrome/Android that is convenience, not load-bearing.

**Verification.** `Tools/adapter-selfcheck.js` runs offline and passes: gap days, a row before the first Cycle
Start, an unreadable date, spotting-is-not-blood, and a cycle spanning the 2026-11-01 DST change all come out
right. `Tools/verify-proxy.js` covers the rest of the exit criteria against the live deployment — the rejection
paths, both roles, that the new sheet refuses a logged-out fetch, that the ca2 paste is intact at 165 rows
2026-03-25..2026-09-11, and that the adapted rows still give 5 cycles, the five Day-1 dates and ovulation on days
16/18/23/31/23. Both tools extract the adapter out of `index.html` instead of copying it, so neither can drift
from what actually ships.

**Blocked.** The proxy cannot be deployed from here — it needs Mike in a browser, and both tokens and the new
sheet ID are deliberately absent from this repo. `verify-proxy.js` has therefore not been run, so the ca2 paste
is *still* unread programmatically and the exit criteria are not yet met. The old sheet is still public and must
stay that way until the proxy is confirmed; step 7 of `SETUP.md` is the last thing to happen, not the first.

**Verified 2026-09-13.** `Tools/verify-proxy.js` passes end to end against the live deployment. No token, an empty
token and a wrong token are each rejected with `no-access`; the reader token reads as `reader` and the writer as
`writer`; a logged-out fetch of the new sheet is refused with HTTP 401. The ca2 paste is confirmed intact on its
first programmatic read — 165 rows, 2026-03-25 to 2026-09-11, no duplicates, strictly ascending — and the adapted
rows reproduce the pre-switch dashboard exactly: 5 cycles, Day-1 dates Mar 25 / Apr 26 / May 25 / Jul 1 / Aug 14,
ovulation on days 16/18/23/31/23, no spotting row promoted to `Blood`, and cycle day 31 today from an Aug 14 start.

**Found in passing — Google's /exec redirect is flaky.** The first run failed three of five access checks with
HTTP 404, including a reader token that was in fact correct. Apps Script bounces `/exec` to a second Google host
and that hop intermittently drops back-to-back requests; the same URL succeeded twice in the same run. The tool
now retries a 404 or 5xx up to three times with a visible `retry` line and spaces the probes 400ms apart, so a
hiccup no longer reads as a failure while a genuine 404 still fails the run. Worth remembering for ca5: the write
path will hit the same redirect and needs the same treatment.

**Live test passed 2026-09-13** — but only after a deploy that never happened. Mike's first run of the four live
checks reported the token still sitting in the address bar and the dashboard loading in a fresh incognito profile
with no token at all. Both looked like ca3 bugs and neither was: `git status` showed **nine unpushed commits**.
The live site was still the pre-ca3 build, which reads the old sheet directly and needs no token — so every
symptom was the old app behaving exactly as designed.

**Root cause, and it was ours.** `deploy.bat` ran `git add -A`, and when nothing was staged it printed "Nothing to
deploy" and exited **0**. No edited files is not the same as nothing to deploy: work committed in an earlier
session sits unpushed and invisible. The script reported success while the site stayed stale — precisely the
silent background failure the global CLAUDE.md warns about, and the second time `deploy.bat` has produced one
(ca1 fixed a staging bug in the same file). Fixed at `05c3064`: the commit step is now the only conditional part
and `git push` always runs. Nine commits went out, and all four live checks then passed on the second attempt.

**Checkpoint review scheduled.** ca3 touched a shared helper (the adapter, which every reader of `Day` and `Cycle`
now routes through) and changed an invariant (`Exclude` is any non-empty value, not `'Y'`), so the README's
"shared helper or invariant" trigger fires regardless of diff size. `slice-ca3a-checkpoint-review.md` is written
and sits between ca3 and ca4. The marker stays at `1065c1e` — about 375 unreviewed app lines — until ca3a
advances it.

**Still open at handover:** whether the old sheet's public access has actually been revoked. It has been readable
by anyone holding the link since the first commit. ca3a re-checks it before anything else.

**Old sheet revoked and confirmed 2026-09-13.** Mike set the original sheet's General access to Restricted. Checked
anonymously against all three read routes — the `gviz` feed, the CSV export and the normal edit view — and each
returns HTTP 401. The sheet ID has been public in this repo since the first commit and is now inert. The sheet
itself is kept, private, as the keepsake. **ca3 is complete: every exit criterion is met.**

## ca3a — Checkpoint review of the ca3 range (2026-09-13/14, commit 3ee13e2)

Review only, no features. Range `1065c1e..HEAD`, Plan and Docs excluded: ~830 added lines, of which ~320 are app
or server code. Four defects found and fixed, eight findings deliberately left to the slices that own them.

**The one that mattered: two spellings for the same idea.** ca3's `Exclude` fix changed that column's test from
`!== 'Y'` to "any non-empty value", which is right — but nobody changed the other three yes/no columns to match.
`Cycle Start` and `Ovulation` were still compared with a strict `=== 'TRUE'`. Sheets flattens a ticked checkbox to
the boolean `true`, the proxy's `cell()` turns that into the string `'TRUE'`, and the comparison holds — so the
migrated data works and every fixture passes. The failure only appears when a human types the flag by hand.
`yes`, `Y`, `x`, `TRUE ` with a trailing space: each reads as *not set*, with no warning anywhere. A `Cycle Start`
that fails to register does not produce a visible error — it **merges two cycles**, which moves the cycle day,
which moves the safe/unsafe verdict. A wrong answer delivered confidently, from a typo, in the one part of this
app that has a real-world consequence.

Fixed at the parse boundary rather than at three call sites: one `flag()` helper in the adapter normalises
`Cycle Start`, `Ovulation` and `Exclude`, accepts `TRUE/YES/Y/X/1` case-insensitively, and `console.warn`s by date
and column name on anything else non-empty rather than swallowing it. Downstream readers are untouched — the
helper emits `'TRUE'` or `''`, which is exactly what they already expect.

**`hasData` had drifted out of schema.** It still listed only old-schema columns, so a row carrying nothing but
`Flow`, `Temp Quality`, `Exclude`, `Cervix Position` or `Cycle Start` read as an *empty* row — and `detectPhase`,
`lastDataIndex` and the log table's `row-empty` class all trust it. Inert today, because ca2 dropped every
contentless row on migration, so no such row currently exists. It becomes live the moment ca5 can write one: a
spotting-only day, or a reading marked off-time and excluded, would be entered and then vanish. Made
schema-complete rather than deleted, because ca4 is about to rewrite its three callers anyway — the decision to
delete it belongs there, and is written into that slice.

**Two smaller ones.** The log table rendered a `Time` column that the ca2 schema does not have, blank on all 165
rows — removed. `Code.gs` called `SpreadsheetApp.openById` twice per request, the second time only to read the
spreadsheet's timezone — now one open, passed through.

**Checked and clean.** The adapter's DST arithmetic (both ends normalised to local midnight, `Math.round` on the
difference — Nov 5→7 across the change yields days 1/2/3); rows before the first `Cycle Start` (no day number,
filtered out, as before); spotting never promoted to `Blood`; the six temp-less rows; the 29 rows whose original
wording was folded into `Note`. In `Code.gs`: the token check does run before any sheet access, and blank token
constants cannot be matched by a blank `t=` parameter because the truthiness test short-circuits first — the
`not-configured` branch is unreachable for tokens but still catches a blank `SHEET_ID`. Every client failure path
was walked rather than trusted: missing proxy URL, missing token, `no-access`, network error, 20s JSONP timeout,
malformed response and empty cycle list each produce a distinct visible message.

**`adapter-selfcheck.js` extended** to cover the hand-typed spellings and a junk value (`Cycle Start: "maybe"`
warns and reads as unset). Passes. `verify-proxy.js` needs the live `/exec` URL and both tokens, which are
deliberately absent from this public repo, so Mike re-runs it before ca4.

**Eight findings pushed into the slices that own them**, per the README's discipline — not appended to STATE and
not bolted onto this slice. ca4: the pre-ovulation `Safe` branch is unreachable dead code (`ovDay` only exists
after ovulation has passed, so `dayNumber < ovDay - 6` can never be true on a live cycle — harmless, it fails
closed, but it makes the rule look like it has an early window it does not have); `Exclude` reaches only the
coverline, so an excluded reading still plots on both charts and can still be the "Last Temp" card; `hasData`'s
future; and the removal of the adapter's `Cycle` half. ca5: four ca2 columns missing from the log table. ca7: the
dropped-row and bad-flag warnings are `console.warn` only, invisible on a phone, and ca7 owns the banner.

**Marker advanced** from `1065c1e` to this slice's commit, tally reset to zero. Mike's live test passed
2026-09-14 — dashboard unchanged, as a review slice should leave it.

**`verify-proxy.js` re-run and passing, 2026-09-14.** Mike ran it against the live deployment after ca3a changed
the adapter — the one check that exercises the real 165 rows, and the only ca3a exit criterion that could not be
met from here. All checks pass, so the `flag()` normalisation and the `hasData` change are confirmed against real
data and not just fixtures. **ca3a is complete: every exit criterion is met, and no deviation is open.**

---

## ca2a — recovering the Time column (2026-09-14)

**How it surfaced.** Mike asked why the Time column had disappeared from the table. ca3a had deleted it as dead
markup, on the strength of one sentence in this log. The sentence was wrong. There was no code behind it.

**What was actually lost.** Mike exported the original tracker to `.xlsx` and the real column read back as 88
times across 177 rows — 48 at 5am, 36 at 6am, 4 outliers at 3-4am. Replaying ca2's placeholder-drop rule against
that export reproduces the migration exactly, 165 kept and 12 dropped, and **none of the 12 dropped rows carried a
time**, so every one of the 88 is recoverable by date. The full column-by-column audit of the export against the
new schema found `Time` to be the only loss: Temp, Cervix Texture, Cervical Mucus, Breasts, Exclude, Cycle and
Note all came across, with zero unmapped enum values in any of the three mapped columns. The `Backend` tab is
derived (81 temp cells, every one present in `Data`) and stale at three cycles — not a source of anything.

**Why one bug and not three.** The interesting failure is not the omission, it is that nothing could see it.
`verify()` compared temperatures, Day-1 dates, ovulation markers, Exclude flags, bleeding days and notes — six
columns that all exist on both sides. A source column with no destination is outside the frame of every one of
those comparisons, so the script honestly reported OK. The migration was allowlist-shaped with nothing watching
the other side of the allowlist, which means `Time` was never the only column at risk; it was just the only one
that happened to be populated.

**Fixes.**
- `migrate-sheet.js` carries `Time` (new `fmtTime` handles gviz's `[h,m,s,ms]` and plain text alike), and
  `SOURCE_COLS` now names every column the source is allowed to have. `verify()` refuses to write if the sheet
  carries a column not on that list — empty or not, because an empty column today is a filled one tomorrow.
- The placeholder-drop rule now counts `Time` as content. Before, a row logged with nothing but a time would have
  been dropped as blank — a second instance of the same root cause, latent rather than fired.
- `Tools/migrate-selfcheck.js` is new and pins all of the above without needing the network or the old sheet.
- `Code.gs`: Sheets stores a time-of-day cell as a Date on its 1899-12-30 epoch day, and `cell()` formatted every
  Date as `yyyy-MM-dd`. Pasting the recovered column would have turned all 88 times into "1899-12-30" — the
  identical failure mode, one layer down, found by looking rather than by it going wrong.
- `index.html`: the Time column is restored to the table, and `hasData()` counts it.
- `verify-proxy.js` asserts 88 rows carry a time and that none arrives shaped like a date.

**Not done here.** The recovered values still have to be pasted into the sheet by hand: the proxy is read-only by
design and the old sheet stays Restricted, since its ID has been public since the first commit. Aligned file
written outside the repo for Mike to paste.

**Process note.** ca3a deleted a column because this log said it was empty. The log said it was empty because ca2
assumed it. Nothing verified it at either step. A claim about data that no check produced does not belong in this
log stated as fact.

**Closed 2026-09-14.** Mike pasted the 165-row column, redeployed the Apps Script, and `verify-proxy` passes every
check including the two new ones: 88 rows carry a time, and none arrives shaped like a date. The `Time` column is
back on the live dashboard with its real values. ca5 is unblocked.

---

## ca3b — checkpoint review of `3ee13e2..HEAD` (ca2a), 2026-09-14

Not triggered by size (137 lines) but by blast radius: ca2a added a branch to `cell()` in `Code.gs`, the single
point every cell of every column passes through on read. Five targets, all resolved. Every claim below is either
a statement about code in this repo or a check that now runs; nothing here asserts anything about the sheet's
contents that was not measured. That is the rule ca2 broke.

**1. `cell()`'s 1900 cutoff — fixed by removing the guess.** The branch read a Date's year and called anything
before 1900 a time-of-day. That is a rule about *values* applied to *every column at once*: any cell Sheets
happens to auto-type as a date — a `Note` that reads like one, a stray typed time — would be silently reformatted
by a rule only ever meant for `Time`. Rather than try to prove the negative about data behind a private sheet,
`cell()` now takes the column name and formats as a time only for columns in `TIME_COLS` (`['Time']`). The
heuristic is gone, so there is nothing left to be wrong about. A genuine pre-1900 date in `Date` would also now
survive.

*Timezone.* `getValues()` converts a sheet cell to a Date through the **spreadsheet's** timezone and
`Utilities.formatDate(v, tz, …)` renders it back through the same one, so the round trip cancels and 6:32 AM
cannot arrive as 5:32 AM — **while the two agree**. The failure case is `Code.gs`'s `|| 'Etc/GMT'` fallback: if
the sheet ever reports no timezone, every time shifts by hours in silence. `doGet` now returns `tz` in the
payload and `verify-proxy` fails on a missing one or on the bare fallback.

**2. `fmtTime` vs `cell()` — they agree; now bound rather than asserted.** `fmtTime` emits `h:mm AM` (`12:07 AM`
at midnight, `12:00 PM` at noon, minutes zero-padded, hours not); Apps Script's `h:mm a` produces the identical
shape. Reasoned, not executable from here — so `verify-proxy` now fails any live row whose `Time` does not match
`h:mm AM/PM`, which makes the agreement a check instead of a claim.

**3. `SOURCE_COLS` — the gate had exactly the hole the slice suspected.** It was a `Set`, so adding a name
silenced it with no destination required, which is a passing check sitting on top of the original bug. It is now
a **map from source column to destination**, and `verify()` checks both halves: an unlisted column still stops
the migration, and a listed column that carries values whose destination came out empty on every row stops it
too. That second check *is* the ca2 bug, reproduced as a test in `migrate-selfcheck`. A destination outside
`NEW_COLS` fails as a typo. `Day` is now honestly documented as landing in `Cycle Start`, not as "not stored".

**4. `hasData` vs `NEW_COLS` vs the placeholder rule — bound, and one latent loss fixed.** `hasData` reached
`Ovulation` only through the adapter's synthesised `r.Cycle`, and ca4 is scheduled to delete that synthesis —
which would have quietly dropped ovulation-only days out of `detectPhase` and rendered them as blank rows.
`hasData` now names `r.Ovulation` directly. `adapter-selfcheck` asserts `hasData` mentions every `NEW_COLS`
column except `Date`, so the two lists can no longer drift. The migration's placeholder test enumerates *source*
columns, not new ones; it stays separate, and `verify()`'s existing Day-1 / ovulation / Exclude comparisons
already fail loudly if it ever drops a real row.

**5. `verify-proxy`'s hardcoded counts — now floors.** `times: 88`, `rows: 165` and `last: '2026-09-11'` were all
equalities, and all three would have started failing on Mike's first ca5 entry. A safety check that cries wolf is
worse than no check, so row count, time count and last date are floors; `first` and the completed-cycle facts
stay exact, because nothing may rewrite history.

**Checks.** `adapter-selfcheck` and `migrate-selfcheck` pass, including three new negative cases proving the new
guards actually fail when they should. `verify-proxy` needs the live proxy and Mike's tokens.

**Requires a redeploy.** `cell()` changed signature and `doGet` now returns `tz`; the Apps Script must be
redeployed before `verify-proxy` will pass the timezone check.

**Closed 2026-09-14.** `verify-proxy` passes every check against the live proxy, sheet ID included. Three
redeploy attempts were needed and each failure was a configuration trap rather than a code defect — worth
recording, because all three are repeatable:

1. *Redeployed without taking effect.* `tz` came back `undefined`, i.e. the key was absent, i.e. old code. The
   distinction between a missing `tz` and the `Etc/GMT` fallback is what made this readable at a glance.
2. *The paste wiped the secrets.* The repo's `Code.gs` is a template with `SHEET_ID` and both tokens blanked, so
   pasting it over the editor blanked the live ones — and with blank tokens every request failed the role check
   and reported `no-access`, pointing at a token problem that did not exist. **Fixed:** the config check now runs
   before the token check, `verify-proxy` names the cause, and `SETUP.md` warns that re-entering the three
   constants is part of every paste.
3. *A new deployment instead of a new version.* The `/exec` URL changed, which meant `index.html`'s `PROXY_URL`
   was left pointing at an older deployment still serving live traffic on valid tokens. `PROXY_URL` now points at
   the verified deployment; **archive the old one in Manage deployments** so it cannot drift again.

The one code change to come out of this: `doGet` reports `not-configured` before `no-access`. Saying "this
deployment is not set up" leaks nothing and is the difference between a five-minute fix and an hour of hunting a
token that was never wrong.

### ca3b live deployment — the evening the app would not load (2026-09-14)

The code work of ca3b was committed and correct. Getting it *live* cost four separate traps, three of them in the
Apps Script deploy flow and one in the browser. All four are now guarded somewhere runnable; none of them were
visible from the repo.

**Trap 1 — saving the editor deploys nothing.** `verify-proxy` reported `sheet timezone is undefined`. An *absent*
`tz` key means old code is still serving; the new code with a bad timezone would have reported `"Etc/GMT"`. The
distinction is what made the diagnosis fast, and it is why the assertion checks for the key's presence rather than
its plausibility. Fix: Deploy → Manage deployments → edit → New version.

**Trap 2 — the paste wiped the secrets.** Both valid tokens came back `{"ok":false,"error":"no-access"}`. The
repo's `Code.gs` is a template with `SHEET_ID`, `READER_TOKEN` and `WRITER_TOKEN` blanked, so pasting it over the
editor blanks the live ones — and with blank tokens *every* request fails the role check, which reports a token
problem that does not exist. Fixed in code: `not-configured` is now checked **before** the token check
(`d9d5eca`), `verify-proxy` names the cause by name, and `Apps Script/SETUP.md` warns that re-entering the three
secrets is part of every paste.

**Trap 3 — "New deployment" is not "New version".** `read-failed: Illegal spreadsheet id or key:
d/1yXLmWP…` looked like a pasted URL slice, and Mike correctly pushed back that it was not. The tell was in the
error report itself: the `/exec` URL had *changed* between runs (`AKfycbyV6…` → `AKfycbxm…`). He had created a new
deployment rather than a new version of the existing one, and a deployment snapshots the last **saved** editor
state — so the half-finished edit went live. The knock-on: `index.html` was still pointing at the older
deployment, which was still happily serving valid tokens, so nothing looked broken. `24f6067` moved `PROXY_URL` to
the verified deployment.

**Trap 4 — the app would not load, and the error message lied.** With the proxy verified healthy (Mike's
address-bar fetch returned `ok:true`, `tz:"America/Los_Angeles"`, all 13 columns, 165 rows, times reading
`6:32 AM`) and the push confirmed landed, the phone still showed *"server did not respond — it may be over its
daily quota"*. That is the 20s `_loadTimer` in `loadData()`, not a quota. Root cause: a cached `index.html` still
pointing at the by-then-archived deployment. An archived `/exec` returns Google's **HTML error page with HTTP
200**, so the `<script>` tag loads successfully, `onerror` never fires, the page simply fails to parse as JS,
`_sheetCallback` never runs, and the only signal left is the timeout. A private-tab load confirmed it — the app
came up immediately. `?v=2` had not helped because `manifest.json` declares `"start_url": "."` with
`"display": "standalone"`: the home-screen icon opens its own cached entry point and never sees a typed query.

Both of trap 4's underlying defects — a message asserting a cause it cannot know, and a `PROXY_URL` change able to
strand every cached viewer — are pushed onto `slice-ca7-viewer-staleness.md`, which owns the cache. **ca7 is
pulled forward ahead of ca4** under the clause in its own Dependencies section.

The lesson worth keeping: *the honest failure and the dishonest one look identical on the phone.* A timeout knows
only that nothing came back. Naming a cause it has not observed does not help the user and actively misdirects the
person debugging it.

## ca7 — viewer cache, staleness banner, 3-day expiry (2026-09-14)

Pulled forward ahead of ca4 by ca3b's deploy night. The slice as written was about Tirzah opening the app on a
train; what it actually had to absorb was trap 4 from the night before, where a *silent* failure drew an error
screen that named a cause nobody had observed.

**What the viewer now sees.** Every successful read is saved to `localStorage.cycleCache` as
`{proxy, at, cols, rows}`. Any failure — `onerror`, the 20s timeout, or a payload that will not render — falls back
to that copy and draws the real dashboard with a dismissible banner naming the date the data was saved. Past three
days the safety card itself is replaced: `Safe`/`Unsafe` becomes **Out of date**, hint *"Saved data from <date> —
too old to judge."* The override sits after the Safe/Unsafe branch and never reads the dismiss flag, so closing the
banner cannot restore a verdict; dismissal is in-memory only, so a reload brings it back. `Tools/staleness-selfcheck.js`
binds all of that, plus the exact cutoff, by extracting the `// >>> STALENESS` block from `index.html`.

**Staleness is measured from the last successful read, never from a failure.** Google's `/exec` redirect
intermittently 404s. If one failed fetch could age the data, the banner would cry stale on a perfectly current
sheet, and Tirzah would learn to ignore it.

**The cache refuses to outlive a redeploy.** `cacheIsUsable()` requires `c.proxy === PROXY_URL`. That is the direct
answer to trap 4: a viewer holding a cached page for an archived deployment must not also be shown data that page
saved, sitting there looking live.

**The timeout stopped lying, and now tries to fix itself.** The quota sentence is gone — a timeout knows only that
nothing came back. On a *first* load (`_loadedOk` false), once per tab (`sessionStorage.cycleSelfRefreshed`), the
page now does `location.replace(location.pathname + '?v=' + Date.now())` to pull a fresh `index.html` past the
browser cache. It has to happen from inside the page because `manifest.json` sets `"start_url": "."` — a `?v=`
typed in the address bar never reaches the installed icon. No service worker was added, deliberately: the whole
class of bug came from a stale cached entry point, and a service worker is a bigger, stickier version of exactly
that. Offline with no saved copy, the reload fires once and then the error message stands.

**ca3a's data warnings finally became visible.** `warn()` inside the adapter collects the dropped-row and
unreadable-yes/no messages into `_dataWarnings`, and they render as lines in the same banner instead of living only
in a console nobody opens on a phone. `bannerHTML(staleInfo, warnings, dismissed, now)` takes all of its state as
arguments purely so the self-check can exercise it with no DOM — that is why it looks over-parameterised for a
function with one caller. All lines are HTML-escaped; they carry sheet text.

**Two things the quota handler must not do.** `writeCache` on a storage failure removes `cycleCache` alone, never
`localStorage.clear()` — the access token shares that storage and losing it locks the user out with no way back.
And the success path renders *before* it caches, so a payload that throws cannot overwrite a good saved copy and
break the offline path too.

**Self-review caught one.** `_loadedOk = true` was originally set after `renderPayload()`, so a render failure left
it false and a later timeout would have been free to yank the page out from under a server that had demonstrably
answered. Moved ahead of the render: a valid reply proves `PROXY_URL` is live, whatever the rows then do.

**ca7a queued.** README step 6 triggered on its *second* condition — not size (~240 lines, nowhere near 1,500) but
*a shared helper and a safety invariant were touched*: `warn()` sits inside the `// >>> ADAPTER` markers ca4 will
edit, the safety card gained a third outcome ca4 will rewrite, and the entire read path ca5/ca6 build beside was
replaced. The stub is explicitly marked skippable at Mike's discretion; if skipped, ca7's lines carry into ca8.

Outstanding and not verifiable from here: Tirzah's live check — aeroplane mode, confirm the banner and its named
date, dismiss it, reload, confirm it is back.

## ca7a — checkpoint review of `24f6067..HEAD` (ca7), 2026-09-15

Reviewed ca7's 242 changed `index.html` lines plus `Tools/staleness-selfcheck.js` against the six targets in the
slice. Three defects found and fixed; three targets confirmed clean by reading, not by trusting the self-check.

**Target 1 — the expiry override holds.** `render()` sets `safeStatus` in the Safe/Unsafe branch, then the
`_staleInfo && cacheExpired(...)` block overwrites it unconditionally, and `statsHTML` is built immediately after
with nothing in between that can touch it. `_staleInfo` is set in `failLoad()` *before* `renderPayload()`, so
there is no path that draws a cached dashboard without it set. No path can show `Safe` on a cache older than three
days. The override never reads `_bannerDismissed`. Clean.

**Target 2 — `failLoad()` cannot show a cache to someone who should see a message.** Code.gs emits exactly five
error strings: `not-configured`, `no-access`, `sheet-missing: <name>`, `sheet-missing-Date-column` and
`read-failed: <msg>`. The first two are access-shaped and both return before the fallback; a missing `TOKEN` and a
missing `PROXY_URL` return before the fetch is even made. The remaining three are data-availability failures, not
viewer-access failures — the viewer's link is still good and the data genuinely has not changed, so falling back
to the cache with a dated banner is the honest answer there. A revoked *token* always lands on `no-access`,
because the role check is a string comparison against constants that no longer match. Clean, with one caveat
worth knowing: if Mike's own access to the sheet is revoked, the proxy answers `read-failed:` and Tirzah sees a
stale dashboard with the banner rather than a message. That is correct behaviour for her — she has lost nothing —
but it means a sheet-permission problem is visible only in the banner's date, not as an error.

**Target 3 — the self-reload, one real defect.** The offline case is fine: in aeroplane mode the script tag's
`onerror` fires immediately, so `failLoad()` runs and `selfRefresh()` is never reached — it hangs off the 20s
timeout alone. The `sessionStorage` guard survives `location.replace` in the same tab, so it cannot loop.

The `#t=` fragment, though, was a genuine lockout. `bootstrapToken()` calls `history.replaceState` to strip the
fragment **whether or not the `localStorage.setItem` succeeded**. In private mode or with storage blocked, the
token then exists only in the `TOKEN` const — and a self-reload 20 seconds later throws it away and lands the
user on "No access" with no link left to reopen. Fixed by tracking `_tokenPersisted` (set when the token is
written, and when one is read back from storage) and refusing to self-refresh without it: a stuck spinner they
can retry beats an automatic lockout.

Note the pre-existing half of this that ca7a did **not** change: the same strip means a *manual* reload in
private mode also strands the user. That is ca3 behaviour, not ca7's, and fixing it means either keeping the
token in the address bar — where a screenshot leaks it — or leaving it. Recorded in STATE as an open deviation
for Mike to rule on rather than decided here.

**Target 4 — the cache cannot take the token with it, but a full store could.** `localStorage.clear()` appears
nowhere; `writeCache`'s quota handler removes `CACHE_KEY` alone. But the inverse was unguarded: the display cache
is the only large thing this app stores, so a full store means `localStorage.setItem(TOKEN_KEY, ...)` in
`bootstrapToken()` throws — and nothing dropped the cache to make room. A new access link could not be saved, and
the user was told, permanently, that the app would ask for the link again every time. Fixed: on a token-write
failure, remove `CACHE_KEY` and retry once. Losing the offline copy beats losing access; the alert now fires only
when both attempts fail.

**Target 5 — `renderPayload()` is the only caller of `render()`.** Grepped: one definition at `render(cycles)`,
one call inside `renderPayload()`, and one unrelated `loadData()` in the Refresh button's `onclick`. The cached
view and the live view cannot drift. Clean.

**Target 6 — `warn()` was unbounded.** `_dataWarnings` is cleared at the top of `renderPayload()` before
`adaptRows()` runs, so it cannot accumulate across the 10-minute refresh — that half was right. But one malformed
column warns once per row, so a 165-row sheet produced a 165-line banner burying the dashboard underneath it.
Capped at `MAX_BANNER_WARNINGS = 4` plus an "…and N more problems in the sheet like these." line. The cap is in
`bannerHTML` rather than in `warn()`, so the console still receives every one of them.

**Checks added.** Six new assertions in `staleness-selfcheck.js`: 165 warnings render as 5 lines and name the
count, a short list gets no "more" line, `selfRefresh` mentions `_tokenPersisted`, `bootstrapToken` drops
`CACHE_KEY` before retrying the token write, and `localStorage.clear(` appears nowhere in the file. The last
three are greps over source text, which is weaker than executing it — but the functions they guard touch
`localStorage`, `sessionStorage` and `location`, none of which exist in the self-check's `new Function` sandbox.
A grep that pins the *shape* of the guard is what is available; ca8 should re-read them rather than trust them.

`staleness-selfcheck`, `adapter-selfcheck` and `migrate-selfcheck` all PASS. No browser verification — Mike's.

### ca7a addendum — Mike ruled the screenshot leak acceptable (2026-09-15)

The open deviation ca7a left for Mike is closed: **keep the token in the address bar when the browser will not
save it.** An app that cannot be reopened is worse than a URL visible in a screenshot, and the fragment is never
sent to a server in either case — the leak is a shoulder-surf/screenshot risk only, not a network one.

That makes the real fix the one ca7a deliberately did not make, and it replaces the `_tokenPersisted` gate on
`selfRefresh()` rather than adding to it:

- `bootstrapToken()`'s `history.replaceState` scrub is now **conditional on `_tokenPersisted`**. When the write
  stuck, the fragment is scrubbed exactly as before — the common path is unchanged. When it did not, the fragment
  stays, because it is the only copy of the token left.
- `selfRefresh()` carries `location.hash` through `location.replace`, so the self-reload cannot be the thing that
  drops it. When the token was saved the hash is empty and this appends nothing.
- The `_tokenPersisted` guard inside `selfRefresh()` is **removed**. It existed only because a reload lost the
  token; now that a reload preserves it, keeping the guard would mean two mechanisms for one invariant and would
  needlessly deny the private-mode user the recovery reload. `_tokenPersisted` survives as the scrub condition,
  which is its real job.
- The alert wording changed with it. "It will ask for the link again next time you open the app" was true under
  the old behaviour and is now wrong — it now tells the user to keep the page's web address, which is actionable.

Both halves are pinned in `staleness-selfcheck.js`, because either one alone still locks the user out: the scrub
must be conditional, **and** the reload must carry the fragment. The first version of the reload assertion used
`[^)]*`, which `Date.now()`'s own `)` terminated early — it failed loudly against correct code rather than
passing against broken code, which is the right way round, but worth noting for whoever edits these greps next.

All three self-checks PASS. Unverified in a browser — Mike's, and this one is worth a private-window test: open
the link, confirm the address bar still shows `#t=`, reload, confirm the app still opens.

**Confirmed live by Mike, 2026-09-15.** Private window: the link opens, `#t=` stays in the address bar, and a
reload still opens the app. The path the addendum was written for works end to end.

**Stubs amended in the same session** (README step 3), because ca7a changed facts they assert:
`slice-ca4` — the warning banner is now capped at 4, so any warning ca4 adds competes for those slots.
`slice-ca5` — "the token lives in `localStorage`" is no longer always true; read `TOKEN`, never the key directly,
or the write path breaks for exactly the users whose read path still works.
`slice-ca6` — a queue message pushed onto `_dataWarnings` can now be truncated away behind four bad rows, which is
the silent failure that slice exists to prevent. It needs its own argument or an exemption from the cap.

That last one is the ca7a finding most likely to bite: the cap was the right fix for a 165-line banner and is a
trap for the next slice that reuses the list. Capping a display list is not the same decision as capping a
*notification* list, and ca6 is about notifications.


## ca4 — the safety engine (2026-09-15)

The dashboard's safe-window arithmetic was a handful of inline expressions inside `render()`. It is now one
marked block, `// >>> SAFETY` ... `// <<< SAFETY`, extracted and executed verbatim by `Tools/safety-selfcheck.js`
and `Tools/verify-proxy.js` — the same technique ca3 used for the adapter and ca7 for staleness, so the checks
cannot drift from the code the phone runs.

**The rule, as shipped:** the opening bleed run (Day 1 through the last *consecutive* bleeding day) is Safe;
everything after it is Unsafe until the post-ovulation window opens; the window opens on the **later** of the
manual ovulation marker + 4 and the three-over-six fire day. **No marker means it never opens** — three-over-six
may only delay an opening, never trigger one. Two states only, Unsafe absorbing every unknown.

**Integer hundredths, everywhere.** `97.88 + 0.1` is `97.97999999999999` in floating point, so a reading of
exactly 97.98 tested as *above* a coverline it actually ties. That is what opened cycle 4's window on day 36
instead of 37 — a day early, on the unsafe side. Every temperature comparison now runs through
`cents(t) = Math.round(parseFloat(t) * 100)`, and `safety-selfcheck` pins the tie case specifically.

**Three-over-six's baseline must not overlap its own highs.** The prototype drew the coverline from the six temps
before the *third* high, which meant the highs lifted their own line and the rule could never fire. The baseline
is now the six usable temps before the **first** high. Temp-less rows (6 of the 165 migrated) and `Exclude` rows
are skipped rather than read as zeros, so neither can be counted towards the six or the three.

**The `Cycle` column is gone.** ca3 synthesised `r.Cycle` at the parse boundary so ca3 could stay a transport
change; ca4 deleted it and rewrote every reader — timeline chart, tooltips, log table, overlay chart — against
`isOv()` / `isBleeding()` / `phaseTag()`. With it went the adapter's Ovulation-and-bleeding collision warning
(`phaseTag` resolves the collision the same way, in display code where it belongs) and with it any chance of a
display string and a safety rule disagreeing about what a day was. `adapter-selfcheck`'s tuple now asserts
`Flow`/`Ovulation` directly instead of the synthesised value.

**Carried over deliberately as a deletion:** ca1's pre-ovulation `dayNumber < ovDay - 6` safe branch. It could
never fire on a live cycle — the marker only exists once ovulation has already passed — so shipping it would
make the app look like it has a window it does not have. Noted in a comment at `safetyVerdict` so it does not get
"restored" later.

**Two questions settled from ca3a:** an `Exclude`d reading still shows as Last Temp (it was taken) but gets no
above/below-coverline verdict, because Exclude means exactly "do not judge by this one"; and `hasData` survived,
minus its `r.Cycle` term.

**The missed-Day-1 guard was specified and then reversed, in the same session.** The spec called for a status
line reading "Period may have started — log to confirm" at cycle day >= 29 with unlogged days outstanding. Mike
killed it on sight: cycles here often run to 37 days, so it would have fired most cycles and trained both readers
to ignore the status line — the exact failure mode a warning exists to avoid. What survives is the unlogged-days
count on the Cycle Day card in `status-caution` orange, which states a fact without guessing at a cause.
`safety-selfcheck` now *fails* if either the wording or the `dayNumber >= 29` threshold reappears, and the
slice file records the reversal so a later session does not "fix" the omission.

**Verification.** `Tools/safety-selfcheck.js` is new and offline: opening-run edges (spotting is not bleeding, a
missing day ends the run, mid-cycle breakthrough bleeding stays Unsafe), the coverline tie, a third high 0.19
above the line, baseline/high non-overlap, temp-less and excluded rows, a cycle with its marker stripped, and the
phase vocabulary (it greps `phaseLabel` for the absence of "Ovulation"). `verify-proxy` runs the same engine
against the real sheet and asserts every cycle's opening — **d24 / d22 / d30 / d37 / d27, confirmed by Mike on
2026-09-15** — plus a marker-stripped pass in which no cycle may open a window at all. All three self-checks PASS.

---

## ca4a — checkpoint review of `4050005..HEAD` (2026-09-15)

**ca4 shipped a dashboard that could not draw a single pixel, and every check said PASS.** ca4 replaced the
inline safe-sex arithmetic in `render()` with `safetyVerdict()`, and the deleted lines included
`const ovDay = ovDayNum;`. Eighty lines further down, the Cycle History table's current-cycle row still read
`ovDay`. An undeclared identifier inside a template literal is a `ReferenceError`, thrown while building the
string — so `render()` died before it ever assigned `#app.innerHTML`, on every load where the current cycle has
any logged data. That is every load. One word: `ovDayNum`.

**Why nothing caught it.** The three self-checks each extract one marked block — `ADAPTER`, `STALENESS`,
`SAFETY` — and execute it in isolation. `render()` is in none of them; the checks that touch it do so as *string
greps* against the file, which a `ReferenceError` cannot fail. The marked-block discipline that made the safety
engine trustworthy is precisely what left the largest function in the app unexecuted. ca4 was also never opened
in a browser (its slice file says "phone check outstanding"), so a green board and no browser pass covered a
total failure.

**`Tools/render-selfcheck.js`** closes that. Rather than mark a fourth block, it loads the **whole page script**
between the `<script>` tags under stub browser globals — `document` (a single shared element whose `innerHTML`
the check reads back), in-memory `localStorage`/`sessionStorage`, an inert `location`/`history`, a `Chart` class
with `destroy`/`update`/`getDatasetMeta`, and no-op timers so the page's 10-minute refresh cannot hold the
process open. Two date-anchored fixtures go through `renderPayload()`, the one entry point the live and cached
paths share: a two-cycle history with an ovulation marker and a three-day unlogged gap, and the same data with
the marker removed. It asserts that render runs clean and that the safety card, both tables, the current-cycle
row, the unlogged count and the ovulation cell are all present — not what any of it looks like, which stays
Mike's job. Mutation-tested: putting `ovDay` back turns 10 assertions red.

**The Ovulation-and-bleeding warning is back.** ca4 deleted it with the `Cycle` column, on the reasoning recorded
above — that `phaseTag` resolves the collision in display code where it belongs. That reasoning was half right
and the wrong half mattered: `phaseTag` resolves the *display*, but `isOv` and `isBleeding` now read the two
columns independently, so a day marked both silently anchors the safe window **and** counts in the opening bleed
run while showing only "Ovulation" in the log. Deleting the synthesis removed the place the collision was
visible, not the collision. It warns again from `adaptRows`, reworded from "it was read as Ovulation" to "it
counts as both", and reaches Tirzah through ca7's banner.

**Everything else in the range held up.** All ~20 rewritten `r.Cycle` readers are equivalent to ca3's synthesis
(verified against `git show e569994^`; `isBleeding`'s trim-and-lower-case is strictly more permissive and
identical on the real data). The safety engine's boundaries are correct at every edge the slice named. An empty
`cycles` array cannot reach `render()` — `renderPayload` throws first. The `render()`-body regex both checks rely
on does capture the whole function (11,447 characters), so those greps are real, not vacuous. ca7a's three fixes
are all correct as written. Full target-by-target notes live in `Plan/cycle-app/slice-ca4a-checkpoint-review.md`.

**Verification.** `adapter`, `staleness`, `safety` and the new `render` self-check all PASS. `verify-proxy` needs
a token and was not re-run; nothing in this slice touched the SAFETY or ADAPTER blocks' logic. Pushed as `5d08ce9`.

**Postscript — the bug never reached the phone.** The live site had been on ca3 (`24f6067`) since 2026-09-13;
ca7, ca7a and ca4 were all sitting unpushed. Mike's phone was showing a working ca3 dashboard the entire time ca4
was broken, which is why nothing looked wrong. The push took Pages from ca3 to ca4a in one jump — cache, staleness
banner and safety engine all arriving together — and Mike confirmed all of it live on 2026-09-15. Worth remembering
at the next checkpoint: "it works on my phone" says nothing about `HEAD` unless someone checks what is deployed.

## ca5 — the catch-up entry form, and the first write (2026-09-15, commits dc559d3, 8446122, db5a8ee)

**What shipped.** The app can now write to the sheet. `doPost` in `Apps Script/Code.gs` is the only writer: it
checks `body.t` against `WRITER_TOKEN` **server-side** (the hidden Log tab is cosmetic; this is the part that
holds), takes a `LockService` script lock, and read-patch-writes one dated row — the named columns change, every
column the form never mentioned survives untouched, including the `cervix: …` text ca2 folded into the Note. A
date with no matching row is inserted **before the first later-dated row**, not appended, because the read path
assumes strictly ascending dates. `render()` gained a second exit for `_tab === 'log' && _role === 'writer'`,
which destroys both charts rather than leaving them pointing at a canvas no longer in the page. The log table
gained the four columns ca3a said made an entry look dropped: Flow, Position, Quality, Exclude.

**Proved live, not just offline.** `Tools/verify-proxy.js` grew a write section that runs last, against a
sentinel date (`2026-03-24`) that precedes every migrated row and every Cycle Start, so the adapter gives it no
Day number and it cannot reach a cycle, a count or a verdict. It confirmed on the real sheet: the reader token
is refused (`read-only`), a wrong token and no token are refused (`no-access`), a malformed date / an unknown
column / `Date` sent as a value are all refused before anything is written, the backdated row lands in date
order, a **second** write to the same date `updated` rather than duplicating — which is what makes the app's
retry safe after Google's `/exec` redirect 404s — untouched columns survived, and the sentinel was deleted and
the row count restored. All checks passed. ca5's stated first unknown, whether a POST from GitHub Pages can
reach Apps Script at all, is answered: yes, with `Content-Type: text/plain;charset=utf-8`, which keeps it a
CORS *simple request*. Apps Script cannot answer a preflight, so this is not a style choice.

**Then Mike used it, and it lied to him.** A save reached the sheet and the screen said
*"could not reach the sheet. Showing saved data from Sep 15, 2026 10:33 AM."* Root cause: `saveEntry` clears
`_openDate`, shows "Saved. Reloading…", and calls `loadData()`. When that reload fails, `failLoad` re-renders
from the **cache** — which wipes the save status and shows rows that predate the write. A write that reached the
sheet was pixel-for-pixel identical to one that did not. Fixed with `_savedNote`, a green line above the form
that survives the re-render, names the day and the action, and when `_staleInfo` is set says so out loud: *the
sheet could not be re-read afterwards, so the list below is older than your entry.* The Apps Script Executions
log settled the diagnosis: `doPost` 10:34:37 (1.902 s) and `doGet` 10:34:44 (1.575 s) both Completed, and the
failing read appears **nowhere** — it never reached Google. A `/exec` redirect 404, the same flake
`verify-proxy` has had a retry ladder for since ca3. The read path had none. It does now: two retries on the
fast-failing `onerror` path (800 ms, 1600 ms). The 20-second timeout is deliberately *not* retried — that is a
different failure and `selfRefresh` already owns it.

**"Everything is incredibly slow. It used to be lightning fast."** Not a regression in this slice and not
fixable in the app: ca3 replaced the fast gviz endpoint with an Apps Script proxy, and `SpreadsheetApp` plus
cold start costs 0.3–3.3 s per execution — the Executions log shows exactly that, all Completed. What was fixable
is that the user stared at an empty screen for all of it. `bootFromCache()` now draws the saved copy before the
read is even sent. The one thing it must **not** draw is the safety verdict: ca4's rule is that a stale "Safe"
is worse than no answer, so `_provisional` forces the card to "Checking…" until a live read lands, and clears in
both `_sheetCallback` and `failLoad`. `render-selfcheck` gained a section that asserts a provisional render
shows no Safe/Unsafe verdict, still draws the rest of the dashboard, **and** that the verdict comes back once the
flag clears — a flag that never cleared would be a dashboard stuck on Checking forever.

**Note on the commits.** `deploy.bat` committed this slice as three "Update dashboard" commits rather than one
named one. The README's one-slice-one-commit rule lost to the deploy path; the range is `2a7352f..db5a8ee` and
ca5a reviews that, not a single hash.

**Not built.** There is still no delete in the app. `doPost` supports `op: 'delete'` but it exists so
`verify-proxy` can put the sheet back as it found it — one stray tap removing a day is worse than a blank row.
Clearing a day's Temp **and** Time and saving is the supported way to undo a wrong reading (`entryDiff` sends a
cleared field as an explicit clear; a temp-less row saves, but a time with no temp is refused). A real delete
affordance, with its own confirmation, belongs with ca6's write queue.

**Verification.** All six self-checks PASS: adapter, safety, staleness, render, migrate-sheet, entry.
`verify-proxy` re-run against the real sheet, all checks passed. Mike confirmed live on his phone that the save
lands. Deployed.

**Live confirmation (2026-09-15).** Mike confirmed all three fixes on the phone: the green "Saved to …" line
survives the reload, the read retry rides out the `/exec` 404, and the cached copy paints immediately with the
safety card holding at "Checking…" until the live read lands.

---

## ca5a — checkpoint review of `2a7352f..db5a8ee` (ca5)

Read-and-verify pass over ca5, the first slice that writes to the sheet. All six self-checks PASS; that was true
before the review too, which is the whole reason this slice exists. Eight targets, four fixed, four cleared.

**1. `render()`'s two exits — GAP CLOSED.** `Tools/render-selfcheck.js` ran the dashboard exit only, so the log
exit was in exactly the state ca4's `ovDay` bug was: shipped, and never executed by anything but a phone. The
check now renders the log tab closed, renders it with a card open, and renders the dashboard again after — the
round trip is what proves the charts come back. Mutation-tested: pointing `entryScreenHTML` at an undefined
variable turns six checks red. The exit itself is clean — `allCycles` at the top is read by `openDay`,
`showMoreDays` and `switchTab`, all of which re-enter `render()`, and nothing reads it between the assignment and
the old position. `selectedLogCycle` is only touched on the dashboard exit and only read there.
`currentDayNumber` is set on the dashboard exit and **read nowhere at all** — dead state since ca4, left in place
rather than churn a review diff; delete it in ca6 if the queue does not claim it.

**2. Chart teardown — CLEAR.** `drawTimelineChart`/`drawOverlayChart` each destroy before rebuilding, so the log
exit's teardown is belt and braces rather than the only guard. The only other reference to a chart object is
`overlayChart.getDatasetMeta()` inside `drawOverlayChart` itself, after the rebuild. Dashboard → Log → Dashboard
is now a self-check, not a hope.

**3. The write endpoint's read-patch-write — TWO FIXES.**
- Unticking a flag wrote `''` into a cell that carries a checkbox. `writeRow` now writes the boolean `false`,
  which is what an unticked checkbox actually holds; `cell()` already flattens `false` back to `''` on the way
  out, so nothing downstream changes.
- `setValues()` treats a leading `=` as a formula. A Note typed as `=1+1` was stored as a formula, and the app
  read back its result — the typed text gone, with no error anywhere. New `literal()` prefixes such a value with
  an apostrophe, which Sheets strips again on read, so the value round-trips unchanged.
- Formulas, dates and numbers in columns the request never mentions are untouched: `getValues()`/`setValues()`
  round-trips them as the values they are. A column holding a **formula** would be flattened to its last computed
  value — the migrated sheet has none, and nothing in the app creates one. Noted, not guarded.

**4. Insert-in-date-order — FIXED.** `insertAt` is chosen by a string comparison, which is only sound on
`yyyy-MM-dd`. A `Date` cell is formatted to that; a *string* cell was trusted as-is, so a stray `3/29/2026` would
compare greater than every 2026 date and drag the new row to the top of the sheet, reshaping every cycle after
it. Such cells are now skipped for ordering and reported back as `unreadableDates` rather than guessed at. The
"no later row" path appends correctly: `insertRowAfter(lastRow)` then writes `lastRow + 1`, never `getLastRow()`.

**5. The cache record's new field — CLEAR.** `cacheIsUsable` does not require `role`, so a record written before
ca5 loads and leaves `_role` null; the Log tab is hidden for the second or two until the live read answers, and
then appears. `_role` can only ever hold what the server granted on this device at some past moment, and every
write is refused server-side regardless — the tab is cosmetic by locked decision. No promotion path.

**6. Refresh suppression — FIXED.** An open card paused the 10-minute refresh indefinitely, and the staleness
banner and the safety verdict went quiet with it, visible only as a `console.log` nobody reads on a phone.
Re-rendering over a half-typed form is still the wrong answer, so after three skipped refreshes (30 minutes) the
form's own hint line says so, written straight into `#entryHint` without touching any input.

**7. The entry form against the real schema — COVERED.** `render-selfcheck` now opens a row carrying a mucus
value the option list does not contain, an Ovulation marker and a `cervix: …` note, and asserts the unknown value
stays selected, the note is shown rather than dropped, and saving a temperature on that row sends `Temp` and
nothing else. The live half — checkboxes and the formula-shaped note against the real sheet — is new coverage in
`Tools/verify-proxy.js` (2b), which Mike re-runs.

**8. The log table's four new columns — MIKE'S EYES.** Flow, Quality and Exc were added without `hide-sm`, so
below 620px the table went from 5 visible columns to 8. It sits in `.tbl-wrap { overflow-x: auto }` so it scrolls
rather than breaking the page, but whether it is readable on the S22 Ultra is not a grep question. Unresolved
pending Mike.

**Also fixed, found on the way:** `buildLogRows` printed every sheet value into the table unescaped. That was
survivable while the sheet was only ever written by hand; since ca5 the Note is text Mike types into this app,
and a `<` in it silently ate the rest of the row. Every cell now goes through `escHTML`, the same guard
`daySummary()` already used on the same values.

All six self-checks PASS. `verify-proxy` re-run and live confirmation are Mike's.

### ca5a addendum — Mike's live run, 2026-09-15

Two of the new checks failed against the real sheet. Everything else passed, including
the checkbox fix (a ticked flag reads back TRUE, an unticked one blank, the temperature
undisturbed) and the ordered insert/update/delete of the sentinel row.

**1. `safe window opens on cycle day: expected [24,22,30,37,27], got [24,22,30,37,30]`**

Not a regression. The `SAFETY` and `ADAPTER` blocks hash byte-identical between `2a7352f`
and the working tree, so nothing in the engine or the adapter moved; the row count was 169
against a floor of 165 and the last date was today, so Mike has logged since the 2026-09-13
baseline. The run's own info line shows three-over-six now firing on day 30 in cycle 5,
where it previously never fired at all. `safeWindowOpensOn` returns
`max(ovDay + 4, fire)` = `max(27, 30)` = 30 — the locked rule that three-over-six may only
delay an opening, never trigger one, working exactly as written. `EXPECT.opensOn` raised to
`[24, 22, 30, 37, 30]` with the reasoning in the comment. Cycle 5 should hold at 30 now:
once three-over-six has fired the day is fixed.

**2. `a note starting with = survived as text, not as 2: expected "=1+1", got "2"`**

Two fixes were tried against the real sheet and both failed — worth recording so neither is
tried a third time:

- **A leading apostrophe** (`literal()`). That forces text when a person *types* it into a
  cell; it is a convention of the typing UI, not of the API. `setValues()` evaluated the
  formula anyway.
- **A plain-text number format on the cell** (`setNumberFormat('@')` + `flush()` before the
  write). Also evaluated. `setValues()` parses the input first and applies the format to the
  result; the UI's plain-text behaviour lives above the API.

What works instead: a `RichTextValue`. It is text by construction, so there is nothing for
Sheets to parse. The text columns are written a second time, on their own, *after* the
`setValues()` that would otherwise overwrite them.

Sibling bug found while fixing it: read-patch-write re-enters **every** column on the row,
so a Note already holding `=1+1` as text would have been turned into a formula by a save
that never mentioned Note — a save of just a temperature would have silently eaten it. So
the rich-text rewrite covers every text column on the row on every write, not only
to the ones the request patched. `verify-proxy` now asserts exactly that: the untick step
patches only the two flags, and the Note is checked again afterwards.

`TEXT_COLS` is a list (`['Note']`), not a blanket: Note is the only free-text column, and
Temp and Time rely on the same entry parsing to land as a number and a time.

All six self-checks still PASS. Still Mike's: a re-run of `verify-proxy` after re-pasting
`Code.gs`, and target 8 (the log table's column count on the S22 Ultra).

**Target 8 — the log table on the S22 Ultra.** Mike confirmed the count: eight columns
survive `hide-sm` (Day, Date, Temp, Flow, Quality, Exc, Phase, Note), `.tbl-wrap` scrolls
them sideways, and Temp/Flow/Quality scroll away from the day they belong to — you cannot
tell which row you are reading. Day and Date are now `position: sticky` under 620px.

Two details the CSS cannot infer: column 2's `left` has to equal column 1's `width`, so both
are written as 52px rather than left to the content; and a sticky cell is transparent by
default, so the scrolling columns would slide visibly underneath it. `background: inherit`
on the two cells borrows the row's colour, which needed one new base rule — `tbody tr
{ background: #fff }` — placed before the `.row-*` rules so those still win.

All six self-checks PASS.

### ca5a addendum 2 — the formula note, attempts two and three

Both failed live, same symptom each time (`expected "=1+1", got "2"`):

- **`setNumberFormat('@')` + `flush()` before the write.** `setValues()` parses the input
  first and applies the format to the *result*. The plain-text behaviour people know from
  typing into a cell lives above the API.
- **`setRichTextValue()`.** Parsed on the way in as well.

Conclusion: the `SpreadsheetApp` write API has no literal mode, and there was no fourth
trick worth guessing at. The Sheets API does have one — `valueInputOption: RAW` is documented
as storing the value as-is, unparsed — so the text columns are now written a second time,
on their own, through the **advanced Sheets service**, after the `setValues()` that would
otherwise overwrite them. This needs Services → + → Google Sheets API switched on in the
editor, and a re-authorisation.

The whole row cannot use RAW: Temp would land as the text "97.11" instead of a number and
the Date object would not serialise. Hence the two-step write.

**A warning nobody reads is a warning that does not exist.** Checking how the app surfaced
`unreadableDates` — added earlier in ca5a with the comment *"never swallowed — the app shows
it"* — turned up that nothing in `index.html` ever read the field. The comment was wrong.
Both it and the new `textNotStored` are now read in the save handler, logged with
`console.warn`, and appended to the "Saved to …" line the dashboard shows after a write.

All six self-checks PASS.

### ca5a addendum 3 — two write channels, one of them buffered

Run four was clean (no token rejections, no 404s) and reported no `textNotStored`, so the
RAW write ran without throwing and the Sheets advanced service was enabled — and the note
still read back `2`. That ruled out every parsing theory: the RAW write was not the thing
failing.

`SpreadsheetApp` buffers its writes; the advanced Sheets service goes straight to the
backend. The RAW write was landing first and the buffered `setValues()` was then flushing
over the top of it with the parsed formula. `SpreadsheetApp.flush()` between the two is the
fix.

A read-back on the same channel now follows the RAW write, and any mismatch is reported as
`textNotStored: sent "…", sheet kept "…"`. After four runs disagreeing with documented
behaviour, the endpoint reports what actually landed rather than trusting the write.

**Two defects in the checks themselves, same root cause — assertions that hide *why*:**

- `is(fl.ok === true && fl.action, …)` collapsed a server error to a bare `false`. Replaced
  with `wrote()`, which prints the whole reply on failure and `textNotStored` /
  `unreadableDates` on success.
- The bad-request loop scored any `ok === false` as a pass. Run four printed *"Date sent as
  a value is refused (no-access)"* as an **ok** — the token had been intermittently rejected
  mid-deploy and the check called that a pass. It now names the error it expects.

### addendum 4 — the gap between the pinned columns

Mike, on the phone: "There is a gap between day and date so when I scroll
horizontally I can see data between them."

The sticky rules pinned column 2 at `left: 52px` and gave column 1 `width: 52px`.
The table is `table-layout: auto`, where a `width` on a cell is a suggestion the
browser is free to ignore — and it did: "Day" is one or two digits, so the column
rendered narrower than 52px. Column 2 stayed 52px in. The uncovered strip between
them is where the scrolling columns showed through.

Fixed twice over. `min-width`/`max-width` instead of `width`, which auto layout
does honour, so the column really is the width it claims. And both numbers now
come from one `--pin` custom property on `.log-tbl`, so the offset and the width
cannot drift apart again — which is the actual defect, since the previous comment
already warned that the two had to agree and that warning did not stop it.

Worth naming: the comment was right and still lost. A note telling the next person
to keep two numbers in step is weaker than not having two numbers.

## ca6 — the unsent write queue (2026-09-15, commit 9556f6a)

The slice in one sentence: a write that fails is kept on the phone until the sheet
confirms it, and nothing about it is ever allowed to disappear quietly.

### The shape that fell out of the locked decisions

"The sheet is the single source of truth" and "an entry never leaves the queue
except by a confirmed successful write" between them settle almost every design
question, and settle some of them against the obvious answer.

- **Its own storage key.** `cycleQueue`, not `cycleCache`. ca7's quota recovery
  drops the display cache to make room; if unsent entries lived in the same
  record, the recovery path would delete the one thing in this app that exists
  nowhere else. Now the relationship runs the other way: `saveQueue()` drops
  `cycleCache` to make room for the queue.
- **One entry per date, merged.** `doPost` is update-or-insert *per date*. Two
  queued entries for the same day are therefore not two writes — the second
  replaces the first in the sheet and the earlier edit is gone. `queueMerge`
  folds them, newest field wins, and keeps the original `at` so the "stuck for a
  day" clock runs from the first attempt rather than restarting on every edit.
- **The re-read is not optional.** On `ok: true` the entry is dropped and
  `loadData()` runs. The queued copy is never promoted into the display, because
  `ok` means "the endpoint accepted it", not "the sheet holds this".
- **Refusals are never queued.** `read-only` / `no-access` / `not-configured`
  will not succeed on a retry, so queueing one builds a banner that can never
  clear. The save path checks `isRefusal` and shows ca5's `NOT saved — …` line
  instead. An entry *already* queued that then gets refused still stays (the
  locked decision allows no other exit) and the banner says plainly that nothing
  more will send until it is sorted out.
- **A Discard button, confirmed.** The one deliberate exception, and the reason
  the rule above is survivable: without a way out by hand, a permanently
  unsendable entry is a permanently unclearable banner. The confirmation lists
  every day and every value being thrown away and says the sheet does not have
  them.

### Where it could have gone silent, and does not

Per the global rule about background failures, every path that could swallow
something now leaves a line that survives a reload:

- storage unreadable at boot, or unreadable entries inside it (counted, and the
  rubbish replaced so the message is not repeated forever);
- `setItem` refused even after the cache was dropped — the banner then says the
  list will not survive a reload and to write the numbers down;
- a partial flush — the loop stops at the first failure, since whatever stopped
  one will stop the rest, and the remaining entries keep their place in date
  order;
- ca5a's `textNotStored` / `unreadableDates`, which arrive *with* a successful
  write. The entry leaves (the row was written; re-sending changes nothing) but
  the warning does not leave with it.

The banner is deliberately uncapped, unlike `bannerHTML`'s
`MAX_BANNER_WARNINGS = 4`. Truncating a list of warnings about data the sheet
does not have would defeat the slice.

### Two bugs caught before they shipped

- **A flush would have wiped a half-typed entry.** The first version called
  `render(allCycles)` when it started. The 10-minute refresh has been suppressed
  while `_openDate` is set since ca5 for exactly this reason, and a manual flush
  is at its most useful precisely when a card is open. Now `refreshQueueBanner()`
  swaps the banner node alone, and `redrawAfterQueueChange()` makes every queue
  mutation respect the same rule.
- **A check that could not fail.** The "the queue banner has no dismiss cross"
  assertion matched `banner queue[^>]*>(?:(?!<\/div>)[\s\S])*banner-x` — which
  stops at the first inner `</div>` and so could never match anything. Worse, ca7's
  banner *is* dismissible and both can be on screen at once, so a naive
  page-wide search would have passed on the wrong banner's cross. It now asks
  `queueBannerHTML()` directly. Second time in this plan a regex assertion was
  green because it was incapable of being red.

### The harness

`Tools/render-selfcheck.js` had ~40 lines of stub browser inline. ca6 needed the
same stubs plus the ability to boot the page **twice against one storage map**,
which is the only honest way to test "survives a reload". Extracted to
`Tools/page-harness.js` and shared; `render-selfcheck` still passes unchanged in
behaviour.

`Tools/queue-selfcheck.js` is in two halves. The first extracts the marked
`QUEUE` block and tests the pure rules. The second boots the whole page and
drives the real `saveEntry` / `flushQueue` against a scriptable `fetch`:

- an entry logged with the network down is queued, is on the banner at first
  paint, and is still there after a reload;
- a successful flush sends exactly the patch that was typed, empties the queue,
  leaves no note, and stays empty across a reload;
- a half-working flush leaves *exactly* the day that failed, and says so on
  screen rather than only in the console;
- a refusal never enters the queue;
- a success carrying `textNotStored` drops the entry and keeps the warning.

All seven self-checks pass. The live half — aeroplane mode, log, reload, radio
back on — is Mike's, and he confirmed it on 2026-09-15.

### Worth carrying forward

`ok: true` from a write endpoint is a statement about the request, not about the
stored data. ca5a learned that from a Note that became a formula; ca6 had to
build the queue around the same distinction. Any future write path should assume
the reply is a receipt, not a copy of the row.

---

## ca6a — checkpoint review of `db5a8ee..HEAD` (ca5a + ca6), 2026-09-15

1,061 insertions across `index.html`, both self-check tools, the new `page-harness`,
`verify-proxy` and `Code.gs`. Under the 1,500-line trigger, but ca6 changed shared
code every screen runs through, which is the other half of the checkpoint test.
Seven named targets; four came back clean, and the three defects the other three
surfaced turned out to share two roots.

### The one that matters: a save during a flush

ca6 deliberately allows a **manual** flush to run with a card open — it swaps the
banner alone rather than re-rendering, so the open form survives. That leaves the
form's Save button live while a flush is in flight, and `saveEntry` guarded only on
`_saving`.

Save into that window and: `queueEntry` merges the new fields into the very entry
the flush is mid-way through sending, and then the flush's own
`_queue.filter(q => q.iso !== e.iso)` drops the merged entry **whole** when the
`ok:true` it was waiting on arrives. The temperature just typed is gone, and
nothing on screen says so. That is precisely the loss class ca6 was built to
prevent, introduced by ca6.

Target 5 had asked whether `_flushing` was enough of a guard. It is — in the
direction it was written for. It stops a second flush; it does nothing about a
write coming the other way. One guard in `saveEntry`, where all three write paths
route through, and it says *"Still sending earlier entries — try again in a
moment."* rather than failing quietly.

### `escHTML`, again

ca5a lost a log row to an unescaped `<` in a Note and fixed the *call site*.
Target 4 asked about a quote. `escHTML` covered `< > &` only — and `entryFormHTML`
feeds it into **attribute** values: `<input value="…">` and, for a select column,
`<option value="…">` holding whatever the sheet says (ca5 keeps an unrecognised
migrated value selectable on purpose). A migrated cell containing `"` closed the
attribute early. Fixed in the helper this time, not the caller: `"` and `'` are
escaped too, and since an entity renders as the character in text content, every
other caller is untouched. Sibling-bug rule paid for itself — the queue path the
target named was the least exposed of the three.

### Invisible when the role has not arrived

`queueBannerHTML` and `flushQueue` both gated on `_role !== 'writer'`. `_role`
only ever arrives from the display cache or a live read — and `saveQueue` deletes
that cache to make room when storage is tight. So the case is: writer, offline,
cache dropped, role `null` → the banner is suppressed and the manual flush is
unreachable, which is the exact state that most needs both. Worse, with no cache
at all the screen is `showMessage`, which carried no banner in the first place.
Now gated on `_role === 'reader'` (a reader can never hold a queue — a refusal is
never queued) and `showMessage` renders the banner above every message screen.

### Stale "not sent yet"

The `.unsent` span lives on the day card's summary line, not in the banner, so the
banner-only swap left the spans claiming unsent work after a successful flush —
with the banner that would have contradicted them gone, because a clean flush
leaves no note. The cards cannot be re-rendered there (it would wipe the form), so
the spans now carry `data-iso` and `refreshQueueBanner` removes the ones no longer
queued; and a flush that sends anything behind an open form leaves a note saying
the days behind it have not been re-read yet. Nothing on that path calls
`loadData`, by design, so the summaries really are older than the write.

### Mutation testing caught a third false green

Five checks added. The flush-interleave one passed with the fix reverted: with the
guard gone `await api2.saveEntry(DAY_A)` blocked on a promise the stub was holding
open, the event loop emptied, and node exited 0 before a single later assertion
ran. A check that cannot go red, for the third time in this plan. Reshaped so the
stub rejects everything after the held first call — the save then lands mid-flush
*and fails*, which is the only shape in which the old code lost the edit, and both
paths return. All five go red on mutation.

`page-harness` gained a `document.querySelectorAll` returning `[]`: the stub has
no element tree, so the span removal itself is unverifiable offline. What the
offline check pins is the markup contract that makes it possible — that the span
carries `data-iso`. The surgery is Mike's live pass.

### Recorded, not fixed

- `writeRow`'s read-patch-write reads with `getValues()`, which hands back a
  formula's *result*; the RAW write then stores that as text. An already-broken
  Note cell is normalised (`=1+1` → `"2"`) rather than recovered. ca5a stops new
  ones, and `"2"` beats a live formula — not worth a `getFormulas()` read on every
  write.
- `unreadableDates` under-reports: the date scan `break`s on the matched row, so
  odd cells below it are never seen. The warning's job is to send you to the
  sheet, and one is enough for that.

### Worth carrying forward

Two of the four defects were a guard that was right about the direction it was
written for and silent about the other one (`_flushing` blocks flush-on-save but
not save-on-flush; `!== 'writer'` excludes an unknown role as well as a reader).
Both read correctly in isolation. Ask of every guard *which states it lets
through*, not whether the state it names is handled.

### ca6a postscript — the live run, and a stale deployment (2026-09-15)

Mike's `verify-proxy` run came back with one failure out of forty-odd: a write
with the **reader** token was refused as `no-access` where `Code.gs` says
`read-only`. Every other write check passed, including ca5a's formula-note fix,
so the deployed script demonstrably had the current write path — the repo copy
and the live copy differed by exactly one line.

They differed because Apps Script serves a frozen **version**, not the editor's
contents. Mike redeploying the same code as a new version fixed it with no code
change at all. Recorded in `Apps Script/SETUP.md` §5a and the plan's ground
rules, with the part that matters: the textbook symptom of a stale deployment
(reads fine, writes 404) only appears when the live version predates `doPost`.
Between two versions that both write, the difference can be one error message,
which no amount of clicking around the app would surface. `verify-proxy` naming
the *expected* error rather than just asserting "refused" is the only reason
this was visible — and that precision was itself a ca3b lesson.

Second outcome: Mike offered to hand over the tokens so the check could be run
without him. Declined, and `verify.bat` replaces the need. It reads the /exec
URL, both tokens and the sheet ID from `%USERPROFILE%\.cycle-proxy.txt` and
passes them to `verify-proxy` without echoing them. Outside the repo on
purpose — `deploy.bat` runs `git add -A` into a public site, and a `.gitignore`
entry is one careless edit away from not existing. Nothing about the tokens
reaches the repo, a command line, or a chat transcript, and the check can now be
run by either of us.

Also worth writing down from the same session: **the app cannot cold-start
offline.** There is no service worker, so in aeroplane mode Chrome has to serve
`index.html` from its own cache, and when it cannot there is no page at all —
which is what Mike hit trying to run the queue tests. Even when the page does
load, a missing display cache lands on the error screen, which has no Log tab to
reach the form from. So every offline test has to start online and turn the radio
off with the tab already open. ca7's outstanding aeroplane-mode check for Tirzah
has the same hole in it.

### ca9 stubbed — cold-start offline (2026-09-15)

Written as a stub in the usual shape, to be expanded by the session that runs it.
It lands **before** ca8, on the same reasoning that pulled ca7 forward ahead of
ca4: the final review needs a settled diff, and this is a gap in the thing ca8
is meant to review.

The stub carries the facts ca6a verified rather than leaving the next session to
rediscover them: the four files the page needs to paint (including Chart.js from
jsdelivr, the project's only external dependency and cross-origin, so its cached
copy is an opaque response worth proving before relying on), the fact that
offline-with-the-tab-open already works through `cycleCache`, and the fact that
offline with no cache lands on `showError`, which has no tab bar — so a cached
page still cannot reach the entry form.

The stub's real content is the risk, stated before any code exists: a worker that
serves `index.html` from cache first is how an app pins itself to an old version
permanently, and `deploy.bat` would keep reporting success while a phone ran last
week's safety engine. Network-first for the page, cache only as fallback, and
nothing from `/exec` in the worker's cache — a second invisible copy of sheet data
behind the one the staleness banner reports on would undo ca7. It also has to not
fight ca7's `selfRefresh()`, which exists to escape a cached page pointing at an
archived `/exec` — exactly the failure a badly-scoped worker would make permanent.

## ca9 — the offline shell (2026-09-15)

### What the stub got right, and the one thing it got wrong

The stub's three open questions were all answerable from the code, and two came
back as it guessed. The third did not.

**Chart.js is not opaque.** The stub warned that a worker-cached copy of a
cross-origin script would be an opaque response and that this was "worth proving
before relying on". jsDelivr sends `Access-Control-Allow-Origin: *`, so the
response is a normal readable one and replays into a `<script src>` fine. It is
also version-pinned and immutable, which is what makes it the one thing in this
worker that is safe to serve cache-first. So it is precached — but it is no
longer *depended* on, which matters more. `index.html` gained
`chartsUnavailable()`: if `Chart` is undefined, each canvas's wrapper is replaced
with "These charts need an internet connection to load." and the draw functions
return.

That guard is ca4a's failure, pre-empted. Without it a cold start with no signal
would have thrown inside `new Chart(...)`, `renderPayload` would have thrown past
the dashboard it had already written, and `failLoad` would have replaced the lot
with an error screen — a blank dashboard from a throw, for the second time in
this plan. The guard went on the two **draw functions**, not the two call sites in
`render()`, because the overlay checkbox calls `drawOverlayChart(allCycles)`
directly from an `onchange` — a call site the render-level guard would have
missed.

### The thing the stub did not know it needed: `cycleRole`

The stub asked whether the writer should be able to reach the entry form from the
offline error screen "or is that ca6's problem". It is this slice's problem: a
cold start with no signal is *precisely* when the unsent queue matters, and ca9
cannot meet its own exit criteria if the writer cannot reach the form. So
`showMessage()` now carries the tab bar, and answers the Log tab with
`entryScreenHTML(allCycles || [])` — which needs no cycle data at all: every day
comes out "not logged" with no day number, which is exactly true.

That needs `_role`, and with no `cycleCache` `_role` was `null`. The obvious fix
— read the role out of the cache — is the one that does not work, because **ca7
and ca6 both delete that whole key** when storage is full. The state where the
role is most needed is a state where the cache may well be gone. Hence a separate
`cycleRole` key holding `PROXY_URL` and the role, a few bytes, written on every
successful read, read at boot *before* `bootFromCache()`. `bootFromCache()`
changed from `_role = c.role || null` to `_role = c.role || _role`, so a cache
saved before ca9 (no role in it) no longer wipes the role that was just recalled.

### The sibling bug the stub did not name

A remembered role outlives the token that earned it. Revoke Tirzah's link, or
paste a dead one, and the phone would have drawn the **writer's entry form** over
a refusal saying the link is dead — a writer-only surface on the viewer's screen,
which the plan's locked decisions forbid outright. So the `not-configured` /
`no-access` branch now clears `_role`, forces `_tab` back to `dashboard`, and
calls `rememberRole(null)` before showing its message. That is P7 in the mutation
list below and it is the single most important check in the slice.

### `sw.js`

Two rules, written at the top of the file as RULE 1 and RULE 2, because the next
person to touch this file is the one who could undo the whole plan with a
plausible-looking "make it faster" edit:

1. **The page is network-first.** Cache only as the fallback for a request that
   actually failed. Cache-first for `index.html` is how an app pins itself to one
   version forever; `deploy.bat` would report success and the phone would keep
   running last week's safety engine, with nothing on screen to say so.
2. **Same-origin GETs and one pinned CDN URL, nothing else.** `script.google.com`
   is never named in `sw.js`. Reads (a JSONP `<script src>` GET) and writes (a
   POST) both fall straight through, so `cycleCache` stays the only copy of sheet
   data on the phone and the staleness banner keeps reporting on all of it. It
   also means there is no second copy of `PROXY_URL` to drift.

The query-string handling is the subtle part. ca7's `selfRefresh()` reloads to
`?v=<now>`, which offline is the *only* navigation there is — an exact-match
cache could never answer it, so the fallback uses `ignoreSearch: true`. And a
refreshed page is stored under origin plus pathname with the query **stripped**,
because keying it as-sent would add one dead cache entry per rescue while leaving
the plain URL stale forever.

Registration is guarded on `window.isSecureContext` (https and localhost, but not
`file://`, where `register()` throws) and its failure is a loud `console.error`
naming the consequence — per the global rule about background failures, and
because a silently un-installed worker is a slice that shipped nothing.

### `redraw()`

`switchTab`, `openDay`, `showMoreDays`, the offline branch of `saveEntry` and
`redrawAfterQueueChange` all called `render(allCycles)` unconditionally. With no
data at all that draws nothing, so each now goes through one `redraw()` that
falls back to repeating the last `showMessage()` — which is what keeps the Log
tab usable on a cold start. Five call sites, one helper, rather than five copies
of the fallback.

### Verification, and three false greens

Eight self-checks PASS. Eleven mutations, each confirmed red then reverted: M1–M8
against `sw.js` and the registration (cache-first page, `ignoreSearch` dropped,
same-origin bail removed so the proxy gets cached, query-keyed refresh, `activate`
retiring nothing, the secure-context guard removed, a swallowed registration
failure, and `sw.js`'s Chart.js URL drifting from `index.html`'s), P1–P7 against
the page.

**Three of those went green first**, which is the real content of this entry:

- **P4** — deleting `rememberRole(_role)` from the JSONP callback changed nothing,
  because the check called `rememberRole('writer')` *directly*. It was testing the
  function, not the wiring. Fixed by driving a real
  `sheetCallback({ok:true, role:'writer', ...})` and then
  `store.removeItem('cycleCache')` — which is exactly the sequence ca7 and ca6
  produce in production when storage fills up.
- **P6** — `_role = c.role || _role` reverted to `|| null` stayed green, because
  no check ever booted *with* a cache present. Fixed by adding a section that
  writes a cache back with `role: null`.
- **P8** — `if (allCycles && allCycles.length)` relaxed to `if (allCycles)` stayed
  green, and investigation showed why: `renderPayload` throws when
  `cycles.length === 0`, so `allCycles` can only ever be `null` or non-empty. The
  `.length` half of the guard was unreachable. It was deleted rather than tested —
  a check for an impossible state is worse than no check, because it implies the
  state is possible.

P4 and P6 are the same mistake in two costumes: a check that exercises a function
instead of the path that calls it. That is now four false greens in this plan
(the previous one, ca6a's, was node exiting 0 on an unresolved await — which is
also why `offline-selfcheck.js` has a `settle()` helper; the `put()` inside the
fetch handler is deliberately not awaited).

### Files

New: `sw.js`, `Tools/offline-selfcheck.js` (17 checks under a stub worker global
with a fake Cache API that honours `ignoreSearch`). Modified: `index.html`,
`Tools/render-selfcheck.js` (four new sections), `Tools/page-harness.js` (stub
elements gained `parentNode`, so a check can read back what replaced a canvas).

### Outstanding

The cold-start test cannot be run headlessly — it is Mike's, on the phone, in
aeroplane mode with the tab closed. Including, deliberately, the one check that
proves this slice did no harm: run `deploy.bat`, then open with a signal, and
confirm the new version is there on the **next** open. Tirzah's ca7 aeroplane-mode
check re-runs afterwards, and must still show no tab bar.

### ca9 live, and the bug the live pass turned up (2026-09-15)

Deployed as `f9ab1a7`. Mike confirmed the whole exit list on the phone: a cold
start in aeroplane mode with the tab closed paints the app rather than Chrome's
offline page, the Log tab is reachable from it, a day logged there queues, and —
the check that mattered — a phone with a signal gets the new version on the
**next** open after a `deploy.bat`. The worker is network-first in practice, not
only in the self-check.

Before that, opening the app produced ca6's queue banner:

> last attempt: the server did not reply within 30 seconds. Tue, Sep 15 could not
> be sent: the server did not reply within 30 seconds

The dashboard loaded alongside it, which was the first useful fact: the read is a
JSONP GET to the same `/exec`, so the deployment was live and the token was fine.
Only `doPost` was failing. `verify.bat` then passed every check end to end,
including the entire ca5 write endpoint — reader refused, writer write lands,
inserted in date order, retry does not duplicate, flags, the formula-shaped note,
the sentinel deleted and the row count back where it started. So not `Code.gs`,
not the deployment, not the tokens.

A read through the proxy settled it: the sheet already held `2026-09-15` with
`Temp: "99"`. **The write had landed.** The POST reached `doPost`, the row was
written, and the reply never made it back inside the client's 30s budget — which
the client cannot distinguish from a write that never happened, so it queued the
entry and told Mike it had failed.

Worth recording that ca9 was not live at the time. It was committed as `85f73e5`
but never pushed; `origin/main` was still `e324f09`. The instinct to suspect the
thing that just changed was wrong here, and checking took one command.

The cause was already written down in this repo, at `Tools/verify-proxy.js:92`:
Apps Script redirects `/exec` to a second Google host, and that hop intermittently
404s or 5xxs under back-to-back requests. Both `call()` and `post()` retry it up
to four times with a backoff, out loud. `postEntry()` in `index.html` makes one
attempt. So the tool that verifies the write path has been tolerating a flake the
app calls a failure, since ca5, and nobody noticed because the tool never failed.

Mike pressed **Try sending now** and it went straight through — same request,
second attempt, confirmed `ok:true`, entry out of the queue, sheet re-read,
banner gone. Exactly the shape the retry would have absorbed silently.

This became `slice-ca10-write-retry.md` rather than a fix folded into ca9, and it
has two halves, because only one of them is the retry. The other is that "could
not be sent" is a claim about the sheet and a timeout is not evidence for it —
ca3b's lesson, which ca7 already applied once when it stopped the 20s load
timeout blaming a quota it had not observed. A queue that cries wolf gets ignored
right up until it is real.

It also exposed a gap in ca6's own invariant. ca6 recorded that `ok: true` means
the request was accepted, not that the sheet holds what was sent. The mirror
image was never written down and is what actually bit: **a timeout does not mean
the write did not land.** That is now an open deviation in `STATE.md`, owned by
ca10.

ca6a's two outstanding items closed in the same pass: the `verify-proxy` run
above, and its live pass — the queue was exercised for real rather than by a
check, with a genuinely stuck entry flushing on a retry and the banner clearing
on a confirmed reply.

Still outstanding: **Tirzah's aeroplane-mode check from ca7.** ca9 changed what
she sees on a cold start, so it now covers ca9 as well — dated dashboard, no tab
bar, no entry form.

## ca9a — checkpoint review of `55db0c4..HEAD` (2026-09-15)

~570 lines, under the 1,500 threshold, but the second question was yes: ca9 put a
shared helper (`redraw()`) behind five call sites, gave `showMessage()` a much
larger job, and added a stored fact that outlives the token that earned it. That
is the profile that produced every defect ca4a, ca5a and ca6a found.

### Cleared by reading

**`redraw()` and its five call sites.** Every one of `switchTab`, `openDay`,
`showMoreDays`, `saveEntry`'s offline branch and `redrawAfterQueueChange` wants
the message repeated rather than a loud failure: each is reachable *only* from a
screen `showMessage()` drew, and the last-resort branch (`console.error` plus
`showError`) covers the impossible case rather than leaving a blank screen.
Nothing calls `render()` any more except `renderPayload()`, which is the one
place rows become a dashboard.

**`entryScreenHTML(allCycles || [])`.** With `[]` the `_byIso` map is empty,
`dayNumberFor()` returns `null` for every day and `daySummary(null)` is "not
logged" — all of which are true offline. `entryProblem()` and `entryDiff()` look
at the form and the one row, never at the cycles, so a save from that screen is
the same save. And because only changed fields are sent, a day that *is* already
in the sheet is not blanked by being edited from a screen that cannot see it.

**`page-harness.js`'s new `parentNode`.** No live defect: `chartsUnavailable()`
only runs from the two draw functions, which only run once `render()` has written
`#app` and both canvases exist. But the stub — like `getElementById()` before it —
never answers null, so the guard it exercises can never be exercised *false*.
Recorded as an open deviation rather than fixed: making the harness sharper is a
slice of its own, and this is the shape of the false greens this plan keeps
finding.

### Fixed

**1. The remembered role outlives the token that earned it.** Slice item 4 asked
for this to be confirmed by reading, and it was worse than suspected: `cycleRole`
and `cycleCache` are *both* keyed on `PROXY_URL` alone, and `bootstrapToken()`
saves a new `#t=` over the old token without touching either. Paste Tirzah's
reader link into the browser that held Mike's writer link and, until the first
successful read, `recallRole()` still says `writer` and `bootFromCache()` still
draws the previous token's dashboard. A cold start with no signal inside that
window offers her the Log tab and the entry form.

Fixed at the one place both keys route through rather than by keying each on the
token: `bootstrapToken()` drops `cycleRole` and `cycleCache` when the arriving
token differs from the stored one. Keying on the token would have put a second
copy of the secret in a second key for no extra safety. The unsent **queue** is
deliberately not dropped — it is unsaved work, and a link that cannot write
refuses it rather than losing it.

Note the asymmetry the slice named: this self-corrects the moment there is a
signal, and it makes Tirzah's phone look *more* capable, not broken. "She'll say
if it breaks" could never have caught it.

**2. `read-only` is the third refusal shape, and the read path can never see
it.** `doGet` answers only `not-configured` and `no-access`, both of which ca9
already clears the role on. `doPost` also answers `read-only` — a reader token
trying to write — which is the server proving a remembered `writer` wrong, and it
is reachable precisely from the offline path finding 1 opens: the form is drawn
from a remembered role, the save is queued, and the flush is refused. Nothing
cleared the role, so every later cold start offered the form again. One shared
`forgetRole()` (role, tab, stored key) now fires from `postEntry()` — the single
point both `saveEntry` and `flushQueue` route through — as well as from the GET
handler.

**3. `sw.js`'s `activate` swept every cache on the origin.** `caches.keys()` is
per-origin, and github.io serves *every* one of Mike's repos from
`carrenomike.github.io`. An unprefixed `filter(k => k !== CACHE)` would delete
another project's offline cache from inside this app. Now scoped to
`cycle-shell-`. The self-check that asserted the old behaviour asserted a bug;
it now asserts the scoping.

**4. A third party's CDN could cost the whole offline shell, silently.**
Chart.js was inside `addAll(SHELL)`, which is atomic on purpose — so one bad
minute at jsdelivr fails the install and *nothing* is cached, `index.html`
included, for the one file the page already copes without (`chartsUnavailable()`
draws a message instead of throwing). Same-origin files keep the all-or-nothing
bargain; Chart.js is a best-effort `add` with its own warning.

And the failure was invisible from the page: `register()` resolves as soon as the
worker *starts* installing, so ca9's `.catch` never fires on a failed install.
The page now watches the installing worker for `redundant`, which is the only
signal there is. This is the file that can make `deploy.bat` lie, so it does not
get to fail quietly.

### Checks

15 added — 8 in `offline-selfcheck.js` (install with an unreachable CDN, install
with an unreachable same-origin file, a clean install, origin-scoped `activate`,
and the registered-then-redundant worker) and 7 in `render-selfcheck.js` (a new
token clears role and cache but not the queue, the same token clears neither, and
`read-only` forgetting the role in memory, in the tab and in storage). All 8
mutations tested red first. All 8 self-checks PASS.

### Live (2026-09-15)

Deployed at `6f03eba` and passed by Mike on the phone, writer side and reader
side both.

The reader half was run as a **link swap on Mike's own phone** — the writer link
had been in that browser since ca9, so pasting the reader link over it is exactly
finding 1's scenario, run for real rather than under a stub. It behaved: no tab
bar, no entry form, and a cold start in aeroplane mode drew the dated dashboard.
Before the fix that same swap would have kept role `writer` until the first
successful read, so this is the strongest possible pass for F1 — the test and the
defect are the same event.

**Tirzah's aeroplane-mode check is closed on this, not waived into nothing.** The
reader surfaces are the same code whoever holds the link, so the functional half
is genuinely covered. What is *not* covered is her device: the plan targets Chrome
on Android and hers has not been checked. That is a device caveat now, not an
outstanding test, and it is not worth blocking ca10 on.

Two things Mike should keep in mind after a swap like this, both by design rather
than by accident: the reader token overwrites `cycleToken`, so the writer link has
to come from wherever it is saved (the app scrubs `#t=` from the address bar once
it stores it); and `cycleQueue` deliberately survives the swap, so any unsent
writer entries sit there until the writer link is back.

## ca10 — surviving the flaky second hop (2026-09-15)

A write that **landed** was reported to Mike as a write that failed: the Sep 15
entry was in the sheet with `Temp: "99"` while the queue banner said it "could
not be sent: the server did not reply within 30 seconds". The POST reached Apps
Script, `doPost` did its job, and only the reply was lost on the second hop.

Two halves, both shipped.

### 1. Retry the hop

`Tools/verify-proxy.js` has retried this since ca5 (its own comment names the
cause: `/exec` redirects to a second Google host that 404s or 5xxs under
back-to-back requests). The app made exactly one attempt. The two now share one
rule — 4 attempts, `attempt * 1000` ms backoff, said out loud — and each file's
comment points at the other, because a flake the verifier tolerates and the app
calls a failure means the verifier is not verifying the app.

`postEntry()` was split in two. `postOnce()` is the old single fetch plus one
addition: a 404/5xx is flagged with `hopStatus` and thrown, rather than falling
into the "reply this app could not read" branch that used to swallow it.
`postEntry()` is the loop around it, and it is still the single write path —
`saveEntry` and `flushQueue` both come through it, so the retry exists in one
place.

**ca9a's `forgetRole()` stayed outside the retry**, which the slice flagged as
the thing not to break. A *reply* — refusal or not — returns immediately: the
server answered, and asking again gets the same answer. So a refusal is still
final on the first reply, `forgetRole()` still fires exactly once from the write
path, and no short-circuit can skip it.

**What is retried** (`writeFailureKind`, answering the slice's open question 1):

| symptom | retried | may have landed |
|---|---|---|
| `TimeoutError` | yes | **yes** — ca10's own failure |
| 404 / 5xx (`hopStatus`) | yes | yes — the hop can fail after `doPost` ran |
| `TypeError`, `navigator.onLine === false` | no | no |
| `TypeError`, otherwise | yes | yes |
| a reply that was read and made no sense | no | no |

The browser's symptom could not be predicted from node, so all three are handled.
`navigator.onLine` is trusted only in the direction it is reliable: `false` means
there was no network to reach the sheet with, so nothing landed and a retry is
pointless; `true` means nothing, so a `TypeError` there is treated as a redirect
that failed CORS — retried, and claimed nothing about.

**The stop is a wall-clock deadline, not only an attempt count.** Four attempts
costs six seconds against a fast 404 and over two minutes against a timeout, and
the slice was right to flag that. `WRITE_BUDGET_SAVE` is 100s and
`WRITE_BUDGET_FLUSH` is 180s, checked *before* starting an attempt the budget
cannot pay for. In practice: a 404 storm uses all four attempts either way; a
timeout gets two attempts on Save and three on a background flush. The per-attempt
timeout went 30s → 45s, which is what `verify-proxy` has always allowed against
this endpoint (open question 3).

`saveEntry` passes an `onRetry` callback that puts "Still saving — the server did
not answer, trying again (attempt N)…" on the spinner; `flushQueue` passes none
and the console carries it. Mike pressing Save is watching; a boot-time flush is
not. Every attempt, and every give-up, is a `console.warn`.

### 2. Stop the banner asserting what it never observed

"Could not be sent" is a claim about the sheet, and a timeout is not evidence for
it — ca3b's lesson, which ca7 already applied to the 20s load timeout. An entry
now carries `unknown`, set from the last attempt only, and it changes what is
said rather than what is done:

- `writeAttemptText()` adds "The app never heard back, so whether it reached the
  sheet is not known" — and nothing is appended to a refusal, which is quoted
  as-is.
- `unsentNoteText()` is the per-day line both write paths share: "could not be
  sent" when that was observed, otherwise "was sent, but nothing came back to
  confirm it… sending it again is safe — it rewrites that day rather than adding
  a second row."
- The banner's headline switches from "has not reached the sheet yet" to "has not
  been confirmed by the sheet", plus a line saying one of these may already be on
  the sheet. The weaker claim wins as soon as one entry is in that state.
- `e.tries` is on screen at last (open question 4): "Sent again N times so far
  without a confirmation", from two sends up. It counts *sends*, not requests —
  each send already retries the hop internally — which is the difference between
  a flake and an outage.

Nothing else changed: an entry still leaves the queue only on a confirmed
`ok: true`, refusals are still never queued, and the values sent are still the
diff the form was opened against.

**One real bug found while checking, not shipped:** the deadline was
`budgetMs || WRITE_BUDGET_SAVE`, so a caller asking for no room at all silently
got the default two minutes. It is `== null` now, and the check that caught it is
in the file.

### Checks

`Tools/queue-selfcheck.js` gained 26: the classifier and the three wordings as
pure functions, then the paths themselves — a 404 then a success (two requests,
same patch, entry leaves once, and *nothing* reported as a problem), a retry
during a save writing its notice to the spinner, a refusal answered once, an
outage exhausting the budget and leaving a visible banner that does not claim the
sheet is missing the row, and the budget stopping a timeout that the attempt
count alone would not have.

The scripted fetch stub answers a sequence of real HTTP outcomes (status numbers,
`TimeoutError`, JSON replies), so "flaked once then worked" is a second request
rather than a mocked verdict. The retry backoff is a real `await`, so those boots
get a real `setTimeout` for sub-second waits only — the page's own 20s load timer
stays the no-op it is everywhere else in that file, or every boot would hold the
process open.

**All 13 mutations were red first**, including one aimed at this plan's recurring
false green: `queue-selfcheck.js` now fails if the process exits 0 without
reaching its last line. Three of the false greens in this plan were node exiting
cleanly on an await nobody resolved; the run finishing is now itself a check.

All 8 self-checks PASS.

### Outstanding

Mike's live test. The flake is intermittent, so the honest exit is the console
showing `Write attempt 1 … trying again` at least once in normal use — not a
one-off green run. `verify.bat` still needs a pass on the real endpoint.

## ca10 postscript — the refusal Google invents (2026-09-15)

`verify.bat` was run four times against the live endpoint after ca10 was committed. Three runs failed, none of
them ca10's doing:

1. A read that never came back. `verify-proxy` retried a 404 or a 5xx from the flaky hop but not silence — and
   silence is what ca10 was written about. Fixed here: one `flakyFetch()` now serves both `call()` and `post()`,
   and retries a `TimeoutError` on the same four attempts and `attempt * 1000` backoff. It logs
   `retry  no answer in 45s from Google, attempt N`, and it fired visibly on the next run.
2. A reader-token read that exhausted all four attempts. Google, not us.
3. **Twice: a write refused with `no-access`, using the writer token that had worked seconds earlier in the same
   run.** New, and worse than either.

(3) was reproduced on demand. The mechanism, from four scratchpad probes:

- `/exec` answers a POST with a **302** (39 of 40; the 40th timed out), not a 307/308.
- The script therefore runs on the **first** hop. The redirect points at a one-time URL holding the answer that
  was already computed; the body is never re-sent. That is why a POST through `fetch` gets a `doPost` reply at all
  despite a 302, and why 80 ordinary POSTs produced no phantom.
- Fetching that one-time URL a **second** time does not replay the answer. It runs `doGet` with no parameters:

  | POST | 1st GET of the redirect target | 2nd GET of the same target |
  |---|---|---|
  | writer token | `bad-request: date must be YYYY-MM-DD` | `no-access` |
  | junk token | `no-access` | an HTML page |

  A malformed date throughout, so nothing was written; `bad-request` is proof the token was accepted.

So `no-access` has two meanings — a wrong token, or an answer link fetched twice — and the reply cannot tell them
apart. The second fetch is not something this code asks for, but an HTTP stack re-issuing a request on a
connection it thinks died is enough, and it happened twice in four runs.

The damage is ca10's own lesson wearing a different costume: the write has **already landed** when this reply
arrives. Today the app treats a refusal as final and never retries it (ca10, deliberately), never queues it (ca6),
and forgets the remembered writer role on it (ca9a). One hiccup can therefore demote Mike to "no access" and drop
a confirmation for a row that is sitting in the sheet.

Not fixed here. It is a change to the refusal contract that ca6, ca9a and ca10 all lean on, so it is
`slice-ca11-phantom-refusal.md`: confirm a refusal with one more send before believing it, and only a second
refusal reaches Mike, the queue or `forgetRole()`.

## ca11 — confirming a refusal before believing it (2026-09-15)

The postscript above is the finding; this is the fix. Nothing new was learned about Google's hop — the probes were
already done — so this entry is about what the app now does with it.

**The rule.** A refusal (`read-only` / `no-access` / `not-configured`) is no longer final on sight. `postEntry()`
sends the same patch once more and only the second refusal counts. One extra send, never a budget: ca6 is explicit
that a refusal behind a retry loop is a banner nothing can ever clear, and the confirming send is guarded by a flag
(`refusedOnce`) rather than by a counter, so it cannot become two. A `console.warn` names the phantom when it
happens, because a survived phantom is still Google misbehaving and this project keeps paying for quiet failures.

**Why one send settles it.** The phantom comes from the answer link being fetched a second time, not from the
script. A second POST is a fresh script run with a fresh answer link, so it either lands (`ok:true`) or refuses for
a real reason. Two script runs agreeing is the evidence the old code assumed it had from one.

**What happens when the confirming send gets no answer.** It falls into ca10's retry path and, if that gives up, is
thrown as an ordinary write failure with `unknown` set — so the entry is *kept* and marked "may already be on the
sheet", instead of being dropped the way a refusal is. That is the honest reading: a refusal was seen, but nothing
confirmed it, and the row may well be in the sheet.

**`forgetRole()` (ca9a) now fires only on a confirmed refusal**, still exactly once, still outside the retry loop.
Before ca11 one hiccup could demote Mike to "no access" on a cold, offline-capable app — the worst version of this
bug, because the entry form disappears with the role.

**The read path was deliberately left alone**, with a comment saying why: the phantom needs a second run of
`doGet`, and that run has no `callback` parameter, so it answers bare JSON — which the JSONP `<script>` tag cannot
execute at all. A phantom on a read therefore shows up as a timeout, which is already handled; it cannot arrive
dressed as a refusal. If that ever changes, the comment points at `postEntry()`.

**`bad-request` is not treated like `no-access`** and the code says so: it comes from the script's own run on the
first hop and means what it says. Only the three refusal shapes can be forged by a re-fetch.

**`Tools/verify-proxy.js`** got the same one-shot confirm in `post()`, so a phantom prints a `retry` line instead
of failing the run — which is what "verify.bat passes end to end" now means. The deliberate refusal checks (reader
token, junk token) each cost one extra send and still pass; re-sending a refused write writes nothing. Not built:
re-reading the sheet to prove a refusal was genuine. The confirming send already stops a phantom failing a run, and
the extra machinery only pays off if a refusal ever survives two sends and is still doubted.

**Checks.** 17 added to `Tools/queue-selfcheck.js`: a phantom then a success (day saved, role kept, nothing
reported, the confirming send carries the same patch), a genuine refusal (two sends and no more, role forgotten
exactly once, never queued, still says NOT saved), `read-only` costing two sends and never three, and an
unconfirmed refusal keeping the entry with `unknown` set. A small store wrapper counts how many times the
remembered role was actually dropped, so "forgotten once" is measured rather than assumed — ca9a broke twice over
that. Three mutations red: believing a refusal on sight (the pre-ca11 code, 9 checks red), firing `forgetRole()`
on the first refusal (5 red), and allowing two confirming sends instead of one (2 red). A fourth mutation —
confirming for ever — hangs rather than fails, which is the one shape these checks cannot report; the flag is what
makes it unreachable.

All 8 self-checks PASS. Deployed by `deploy.bat` as commit `47547be` ("Update dashboard") before this wrap-up ran,
so the code and this entry are one slice in two commits. **Live test is Mike's**: `verify.bat` end to end, and the
honest exit is a phantom being survived in the console during normal use.

**The live runs changed the fix.** `verify.bat` was run twice on 2026-09-15 after the code was written. Run 1
caught three phantoms and survived all three — and then produced a refusal on the **good writer token** whose
confirming send was refused too, followed by four requests that got no answer at all before the run aborted. Run 2,
minutes later, passed every check end to end, with the sheet back at 169 rows and no leftover sentinel: run 1 had
written nothing and left nothing behind. So the hop goes bad in **patches**, not per request, and a confirming send
fired instantly lands inside the same patch. Both the app and `verify-proxy` now pause before it — the same
`RETRY_PAUSE_MS` the retry loop uses. One send, after a pause; still never two.

**A false green fixed on the way.** The pause is an `await`, and `page-harness.js` answered `setTimeout` with a
no-op that dropped every timer — so the page waited on something that would never resolve and node exited 0 in the
middle of the run. `queue-selfcheck` had been carrying a local fix for this since ca10 (`RETRY_ENV`); it now lives
in the harness, where every check gets it: timers under 5s really run, the page's 20s load timer and 10-minute
refresh stay no-ops. That is the fourth false green of this shape in this plan, and the first one fixed at the
root.

## ca8 — the whole-plan review of `1065c1e...HEAD` (2026-09-15, commit 830a537)

The final review slice. Not a hunt for fresh bugs in one file but for **drift between files**: a helper reused
past the assumptions of the slice that wrote it, a guard one slice relaxed that a later one leans on, and a gap
between what the Apps Script sends and what the client parses. Everything in `index.html`, `Apps Script/Code.gs`,
`sw.js`, `Tools/verify-proxy.js`, `deploy.bat`, `verify.bat` and `manifest.json` was read end to end first.

**One defect, and it was in the check, not the app.** `Tools/verify-proxy.js` only *looked* like it retried a
request that never came back. `flakyFetch` took the caller's `init` object — including its
`AbortSignal.timeout(45000)` — and handed the same object to every recursive retry. An `AbortSignal` that has
fired stays fired forever, so attempts 2, 3 and 4 each started with a cut-off that was already spent and rejected
instantly with the same `TimeoutError`. The run printed

```
  retry  no answer in 45s from Google, attempt 1 — waiting 1s
  retry  no answer in 45s from Google, attempt 2 — waiting 2s
  retry  no answer in 45s from Google, attempt 3 — waiting 3s
```

in rapid succession, having really waited once. **This is the explanation for ca11's "four requests that got no
answer at all"**: three of those four were never sent to Google at all — they were aborted before they left.

Verified rather than reasoned, per the standing rule. A throwaway script reused one fired signal on a second
`fetch`:

```
aborted: true  reason: TimeoutError
reused signal rejected after 73 ms with TimeoutError
```

The fix is small and the direction matters: the cut-off is now built **inside** `flakyFetch`, one per attempt,
which is what `postOnce()` in `index.html` has done since ca10. The app had it right; only the verifier drifted.
That is precisely the failure the slice names — *a flake the verifier tolerates and the app calls a failure means
the verifier is not verifying the app* — arriving inverted: a flake the **app** survives and the **verifier**
calls fatal. Both callers stopped passing a signal in.

**Sibling check.** Every `AbortSignal`, `new Request` and `signal:` in the repo was grepped. Two sites only:
`postOnce()` (correct — a fresh signal per call, and the call *is* the attempt) and the one fixed here. The JSONP
read retry was checked too and is clean for the same reason in a different shape: each attempt builds a new
`<script>` element, removes the previous one, clears the previous timer and neuters the previous callback, so no
one-shot object survives into the next attempt.

**The checks that missed it.** Nothing here had ever *executed* `flakyFetch` — it only ran inside `verify.bat`,
against the live network, where a fast failure looks like a slow one that gave up. So:

- The retry rule in `verify-proxy.js` is now a marked `>>> RETRY` block with its three numbers as named constants
  (`RETRY_ATTEMPTS = 4`, `RETRY_PAUSE_MS = 1000`, `ATTEMPT_TIMEOUT_MS = 45000`) instead of `4` and `1000` and
  `45000` spelled out mid-expression, where they could not be compared to anything.
- New `Tools/retry-selfcheck.js` extracts that block and runs it verbatim with `fetch`, `setTimeout` and `console`
  passed in as parameters — stubs for the network and for time, so the real one-second backoffs are asserted
  without waiting six seconds — while `AbortSignal` stays **real**, because the bug only exists against the real
  one. It asserts four attempts on silence, a thrown fourth, a cut-off on every attempt, no attempt starting
  already aborted, **four distinct signal objects**, backoff `[1000, 2000, 3000]`, the 404/5xx flake retried and
  a 403 not retried. It also holds the three numbers against `index.html`'s copies, so the two files cannot drift
  again without a check going red.
- Mutation-tested: restoring the old caller-supplied signal turns *each attempt gets its own cut-off* red and
  leaves the other twenty green. The distinct-object assertion is the one that catches it; *not aborted on entry*
  does **not**, because a stubbed `fetch` returns before a real 45-second timer could fire.

**Nothing gated a deploy.** The nine self-checks were run by hand, one node command each, and `deploy.bat` pushed
whatever was in the tree. ca4 shipped a blank dashboard that way. New `checks.bat` runs every
`Tools\*-selfcheck.js`, names the ones that failed, and `deploy.bat` now calls it first and refuses to commit or
push on a failure.

**Held against the real data.** `verify.bat` was run end to end on the live sheet and passed every check. The
safe window opens on cycle days **24 / 22 / 30 / 37 / 30**; with the ovulation marker stripped from every row,
**no cycle opens a window at all** (`[null,null,null,null,null]`); three-over-six fires on 24 / 21 / 30 / 37 / 30,
so it only ever delayed an opening and never caused one; the opening bleed runs end on 6 / 6 / 6 / 5 / 7 and rule
1 reads nothing else. The run also survived, out loud, **two 404s from the second hop** — each followed by a
genuine one-second wait, which is the fixed retry doing its job — and **three phantom refusals**, each re-sent
once and confirmed. Sheet back at 169 rows, sentinel deleted, nothing left behind.

**Failure paths.** Every one was traced to something a person can see: bad token, missing token, unconfigured
server, a read that never answers (20s, one self-reload past the browser cache, then a message), a network
failure, a malformed payload, a refused write, an unconfirmed write, a storage refusal that would lose unsent
work, an unreadable queue, a stuck queue and a stale cache. No silent swallow found. The one path that ends only
in the console — a service-worker install failing — is deliberate and was settled in ca9.

**Secrets.** Clean. The only long token-shaped string in the repo is the `/exec` URL in `index.html`, public by
design; `Apps Script/Code.gs` carries blank constants; the sheet ID appears nowhere outside the already-burned
old one quoted in ca2's slice file. `%USERPROFILE%\.cycle-proxy.txt` is still outside the repo, and `verify.bat`
was run through it without the tokens ever entering this session.

**Three things looked at and left alone**, each written into STATE's open deviations with its reason: a confirmed
`read-only` forgets the remembered role but does not redraw (redrawing would erase the only on-screen explanation
of the refusal); the offline shell has no cut-off of its own (falling back to cache on a timer is how a phone gets
pinned to an old safety engine, which is the worse failure); and the worker re-caches whatever Chrome's own HTTP
cache hands it, bounded at the ten minutes GitHub Pages allows and self-correcting on the next open.

**The live phone test was waived by Mike**, and the reason it is safe to waive is on the record: ca8 changed no
file the phone loads. `index.html`, `sw.js`, `manifest.json` and `Code.gs` are byte-identical to ca11's. The
whole diff is the verifier, a new check, a new check runner and the deploy gate — plus this log and STATE.
