# Slice lw7 — Viewer cache, staleness banner, 3-day expiry (stub)

## ⛔ BLOCKED ON THE DESIGN GATE

Do not expand this stub into a full spec until the gate clears. See `README.md`.

## Scope

Make the viewer side honest about how old its data is. Tirzah's phone caches the last successful load, says so when
it is showing cached data, and stops showing a safety verdict once that data is too old to trust.

## Verified facts

- Slice 3 already establishes the local storage and token handling this builds on.
- Chrome on Android has **no** Safari-style 7-day script-storage eviction, so the cache is not silently wiped and
  Add to Home Screen is convenience rather than load-bearing.

## Locked decisions

- Cache the **last successful load** and show it when a fetch fails, rather than showing nothing.
- The staleness banner **names the date** of the cached data. Vague wording like "may be out of date" is not enough.
- The banner is **dismissible**, but dismissal is **session-only** — it returns on the next open and on the next
  failed fetch, and it **does not cancel expiry**.
- **After 3 days, the Safe/Unsafe line is replaced by "Out of date".** A stale safety verdict is worse than none.
- These are **viewer-only** surfaces. Mike's build shows the entry screen and the unsent-queue banner instead.
- The app is otherwise **identical on both sides** — same tabs, same data, including Safe/Unsafe, the dashboard, and
  Mike's notes. There is no filtered or reduced view.
- A missing or revoked token still shows the slice-3 explanatory message, not a stale cache pretending to be live.

## Dependencies

Slice 4 landed, **and** the design gate cleared. (Independent of slices 5 and 6 — it can run before them if that
suits, since it touches only the read path.)

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: with a forced fetch failure the cached data renders and the
  banner names the correct date; at a simulated cache age of 3 days the safety line reads "Out of date"; dismissal
  does not survive a reload and does not suppress expiry.
- **Live test is Tirzah's**, on her phone: aeroplane mode, confirm the banner and the named date, dismiss it,
  reload, confirm it is back.
