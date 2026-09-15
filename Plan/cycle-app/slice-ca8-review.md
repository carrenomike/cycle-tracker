# Slice ca8 — Review the whole plan (stub)

## Scope

Not a feature. `/code-review` over the committed diff of every prior slice (`git diff 1065c1e...HEAD`), fixing what
it finds and adding the checks that missed it.

## Locked decisions

- Runs only once every other slice is done and committed — the review needs a settled diff.
- **Cross-slice defects are the point**: shared helpers reused beyond the assumptions of the slice that wrote them,
  guards one slice relaxed that a later one depends on, and drift between what the Apps Script returns and what the
  client parses.
- A finding too large to fix here becomes a new numbered slice, not a TODO in the log.
- Findings deliberately *not* fixed are recorded as accepted risk in STATE's open-deviations section.
- **Two things get read on purpose regardless of what the review surfaces**, because they are the plan's real risk:
  1. **The safety engine.** Confirm against the real data that no ovulation marker still means the post-ovulation
     window never opens, that three-over-six can only delay it, that the three-over-six baseline six days do not
     overlap the three high days, and that rule 1 keys off the opening bleed run only. Regression target:
     d24 / d22 / d30 / d37 / never.
  2. **Every failure path.** Bad token, missing token, network failure, quota rejection, malformed response, failed
     write, stuck queue, stale cache. Each one must produce something a person can see. A silent swallow anywhere is
     a finding, not a nitpick — this project has repeatedly lost time to exactly that.
- Also confirm nothing secret reached the public repo: no tokens, no new sheet ID in source if slice 3 kept it out.

## Dependencies

Every earlier slice, landed and committed.

## Exit criteria

- No typecheck, test or build exists in this project.
- Every finding is either fixed, promoted to a new numbered slice, or written into STATE's open-deviations section
  with the reason it was not fixed.
- **Live test is Mike's**, on both phones, over the whole app end to end.

## Added by ca7 (2026-09-14)

- Two of the failure paths on the list above changed shape in ca7, so review them as ca7 left them, not as the
  earlier slices described them:
  - **Quota rejection.** The 20s timeout no longer claims a quota — it says only that nothing came back. The quota
    wording now exists only where the server actually reports it (`read-failed:` out of `Code.gs`). Confirm no
    other message asserts a cause it has not observed; that was ca3b's lesson and it is the easiest one to undo.
  - **Stale cache.** ca7 owns it: `cycleCache`, the dismissible staleness banner, and the 3-day "Out of date"
    override. `Tools/staleness-selfcheck.js` covers the rules and `Tools/render-selfcheck.js` (ca4a) now renders
    the card for real, so the wiring is covered too — but neither runs the *cached* path with `_staleInfo` set.
    Check the "Out of date" card by hand, with the phone offline for more than three days.
- **New failure path to add to the list: the self-reload.** On a first-load timeout ca7 calls
  `location.replace(pathname + '?v=<now>')` once per tab to escape a cached page pointing at an archived `/exec`.
  Confirm it cannot loop (it is gated on `sessionStorage.cycleSelfRefreshed` and on no successful load having
  happened), and that a genuinely offline phone still lands on the cached dashboard rather than a reload cycle.
