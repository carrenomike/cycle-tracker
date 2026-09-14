# Slice ca7a — Checkpoint review of `24f6067..HEAD` (ca7) (stub)

## Why this slice exists

Not a feature. The README's step-6 check triggered on the second condition, not the first: ca7's diff is small
(~220 lines of `index.html` plus one new tool), but it **touched shared helpers and a safety invariant**. It added
`warn()` inside the `// >>> ADAPTER` markers that ca4 is about to edit, it put a third outcome on the Safe/Unsafe
card that ca4 is about to rewrite, and it replaced the whole read path that ca5 and ca6 build their write path
beside. Three large slices now sit between here and ca8; a defect in any of those three places would be carried
into all of them.

**This slice is skippable if Mike would rather go straight to ca4.** The judgement is his — it is a scheduling
call, not a correctness one, and the tally in STATE is nowhere near the 1,500-line threshold. If it is skipped,
say so in STATE's open-deviations section and let the marker carry ca7's lines forward into ca8.

## Scope

`/code-review` over `git diff 24f6067..HEAD` restricted to app code — `index.html` and `Tools/`. Fix what it finds
and add the checks that missed it.

## Targets — read these on purpose regardless of what the review surfaces

1. **The expiry override cannot be defeated.** In `render()`, the `Out of date` override sits after the
   Safe/Unsafe branch and does not read `_bannerDismissed`. Confirm by reading, not by trusting
   `Tools/staleness-selfcheck.js` — that check greps for variable names and would pass a rewrite that kept the
   names and broke the meaning. Specifically: can any path draw a cached dashboard older than 3 days that still
   shows `Safe`?
2. **`failLoad()` cannot show a cache to someone who should see a message.** `not-configured`, `no-access` and a
   missing `TOKEN` all return before the fallback. Confirm there is no fourth access-shaped failure that now falls
   through to a stale dashboard instead of ca3's explanatory message — a revoked token that the server answers
   some other way would be the dangerous one.
3. **The self-reload cannot loop and cannot fire on a live page.** `selfRefresh()` is gated on `_loadedOk` and on
   `sessionStorage.cycleSelfRefreshed`. Walk the offline case explicitly: aeroplane mode, first load, no cache —
   does it reload once and then land on the error message, or does it reload every time the page is opened? And
   confirm `location.replace(location.pathname + ...)` cannot strand a user who arrived with a `#t=` fragment
   before `bootstrapToken()` had stored it.
4. **The cache cannot take the token with it.** `writeCache`'s quota handler removes only `cycleCache`. Confirm no
   path calls `localStorage.clear()`, and that a `cycleCache` too large to store does not leave the app in a state
   where the token write also fails.
5. **`renderPayload()` is genuinely the only path to `render()`.** It is the one thing keeping the cached view and
   the live view identical. Grep for other `render(` callers.
6. **`warn()` inside the adapter.** It is unbounded — a sheet with many malformed rows produces a banner as long as
   the list. Decide whether that needs a cap. Also confirm `_dataWarnings` is cleared before every parse and cannot
   accumulate across the 10-minute refresh.

## Exit criteria

- No typecheck, test or build exists in this project.
- `node Tools/staleness-selfcheck.js`, `node Tools/adapter-selfcheck.js` and `node Tools/migrate-selfcheck.js` all
  PASS, and any check added by this slice PASSes.
- Every finding is fixed, promoted to a numbered slice, or written into STATE's open-deviations with its reason.
- **Live test is Mike's**, on his phone. Tirzah's one ask — aeroplane mode, confirm the banner and its date,
  dismiss, reload, confirm it is back — belongs to ca7 and is not repeated here unless this slice changes the
  banner.

## Dependencies

ca7 committed. Runs before ca4, because ca4 rewrites two of the places listed above.
