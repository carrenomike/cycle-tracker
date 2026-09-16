# Slice ca6a — Checkpoint review of `db5a8ee..HEAD` (ca5a + ca6) (stub)

## Scope

Not a feature. A code review of everything committed since the marker in `STATE.md`, which is ~1,060 lines across
`index.html`, `Apps Script/Code.gs`, `Tools/render-selfcheck.js`, `Tools/verify-proxy.js` and the two new files
`Tools/queue-selfcheck.js` and `Tools/page-harness.js`. Under the 1,500-line trigger, but ca6 changed shared code
every other screen runs through, which is the other half of the checkpoint test.

Start with `git diff db5a8ee..HEAD -- . ':(exclude)Plan' ':(exclude)Docs'`. Expand this stub into a full spec
before writing any code, per the ground rules.

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

## Exit criteria

- All seven self-checks pass, and any new check added here fails if the bug it covers is reintroduced —
  mutation-test it, per ca4a. A green assertion that cannot go red has now happened twice in this plan.
- Every finding fixed, promoted, or recorded.
- **Live test is Mike's.**
