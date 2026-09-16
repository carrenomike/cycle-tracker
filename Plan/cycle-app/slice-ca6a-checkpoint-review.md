# Slice ca6a — Checkpoint review of `db5a8ee..HEAD` (ca5a + ca6)

## Scope

Not a feature. A code review of everything committed since the marker in `STATE.md`, which is ~1,060 lines across
`index.html`, `Apps Script/Code.gs`, `Tools/render-selfcheck.js`, `Tools/verify-proxy.js` and the two new files
`Tools/queue-selfcheck.js` and `Tools/page-harness.js`. Under the 1,500-line trigger, but ca6 changed shared code
every other screen runs through, which is the other half of the checkpoint test.

Range read: `git diff db5a8ee..HEAD -- . ':(exclude)Plan' ':(exclude)Docs'` — 1,061 insertions, 89 deletions
across `index.html` (442), `Tools/queue-selfcheck.js` (306, new), `Tools/render-selfcheck.js` (148),
`Tools/page-harness.js` (93, new), `Tools/verify-proxy.js` (77) and `Apps Script/Code.gs` (84).

## Why this exists — the shared surfaces ca6 touched

These are the review targets. Each is a place where ca6 changed something other slices depend on.

1. **`saveEntry`'s failure path is now three-way**, where ca5 had one: refusal → `NOT saved`, queued → form closes
   and the banner takes over, storage refused → `NOT saved, and this phone would not keep it`. Confirm the third
   really is reachable and really says something a person can act on, and that the `finally` still clears
   `_saving` on all three.
2. **`render()` has two exits and both grew a line.** This is the exact shape of the ca4a bug — a path the checks
   skipped. `render-selfcheck` covers both now; confirm nothing *else* was added to one exit only. Grep for
   anything appended to one and not the other since ca5.
3. **`writeWarnings` / `describeValues` / `isRefusal` were factored out of inline code** in the ENTRY block and
   are now called from three places (`saveEntry`, `flushQueue`, `discardQueue`/`confirmText`). Confirm the
   extraction did not change the wording ca5a shipped, and that `confirmText` still lists exactly the diff.
4. **`escHTML` on the queue path.** Sheet text reaches the banner and the day card through `describeValues`.
   ca5a lost a log row to an unescaped `<` in a Note; confirm a Note containing `<`, `&` or a quote is safe in
   both the banner line and the `not sent yet:` span.
5. **The flush interacts with three other loops** — the 10-minute refresh, ca7's self-reload, and `loadData()`'s
   own callback, which now calls `flushQueue()`. Confirm no path can re-enter `flushQueue` while one is running
   (`_flushing` is the only guard), that a flush cannot fire while `_saving`, and that `loadData()` called from
   the end of a flush cannot start another flush that starts another read.
6. **The `_openDate` rule.** ca5a fixed an open card silently pausing refreshes forever. ca6 adds a second thing
   that defers to `_openDate`. Confirm the 30-minute nag still fires and that a manual flush with a card open
   genuinely does not re-render.
7. **ca5a's own fixes have never been reviewed by any slice** — the advanced Sheets service write, the
   `SpreadsheetApp.flush()` ordering, the sticky columns, the ISO date guard. They are in this range. Read them.

## Locked decisions

- The ca6 design decisions are settled and are not re-litigated: own storage key, merge per date, never queue a
  refusal, Discard is the only other exit, banner uncapped and not dismissible, writer-only.
- Findings too large to fix here become a new numbered slice. Findings deliberately not fixed go to STATE's
  open-deviations section with the reason.

## Dependencies

ca5a and ca6, both committed.

## Findings

Four defects fixed, two recorded. No finding was large enough to promote to its own slice.

### 1. A save during a flush silently dropped the edit it had just queued

`saveEntry` guarded on `_saving` only. A manual flush is *deliberately* allowed to run with a card open, so the
form's Save button is live while one is in flight. Saving into that window: `queueEntry` merges the new fields into
the entry the flush is already sending, and the flush's own `_queue.filter(q => q.iso !== e.iso)` then drops the
merged entry whole on the `ok:true` it was waiting for. The 97.99 the person just typed is gone, with nothing on
screen to say so — the exact loss class ca6 exists to prevent. Fixed with one guard in `saveEntry`
(`if (_flushing) return setSaveStatus('Still sending earlier entries…')`), which is where all three callers of the
write path route through. Target 5 asked whether `_flushing` was the only guard needed; it guards the wrong
direction on its own.

### 2. A landed flush left "not sent yet" on the day cards

`redrawAfterQueueChange` swaps the banner alone when a card is open — correct, a re-render would wipe the form —
but the `.unsent` span lives on each day card's summary line, not in the banner. After a successful manual flush
the spans still claimed unsent work *and the banner that contradicted them was gone*, since a clean flush leaves no
note. Two parts: the span now carries `data-iso` and `refreshQueueBanner` removes the ones no longer queued; and a
flush that sends anything while a card is open leaves a note saying the days behind the form have not been re-read
(nothing on that path calls `loadData`, by design).

### 3. `escHTML` did not escape quotes

Target 4's root cause, and wider than the queue. `escHTML` covered `< > &` only, and `entryFormHTML` uses it on
*attribute* values — `<input value="…">` and `<option value="…">`, the latter fed by whatever the sheet holds for a
select column (ca5 deliberately keeps an unrecognised migrated value selectable). A migrated cell containing `"`
closed the attribute early. Fixed in the shared helper: `"` and `'` are escaped too. Entities render as the
character in text content, so every other caller is unaffected.

### 4. An unsent queue was invisible whenever the role had not arrived

`queueBannerHTML` and `flushQueue` gated on `_role !== 'writer'`, and `_role` is only ever set from the display
cache or a live read. `saveQueue` itself deletes that cache to make room. So: writer, offline, cache dropped →
role `null` → the banner is suppressed, the manual flush is unreachable, and with no cache at all the screen is
`showError`, which had no banner on it in the first place. Gated on `_role === 'reader'` instead (a reader can
never hold a queue — a refusal is never queued), and `showMessage` now carries the banner above every message
screen.

### Recorded, not fixed

- **A Note cell that already holds a formula is normalised to its result, not recovered.** `writeRow`'s
  read-patch-write reads the row with `getValues()`, which returns `2` for `=1+1`; the RAW write then stores the
  text `"2"`. ca5a's fix stops *new* formulas, so this only affects a cell broken before it shipped, and turning
  `2` into `"2"` is closer to right than leaving a live formula. Not worth a `getFormulas()` read on every write.
- **`unreadableDates` under-reports.** The date scan `break`s on the matched row, so odd date cells *below* the row
  being written are never seen. The warning is a prompt to go and look at the sheet, and one odd cell is enough to
  send you there.

### Cleared

Targets 1, 3, 6 and 7 are clean. The three-way save failure is reachable and all three branches leave `_saving`
cleared by the `finally`; the extracted `describeValues` is character-for-character the wording `confirmText`
shipped in ca5, and `confirmText` still receives the diff and nothing else; the 30-minute nag fires through
`setHint` into the open form and `openDay` resets the counter; `writeRow`'s ISO guard, `a1Col`/`quoteSheet`, the
`SpreadsheetApp.flush()` ordering and the boolean `false` for an unticked flag all read correctly and are covered
live by `verify-proxy`'s new checks. Target 5's three loops terminate: `loadData` → `flushQueue` → `loadData` is
bounded because entries only ever leave the queue, so a fully-failing queue costs one extra attempt per read and
no more.

## Checks added

Five, each mutation-tested by reverting its fix and confirming the check goes red:

- `queue-selfcheck`: a save during an in-flight flush is refused in words and never reaches the network. The flush
  reply is held open by the stub and everything after it is refused, so the save really does land mid-flush and
  really does fail — the only shape in which the old code lost the edit.
- `queue-selfcheck`: a flush that lands behind an open form says the list is older than the write.
- `render-selfcheck`: the unsent span carries `data-iso`, the hook the span removal needs.
- `render-selfcheck`: a quote in a sheet value stays inside the attribute.
- `render-selfcheck`: an unsent entry is shown before the role is known.

`page-harness` gained a `document.querySelectorAll` that answers `[]` — the stub has no element tree, so the span
removal itself cannot be checked offline; that one is Mike's live pass. The markup contract that makes it possible
is what the offline check pins.

First attempt at the flush-interleave check was a false green: with the guard removed the check `await`ed a promise
nobody would resolve, the event loop emptied and node exited 0 before any remaining assertion ran. Reshaped so
both paths return. Third green-that-could-not-go-red in this plan — mutation-testing is what caught it, again.

## Exit criteria

- All seven self-checks pass, and any new check added here fails if the bug it covers is reintroduced —
  mutation-test it, per ca4a. A green assertion that cannot go red has now happened twice in this plan.
- Every finding fixed, promoted, or recorded.
- **Live test is Mike's.**
