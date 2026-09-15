# Slice ca5a — Checkpoint review of `5d08ce9..HEAD` (ca5) (stub)

## Scope

Read-and-verify only. No new features. ca5 is the first slice that **writes** to the sheet and the first that gave
`render()` two exits, so this checkpoint exists for the same reason ca4a did: the self-checks all pass and that is
not the same as the code being right.

Fix what this review finds, in this slice. Anything that turns out to be a feature request goes to a later slice,
not here.

## Why now

ca5 is +987/−15 outside `Plan/` and `Docs/` — under the ~1,500-line trigger, but it answers **yes** to the other
half of the rule: it reworked `render()`, changed the shape of the display-cache record and `writeCache`'s
signature, and added the first code path that can modify the source of truth. ca6 builds a queue directly on top
of all three.

## Verified facts (confirmed 2026-09-15, re-confirm before trusting)

- `render(cycles)` now sets `allCycles = cycles` at the **top** and has an early return for
  `_tab === 'log' && _role === 'writer'`, which tears down both charts and renders `bannerHTML() + tabBarHTML() +
  entryScreenHTML()`. The dashboard exit is unchanged apart from `tabBarHTML()`.
- `doPost` in `Apps Script/Code.gs` is the only writer. It checks `body.t !== WRITER_TOKEN` server-side, takes a
  `LockService` script lock, and calls `writeRow(date, values, del)` which updates the row matching the date,
  otherwise inserts one **before the first later-dated row**, otherwise appends.
- `Tools/verify-proxy.js` proved live on the real sheet 2026-09-15: reader refused (`read-only`), backdated row
  inserted in order, a second write to the same date `updated` rather than duplicated, untouched columns survived,
  sentinel deleted, row count restored. **All checks passed.**
- POST CORS from GitHub Pages works with `Content-Type: text/plain`. This was ca5's stated first unknown; it is
  now answered and Mike confirmed the app saves from his phone.

## Review targets

1. **`render()`'s two exits.** Every `render()` caller and every piece of state it used to set on the way out.
   `allCycles` moved to the top — check nothing depended on it being set *after* the dashboard string was built,
   and that `currentDayNumber`, `selectedLogCycle` and `_dataWarnings` are correct on the log exit, where the
   dashboard half never runs. ca4a's bug was exactly this class: a `render()` path nobody executed.
   `Tools/render-selfcheck.js` runs the whole page script — make it render the **log** exit too, or this target is
   re-created rather than closed.
2. **Chart teardown.** The log exit destroys `timelineChart` and `overlayChart`. Confirm switching
   Dashboard → Log → Dashboard rebuilds both, that nothing else holds a reference to a destroyed chart, and that a
   refresh landing while the log tab is open does not leave a chart pointing at a removed canvas.
3. **The write endpoint's read-patch-write.** `writeRow` reads the whole row, patches the named columns and writes
   it back. Between the read and the write the lock holds — but check what happens to a column holding a formula,
   a date, or a checkbox that is `FALSE` rather than blank, and confirm nothing in the round trip re-formats a
   Temp or a Time. `FLAG_COLS` writes booleans; every other column writes a trimmed string.
4. **Insert-in-date-order.** `insertAt` is the first row dated later than the new one. Check the comparison is
   sound for a sheet where `Date` is a real Date in one row and a string in another (both occur), and that the
   "no later row" path really appends rather than overwriting `getLastRow()`.
5. **The cache record grew a field.** `{proxy, at, role, cols, rows}` and `writeCache(cols, rows, role)`. Check
   every reader of that record — `readCache`, `cacheIsUsable`, `failLoad` — and confirm a record written by the
   *previous* version (no `role`) still loads rather than hiding the Log tab forever. Check `_role` can never be
   promoted from a stale cache to something the server would not grant.
6. **Refresh suppression.** The 10-minute refresh is skipped whenever `_openDate` is set. A card left open pauses
   every refresh indefinitely — including the staleness banner and the safety verdict. Decide whether that is
   acceptable or needs a ceiling, and make the skip visible somewhere better than `console.log`.
7. **The entry form against the real schema.** Open a migrated row of each awkward kind — one with no Temp, one
   with a `cervix: …` note, one with an Ovulation marker, one with a mucus value the option list does not contain
   — and confirm saving an unrelated field changes only that field. `entryDiff` is the guard; verify it against
   the sheet, not only against the self-check's fixtures.
8. **The log table's four new columns.** ca3a required them; check they are readable on the S22 Ultra and that
   nothing that should be hidden on a narrow screen now forces a horizontal scroll. Mike's eyes, not a grep.

## Exit criteria

- No typecheck, test or build exists in this project.
- Every self-check PASSes, including whatever `render-selfcheck` gains for the log exit.
- `Tools/verify-proxy.js` re-run against the real sheet.
- Each target above resolved in writing — fixed, or explicitly cleared with the reason.
- **Live confirmation is Mike's.**
