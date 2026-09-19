# Slice ca12 — Log by question, across days

## Scope

Rebuild the writer-only Log tab so Mike can answer **one question across many days**, then the next question,
then save every changed day at once. Replaces ca5's one-open-card-at-a-time form outright. The sheet side
(`doPost` in `Code.gs`) does not change. Tirzah's screen does not change.

## Why (Mike, 2026-09-19)

Tirzah often reads all the temperatures at once, then Mike asks about breasts across the days, then the other
symptoms. The ca5 screen forces one day at a time, start to save. Three concrete complaints:

1. **The day summaries hide symptoms.** `daySummary()` prints Temp/Time, Flow, Mucus, Temp Quality, Exclude,
   Ovulation, Day 1 — never Breasts, Cervix Texture, Cervix Position or Note.
2. **An open day is taller than the phone.** `entryFormHTML()` stacks all 12 `ENTRY_FIELDS` with Save at the
   bottom.
3. **One day at a time.** `_openDate` holds one date; `saveEntry(iso)` writes one date.

## Verified facts (2026-09-19, from the code at `dbc3775`)

- `_openDate` is not only the open card. It is also the **"Mike is mid-edit" gate** for: the 10-minute refresh
  skip + nag (`index.html` ~2802, `_skippedRefreshes`, `REFRESH_NAG_AFTER`), the boot/online auto-flush
  suppression (`flushQueue`: `if (_openDate && !manual) return`), the post-flush reload (`if (sent && !_openDate)
  loadData()`), the "list is older than the write" note, and `refreshQueueBanner()` swapping only the banner.
  **Every one of those must move to the new gate** ("there are unsaved edits"), not be dropped.
- `onFlowChange()` / `onQualityChange()` read the live DOM by `f<index>` ids of the single open form.
- `entryDiff()`, `entryProblem()`, `sheetValue()`, `sameTemp()`, `confirmText()`/`describeValues()`,
  `suggestCycleStart()`, `queueEntry()`, `queuedFor()`, `postEntry()` are all per-date and pure or near-pure —
  **reuse them unchanged**; the new screen is a loop over dates around them.
- `saveEntry()` holds the ca6a guard (refuse while `_flushing`), the three-way failure (refusal → "NOT saved";
  queued; could not queue → "do not close the app"), `writeWarnings()`, `_savedNote`, and the re-read via
  `loadData()`. The multi-day save must keep every one of those per day.
- Self-checks that drive the old screen: `Tools/render-selfcheck.js`, `Tools/entry-selfcheck.js`,
  `Tools/queue-selfcheck.js` (they call `openDay`/`entryFormHTML`/`saveEntry`/`readForm`/`_openDate`).
  `checks.bat` runs all nine; `deploy.bat` refuses to push on any failure.

## Locked decisions (grill, 2026-09-19 — do not re-litigate)

Mike approved a throwaway phone mockup of this layout in chat; it is not in the repo and must not be added.

1. **Layout.** A row of question buttons at the top: **Temp · Flow · Mucus · Cervix · Breasts · Flags · Note**
   (Temp selected on arrival). Picking one gives **every day in the list** an answer control for that question
   only. Each day shows date, cycle day, and a **complete one-line summary of every field** (fixes complaint 1);
   values changed but unsaved are highlighted and the day row is tinted. Choice fields are **tap buttons**, not
   `<select>`s — one tap per answer. The catch-up range stays 14 days, newest first, with "Show 14 more days".
   - **Temp** = temperature box + time box, and beneath them the reading-quality flags **off-time**,
     **disturbed** and **Exclude**.
   - **Cervix** = texture row + position row. **Flags** = Ovulation + Cycle start (Day 1) only.
   - A value the sheet holds that the options do not know stays shown and selectable (ca5's rule), or a tap on
     that day would silently rewrite it.
2. **Save bar**, pinned to the bottom of the screen: "N days changed" · **Discard** · **Review and save**. Review
   lists every changed field per day (cleared fields say so — `describeValues()`), then **Save N days**. Replaces
   the browser `confirm()`.
3. **Saving = one send per day**, in date order, each through the existing `postEntry()` path (retries, phantom
   refusal confirm, `forgetRole()` all unchanged). A day that fails non-refusal goes to the existing queue via
   `queueEntry()`. The result is one plain line naming what happened, e.g. "Saved 3 days. Sep 17 not confirmed —
   kept to send later." A refusal stops the remaining sends (the next would refuse too) and says which days did
   not go. Then one `loadData()` re-read, not one per day. **No batch endpoint** — `Code.gs` untouched.
4. **Unsaved edits** live in memory only, per date, as a draft of the form values.
   - While any exist, the refresh skip/nag, flush suppression and "list is older" note apply exactly as they did
     for an open card (the `_openDate` gate above).
   - Switching to Dashboard and back keeps them.
   - Closing/reloading with any unsaved triggers `beforeunload` (Chrome's "Leave site?").
   - **No persisted drafts.** A second "not saved yet" pile next to the unsent queue is refused.
5. **Suggestions.** Ticking off-time/disturbed pre-ticks Exclude on that day (visible — same question). Setting
   Flow to bleeding after a clear stretch pre-ticks Cycle start via `suggestCycleStart()`, reading the drafts
   and the sheet for the neighbouring days. A suggested Day 1 shows as **"day 1 (suggested)"** in the summary and
   in the review list, untickable under Flags. Nothing ever suggests Ovulation.
6. **Bad input.** A day failing `entryProblem()` (bad temp, time without temp) turns its box red with the reason
   immediately; **Review and save refuses** and names the days to fix. No partial save that skips a bad day.
7. **Queued values** keep ca6's rule: shown on the day as "not sent yet: …", never merged into the controls,
   which show what the sheet holds.
8. **The old form is deleted** (`entryFormHTML`, `openDay`, `readForm`, the `f<index>` DOM ids, `_openDate`),
   not kept alongside. The self-checks that drove it are rewritten to drive the new screen.

## Risks this slice must not create

- **Losing an edit silently.** Any path that redraws the list (refresh, flush, `redraw()`, a tab switch) must
  rebuild controls from the drafts, never from the sheet row alone.
- **A save racing a flush** (ca6a): the multi-day save refuses while `_flushing`, and a flush does not start mid
  multi-day save.
- **Drafts outliving what they were diffed against.** A draft is compared to the sheet row at save time
  (`entryDiff(row, draft)`), so a re-read in between is harmless — keep it that way; never store a diff.
- **Tirzah.** Nothing here may render for a reader; `beforeunload` must never fire for her.

## Exit criteria

- All nine self-checks pass via `checks.bat`, with the Log-screen parts rewritten, covering at least: every
  field appears in a summary; switching question keeps other questions' drafts; a multi-day save with one
  queued failure and one refusal reports each day correctly and re-reads once; a bad temp blocks the save and
  names the day; the Day 1 suggestion is marked suggested; the mid-edit gate pauses refresh and auto-flush.
  New checks mutation-tested red first.
- `Code.gs`, `sw.js`, and the dashboard/reader surfaces are unchanged (diff proves it).
- **Live test is Mike's**, on his phone: temps for 3 days, then breasts across them, then one other symptom,
  one save; confirm the sheet and dashboard; confirm a typo'd temp blocks the save.

## Dependencies

ca5 (the screen being replaced), ca6/ca6a (queue + flush race), ca10/ca11 (`postEntry()`), ca9 (`redraw()`).
A **ca12a** checkpoint review follows it.
