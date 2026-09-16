# Slice ca9a — Checkpoint review of `55db0c4..HEAD` (stub)

## Why this exists

The README's checkpoint rule asks two questions. The diff is only ~570 lines, well under the 1,500 threshold — but
the answer to the second is **yes**: ca9 changed a shared helper on five call sites, gave an existing helper a new
and much larger job, and added a stored fact that outlives the token that earned it. That is the profile that
produced every defect ca4a, ca5a and ca6a found.

## Scope

`/code-review` over `git diff 55db0c4..HEAD` — ca9, plus the two commits before it that no review has covered
(`4d34d21` `verify.bat`/`SETUP.md`, `100f907` the ca9 stub).

## Read these on purpose, whatever the review surfaces

1. **`redraw()` and its five call sites** (`switchTab`, `openDay`, `showMoreDays`, the offline save in
   `saveEntry`, `redrawAfterQueueChange`). Every one of them used to be an unconditional `render(allCycles)`. The
   new fallback repeats the last message instead. Ask, for each: is repeating the message right there, or did that
   path want to fail loudly? And confirm nothing calls `render()` directly any more.
2. **`showMessage()` now draws the entry form.** It went from "one paragraph and maybe a Retry button" to a
   surface that can save real data. Per ca6a's lesson, ask which states the `_role === 'writer'` gate lets
   *through*, and what `entryScreenHTML(allCycles || [])` does with `[]` beyond the one case ca9 checked.
3. **`cycleRole`.** It is the first thing in this app that remembers an authorisation decision across a boot with
   no server contact. Trace every way `_role` can become `'writer'` and every way it is cleared. `not-configured`
   and `no-access` clear it; confirm there is no third refusal shape, in `Code.gs` or the client, that should.
4. **`sw.js` as a deploy-path risk.** Network-first for the page, nothing from `/exec` in the cache. This is the
   one file in the project that can make `deploy.bat` lie.
5. **`Tools/page-harness.js` gained `parentNode`.** It is shared by three self-checks. A stub that answers more
   than the real DOM would is how a check goes green on something that cannot work.

## Also

- ca6a's live pass and its `verify-proxy` run are **closed** (2026-09-15), and ca9's phone pass is confirmed on
  `f9ab1a7`, deploy-then-reopen included. **Tirzah's aeroplane-mode check from ca7 is still outstanding** — and
  ca9 changed what she sees on a cold start, so it now covers ca9 too: dated dashboard, no tab bar, no entry
  form. List it for Mike rather than assuming it passed.
- ca10 was stubbed out of this session: a write landed and was reported as failed, because the app does not retry
  the flaky Apps Script hop that `verify-proxy` has retried since ca5. It is not in this review's range, but the
  asymmetry it names — a timeout is not evidence either way — is worth holding every failure path against.
- Findings too large to fix here become a numbered slice; findings deliberately not fixed go to STATE's open
  deviations with the reason.

## Exit criteria

- Every finding fixed, promoted, or recorded as accepted risk.
- Every check added for a finding is mutation-tested red first (ca4a's rule, and ca6a found a false green anyway).
- All self-checks PASS.
- Live test is Mike's.
