# Slice ca3b — checkpoint review of the ca2a range

**Range:** `3ee13e2..HEAD` (ca2a). 137 insertions, 5 deletions across `index.html`, `Apps Script/Code.gs`,
`Tools/migrate-sheet.js`, `Tools/verify-proxy.js`, and the new `Tools/migrate-selfcheck.js`.

## Why this exists

Not size — 137 lines is small. The wrap-up rule's other trigger: **ca2a changed a shared helper that every value
in the app passes through.** `cell()` in `Code.gs` is the single flattening point for every cell of every column
on read, and ca2a added a branch to it that keys off a Date's year. A wrong branch there is not a Time bug, it is
a bug in every column at once.

The second reason is the session ca2a came out of. A claim nobody verified ("`Time` was empty on every row") sat
in the archive log for two slices, and ca3a acted on it and deleted real evidence. This review is the check that
ca2a's own fixes are not carrying a similar assumption.

## Review targets, in priority order

1. **`cell()`'s 1900 cutoff.** The branch assumes any Date before 1900 is a time-of-day and anything later is a
   calendar date. Confirm from the actual sheet that no column can hold a genuine pre-1900 date, and that a
   Date carrying *both* a date and a time (which would now format as one or the other, losing half) cannot occur
   in any column. Check the spreadsheet's timezone too: `formatDate` renders in `tz`, and a time stored as an
   epoch-day Date is timezone-sensitive in a way a plain date is not — verify 6:32 AM does not arrive as 5:32 AM.
2. **`fmtTime` vs `cell()` — two formatters, one column.** `migrate-sheet.js` writes `h:mm AM` from gviz's
   `[h,m,s,ms]`; `Code.gs` renders `h:mm a` from a Date. Confirm the two agree on midnight, noon, and a
   single-digit minute, or a re-migration will silently disagree with the live read.
3. **`SOURCE_COLS` as a gate.** It fails the migration on an unlisted column. Check the failure is reachable and
   legible — and that nobody can satisfy it by adding a name to the list without adding a destination, which
   would recreate the original bug with a passing check on top of it.
4. **`hasData` and the placeholder rule.** Both now count `Time`. Confirm the two lists agree with each other and
   with `NEW_COLS`; they are three separate enumerations of "what a logged day can hold" and nothing binds them.
5. **`verify-proxy`'s hardcoded `times: 88`.** It is correct today and becomes wrong the first time Mike logs a
   new time through ca5. Decide now whether it should be a floor rather than an equality.

## Exit criteria

- Each target above either fixed or explicitly dismissed in writing, with the reason.
- Every claim in this review's findings traced to code or to data actually read — no assertion about the sheet's
  contents that was not measured. This is the rule ca2 broke.
- `adapter-selfcheck`, `migrate-selfcheck` and `verify-proxy` all pass.
- STATE marker moved to the reviewed commit; findings that belong to later slices pushed onto their stubs.
