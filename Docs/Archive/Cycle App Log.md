
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
