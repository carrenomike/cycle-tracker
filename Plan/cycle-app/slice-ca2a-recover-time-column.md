# Slice ca2a — Recover the dropped Time column (stub)

## Why this exists

ca2 migrated the old sheet and reported "nothing lost". It was wrong. The old sheet had a `Time` column holding
the time each temperature was taken, across all cycles, and **not one value came across**. Mike caught it on
2026-09-14, after ca3a had already deleted the now-blank column from the log table.

This is real data loss in landed work, so it gets its own slice rather than a patch inside another one.

## Root cause — three failures, not one

1. **The spec omitted it.** `slice-ca2-*.md` enumerates the new schema and `Time` is simply not in the list. The
   column was never coded out; it was never coded in. `migrate-sheet.js` contains no reference to `r.Time`.
2. **`verify()` could not catch it.** It compares temperatures, Day-1 dates, ovulation markers, Exclude flags,
   bleeding days and notes — all columns that exist in the *new* schema. A source column with no destination is
   structurally invisible to it, so the script truthfully reported OK on the six things it looked at and the
   "nothing lost" claim went into STATE unchallenged.
3. **The archive log justified it after the fact.** "`Time` was empty on every row" was written into the ca2 entry
   and nothing in the code ever established it. ca3a then read that line, believed it, and deleted the display
   column — fixing the symptom and removing the last visible evidence.

The generalisable defect is #2: **the migration is allowlist-shaped with no warning for an unmapped source
column.** Any other column the old sheet carried and the log did not happen to list is gone the same way, and
nobody would know. That guard is part of this slice, not an optional extra.

## Scope

- Recover the real `Time` values and get them into the new sheet, aligned by date.
- Add `Time` to the ca2 schema and to whatever surfaces should show it.
- Add the unmapped-column guard to `migrate-sheet.js` so this class of loss fails loudly next time.
- Re-run the loss audit against the old sheet for **every** source column, not just `Time`.

## Constraints

- **Do not re-share the old sheet.** Its ID has been in the public repo since the first commit, so widening its
  access to let `migrate-sheet.js` read it anonymously reopens exactly the hole ca3 closed. The old sheet stays
  Restricted. Mike exports it from the browser while logged in instead.
- **The export holds personal health data and this repo is public.** It lives outside the repo, like ca2's TSV.
- The new sheet already holds 165 live rows and is the source of truth. This slice **adds a column to existing
  rows** — it does not re-run the migration over the top of them. A full re-paste would discard anything logged
  since, and would re-run every ca2 judgement call that Mike has since reviewed by hand.
- Times must be matched to rows **by date**, and a date in the export with no matching row in the new sheet is a
  finding to report, not a row to silently create.

## Open questions for Mike

- Was `Time` populated on every row, or only some? (The export answers this; do not assume either way.)
- Should `Time` be visible on Tirzah's screen, or is it writer-only? Her surfaces change only for correctness or
  safety reasons, and a temp-taking time is arguably neither.
- Does `Time` feed ca5's `Temp Quality = off-time` flag automatically, or stay a plain record?

## Exit criteria

- No typecheck, test or build exists in this project. Headless checks only, stated in the STATE line.
- Headless: every `Time` value in the export is either written to the matching row in the new sheet or reported;
  the count written plus the count reported equals the count in the export. No date invented, no row created.
- `migrate-sheet.js` warns on any source column it does not map, and the warning is demonstrated to fire.
- A full column-by-column audit of the old sheet against the new one is written into the archive log, so the
  "nothing lost" claim is backed by something this time.
- **Live test is Mike's**, on his phone: the times appear against the right dates.
