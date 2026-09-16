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

## Added by ca6 (2026-09-15)

- **"Stuck queue" on the failure-path list now has an owner.** ca6 built it: `cycleQueue`, the persistent
  non-dismissible writer-only banner, and `Tools/queue-selfcheck.js`. Review it as ca6 left it. The paths worth
  re-reading by hand rather than trusting the check: storage refusing `setItem` (the only failure in this app that
  loses real work), and an entry that is refused *after* it is already queued — it stays by design, so confirm the
  banner still offers a way out and does not simply sit there forever.
- **New invariant for the review to hold everything else against:** `ok: true` from `doPost` means the request was
  accepted, not that the sheet holds what was sent. Anywhere the client treats a write reply as a copy of the row
  is a finding.
- ca6a reviews `db5a8ee..HEAD` first, so ca8 can take that range as read unless ca6a recorded an open deviation.
- **ca9 lands before this slice** and is not covered by ca6a: a service worker is the one thing in this app that
  can pin a phone to an old version of the safety engine while `deploy.bat` reports success. Review it as a
  deploy-path risk, not only as a feature — confirm the page is network-first and that nothing from `/exec` is in
  the worker's cache.

## Added by ca6a (2026-09-15)

- **`db5a8ee..HEAD` is reviewed.** Take it as read except for the two open deviations ca6a recorded in `STATE.md`
  (the formula-Note normalisation and `unreadableDates` under-reporting) — both are accepted, so confirm nothing
  later came to depend on them being otherwise, and do not re-fix them without asking.
- **Two of ca6a's four defects were guards that were right about one direction and silent about the other**
  (`_flushing` blocked a second flush but not a save into one; `_role !== 'writer'` excluded an unknown role along
  with a reader). Both read correctly in isolation. When reviewing a guard, ask which states it lets *through*.
  This is the likeliest shape of a remaining cross-slice defect.
- **Two things are still only pinned offline by a markup contract, not by behaviour:** the removal of a stale
  `not sent yet` span (the harness has no element tree, so `querySelectorAll` answers `[]`) and everything
  downstream of `escHTML` inside an attribute. Both are on Mike's live list; if they are still unconfirmed when
  ca8 runs, they belong on its end-to-end pass.

## Added by ca9 (2026-09-15)

- **ca9 has landed**, so the deploy-path risk ca6 flagged above is now a concrete thing to read: `sw.js`. The check
  that matters is not "is there a worker" but **the order of network and cache for `index.html`**. Cache-first there
  and `deploy.bat` reports success while the phone keeps running an old safety engine, with nothing on screen to
  say so. `Tools/offline-selfcheck.js` pins the order; confirm no later change loosened it.
- **`showMessage()` now draws a writer-only surface.** The error screen answers the Log tab with the full entry
  form. Per ca6a's lesson about guards, ask which states it lets *through*: it is gated on `_role === 'writer'`,
  and `_role` can now come from `localStorage` rather than from a live read.
- **New key `cycleRole` outlives the token that earned it.** `not-configured` / `no-access` clear it, and that is
  the only thing standing between a revoked token and Tirzah's phone drawing an entry form over a refusal. Any new
  refusal code added later must clear it too — this is exactly the shape of cross-slice defect ca8 is for.
- **`redraw()` replaced every `render(allCycles)` call site.** One shared helper on five paths, added late. Confirm
  none of them wanted the old unconditional behaviour, and that no path added after ca9 calls `render()` directly.
- ca9a reviews `55db0c4..HEAD` first; take that range as read unless ca9a records an open deviation.
