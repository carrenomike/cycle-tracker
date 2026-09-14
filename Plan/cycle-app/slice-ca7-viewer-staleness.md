# Slice ca7 — Viewer cache, staleness banner, 3-day expiry (stub)

## Scope

Make the viewer side honest about how old its data is. Tirzah's phone caches the last successful load, says so when
it is showing cached data, and stops showing a safety verdict once that data is too old to trust.

## Verified facts

- Slice ca3 already establishes the local storage and token handling this builds on.
- Chrome on Android has **no** Safari-style 7-day script-storage eviction, so the cache is not silently wiped and
  Add to Home Screen is convenience rather than load-bearing.

## Locked decisions

- Cache the **last successful load** and show it when a fetch fails, rather than showing nothing.
- The staleness banner **names the date** of the cached data. Vague wording like "may be out of date" is not enough.
- The banner is **dismissible**, but dismissal is **session-only** — it returns on the next open and on the next
  failed fetch, and it **does not cancel expiry**.
- **After 3 days, the Safe/Unsafe line is replaced by "Out of date".** A stale safety verdict is worse than none.
- These are **viewer-only** surfaces. Mike's build shows the Log tab and the unsent-queue banner instead.
- The app is otherwise **identical on both sides** — same data, including Safe/Unsafe, the dashboard, and Mike's
  notes. There is no filtered or reduced view. The only difference is the writer's tab bar.
- This banner is the **one new thing** this plan puts on Tirzah's screen, and she sees it with no prior approval.
  Keep it plain and self-explanatory; it has to work without anyone explaining it to her.
- A missing or revoked token still shows the ca3 explanatory message, not a stale cache pretending to be live.

## Dependencies

Slice ca3 landed — it touches only the read path. Independent of ca4, ca5 and ca6, so it can be pulled forward if
a stale-cache problem shows up sooner.

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: with a forced fetch failure the cached data renders and the
  banner names the correct date; at a simulated cache age of 3 days the safety line reads "Out of date"; dismissal
  does not survive a reload and does not suppress expiry.
- **Live test is Tirzah's**, on her phone: aeroplane mode, confirm the banner and the named date, dismiss it,
  reload, confirm it is back. She is hands off by choice, so this is the one ask — keep it to the one check.

## Added by ca3 (2026-09-13)

- The read path this slice caches on top of is `loadData()` in `index.html`. It is JSONP against the Apps Script
  `/exec` URL, refreshes every 10 minutes, and already has a 20s timeout plus distinct visible messages for a bad
  token, an unreachable server, a quota rejection and a malformed response. **Do not add a second failure vocabulary
  — extend those.**
- `localStorage` already holds the access token under `cycleToken`, and `navigator.storage.persist()` is already
  requested at startup. The display cache this slice adds shares that storage; do not let a cache eviction or a
  quota error take the token with it.
- **Google's `/exec` redirect intermittently 404s.** A single failed read is not evidence the data is stale, so
  the staleness banner must be driven by the age of the last *successful* read, never by one failed fetch.
