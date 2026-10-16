# Spec — One Symptoms picker per day, and more symptoms

Standalone spec, not part of the finished `Plan/cycle-app/` slice plan. Do not edit that plan's STATE or README for this.

## Scope

Replace ca12's question bar with a flat list of days: every day row has its own **temp + time** boxes and a
**Symptoms** button that opens a picker holding every other field. Add six new fields (Arousal, Acne,
Penetration, Protected, Cramps, Mood). Replace the dashboard table's Cervix/Pos/Mucus/Breasts columns with one
**Symptoms** column. ca12's save model (drafts in memory, one pinned save bar, one send per day, review list)
is kept, not rebuilt.

## Why (Mike, 2026-10-16)

One tab per symptom does not scale past a handful, and Mike wants to log temps across the list, then a day's
symptoms in one go, then save everything at once.

## Verified facts (2026-10-16, from the code at `8e6cf97`)

- The ca12 Log screen is shipped (`d6ce985`, `db1e685`). Its planned ca12a review never ran; this work
  rewrites most of that screen.
- Log screen: `QUESTIONS` (index.html ~885), `_question`, `setQuestion()`, `controlsHTML()`, `entryScreenHTML()`
  (~1320). Field definitions: `ENTRY_FIELDS` (~804). Day line: `daySummary()` / `daySummaryFor()` (~1218).
  Unknown-value rule: `optionsFor()`. All per-day draft/diff/save code (`dayForm`, `dayChanges`,
  `changedDays`, `hasEdits`, `entryDiff`, `entryProblem`, `postEntry`, `queueEntry`) is per-date already —
  **reuse unchanged**.
- `doPost` in `Code.gs` refuses any column not in the sheet header (`unknown-column:`), turns `FLAG_COLS`
  (`Cycle Start, Ovulation, Exclude`) into real booleans, and writes `TEXT_COLS` (`Note` only) at RAW so a
  leading `=` is not stored as a formula.
- `hasData()` (~516) lists the columns that make a row count as logged.
- Dashboard: log table header ~2115 and `buildLogRows()` cells ~2414 (Cervix, Pos, Mucus, Breasts columns, all
  `hide-sm`); chart tooltip `afterBody` ~2373 lists Mucus/Cervix/Breasts.
- No new field feeds the `SAFETY` block. Flow and Cycle Start still do — they move into the picker unchanged.
- Self-checks that drive the Log screen: `Tools/render-selfcheck.js`, `Tools/entry-selfcheck.js`,
  `Tools/queue-selfcheck.js` (the "every field belongs to a question" assertion goes). Migration tools
  (`migrate-sheet.js`, `migrate-selfcheck.js`) know the old column set — check whether they must learn the new
  columns or are historical-only; say which in the commit.

## Locked decisions (grill, 2026-10-16 — do not re-litigate)

1. **Rows.** No question bar. Every day in the list (14, newest first, "Show 14 more days" kept) shows: date +
   cycle day, **Temp** box, **Time** box, **Symptoms** button, and beneath them **one line, comma-separated,
   of everything else the day holds** — e.g. `bleeding, sore breasts, egg-white mucus, cramps, mood anxious,
   irritable, excluded, day 1, note: slept badly`. This line replaces ca12's summary line. Unsaved values stay
   highlighted, cleared ones say so, the row tints when changed and goes red on a bad temp (ca12 rules 1, 6).
2. **Picker.** Tapping Symptoms opens a panel sliding up from the bottom, covering most of the screen, sections
   stacked: **Flow · Mucus · Cervix (texture + position) · Breasts · Arousal · Yes/no (Acne, Cramps,
   Penetration, Protected) · Mood · Reading quality (off-time, disturbed, Exclude) · Markers (Ovulation, Day 1)
   · Note**. A **Done** button pinned at its bottom. Every tap is an unsaved edit immediately (a draft, same as
   typing a temp); Done only closes. **No cancel** — the save bar's Discard already undoes. The panel always
   opens showing the day's current state (sheet + draft), before or after a save; unpicking a saved value clears
   it on the next save.
3. **Kept rules inside the picker:** tap buttons not `<select>`s; ca5's unknown sheet value stays shown and
   selectable; off-time/disturbed pre-tick Exclude; bleeding after a clear stretch pre-ticks Day 1 via
   `suggestCycleStart()`, shown as "day 1 (suggested)"; nothing suggests Ovulation; queued values shown as "not
   sent yet: …", never merged (ca12 rules 5, 7).
4. **New fields** (all single taps, no severity unless stated):
   - **Arousal**: none / low / med / high (single choice).
   - **Acne, Cramps, Penetration, Protected**: yes/no.
   - **Protected depends on Penetration**: greyed out until Penetration is ticked; unticking Penetration unticks
     Protected. The sheet can never hold Protected without Penetration.
   - **Mood**: multi-select. Built-in: happy, calm, sad, anxious, irritable, angry, teary, low.
5. **"+ add" for Mood only.** A text box at the end of the Mood section adds a new option and picks it for that
   day. Stored **lowercase, trimmed, no commas** (a comma would split it in the stored list), refused if it
   duplicates an existing option. **Remembered via the sheet**: the Mood options are the built-ins plus every
   mood found in the loaded rows' Mood column. No separate list, no local storage. Accepted consequences: a
   typo becomes an option until fixed in the sheet; an added mood never saved on any day vanishes.
6. **Storage: one sheet column per field** — `Arousal`, `Acne`, `Cramps`, `Penetration`, `Protected`, `Mood`.
   Acne/Cramps/Penetration/Protected join `FLAG_COLS` (checkboxes). Mood is a comma list (`anxious,
   irritable`) and joins `TEXT_COLS` (typed by Mike, so it gets Note's RAW protection). Old rows simply have
   these blank. **Mike's manual step**: add the six headers to the sheet and redeploy the Apps Script; the
   instructions must say so plainly, in order, before the app ships (the app writing a column the sheet
   lacks is refused, not lost — but say so).
7. **Dashboard (Tirzah's surface — deliberate exception to "changes only for correctness", Mike 2026-10-16).**
   The log table's Cervix, Pos, Mucus and Breasts columns become **one Symptoms column** listing everything for
   the day, comma-separated, **all symptoms shown to her including Penetration/Protected**. The chart tooltip
   lists the same. Flow, Quality, Exc, Phase, Note columns are untouched.

## Risks this work must not create

- **Losing an edit silently** — opening/closing the panel, a refresh, a flush or a redraw must rebuild from the
  drafts (ca12's rule). The panel being open counts as nothing special: the `hasEdits()` gate is what matters.
- **A Protected-without-Penetration row** from any path (picker, queue merge, re-read of an old row). A sheet
  row that already holds it is shown as-is, not silently rewritten.
- **The new columns missing from the sheet** must surface as a visible "NOT saved — unknown-column: …", never a
  queued retry loop. Check what `postEntry()`/queue does with that error today.
- **Tirzah** — the panel and Log never render for a reader; her table must still fit the phone.

## Exit criteria

- All self-checks pass via `checks.bat`, Log parts rewritten, covering at least: every field reachable from the
  row or the picker; the row line lists every field; Protected greys/clears with Penetration; an added mood is
  lowercased, comma-refused, de-duplicated, and reappears from sheet data after a reload; a multi-day save
  still reports per day and re-reads once; the dashboard Symptoms column. New checks mutation-tested red first.
- `verify-proxy` proves a flag write and a Mood write (including one starting with `=`) to the new columns.
- **Live test is Mike's**, on his phone: temps on 3 days, symptoms on 2 of them including a new mood, one save;
  reopen a saved day's picker and unpick something; confirm the sheet columns and Tirzah's Symptoms column.

## Builds on

ca12 (the screen being reshaped), ca5a (RAW text writes), ca6/ca6a (queue), ca10/ca11 (`postEntry()`). Worth a
review afterwards covering `dbc3775..HEAD`, which also covers the never-reviewed ca12 screen.
