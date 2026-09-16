# Slice ca9 — Cold-start offline (stub)

## Scope

The app cannot be opened at all without a signal. There is no service worker, so `index.html` is only ever served
from Chrome's own HTTP cache; when that misses, the browser shows its offline error page and the app never runs.
Every ca6 mechanism behind it — the unsent queue, the banner, the manual flush — is unreachable in exactly the
situation it was built for. Give the app a shell it can start from offline, and nothing more.

**Runs before ca8.** ca8 is the final review and needs a settled diff, so this lands first (same reasoning that
pulled ca7 forward ahead of ca4).

## Verified facts (2026-09-15, ca6a)

- No service worker exists: `index.html` and `manifest.json` register none, and there is no `sw.js` in the repo.
- The page needs four things to paint: `index.html`, `manifest.json`, `icon.svg`, and Chart.js from
  `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js` (line 10) — cross-origin, and the only
  external dependency in the project.
- Offline *with* the tab already open works today; ca7's `cycleCache` paints a dated dashboard and `_role` comes
  back from the cache, so the Log tab and the queue banner are both there.
- Offline with no `cycleCache` lands on `showError`, which has no tab bar — so even a cached page cannot reach the
  entry form. ca6a put the queue banner on that screen; it still cannot log anything new.
- `manifest.json` has `start_url: "."`, and ca7's `selfRefresh()` reloads to `pathname + '?v=<now>'` once per tab
  (`sessionStorage.cycleSelfRefreshed`) when a first load times out.
- `deploy.bat` is `git add -A` + push to GitHub Pages. There is no build step and no versioned filenames.

## The risk this slice must not create

A service worker that serves a cached `index.html` first is how an app pins itself to an old version forever. This
project has already lost time to a stale *deployment*; a stale *client* is worse, because `deploy.bat` would report
success and the phone would keep running last week's safety engine. Two rules follow:

- **The page itself is network-first**, cache only as the fallback. A deploy must take effect on the next load with
  a signal, with no cache-busting ritual and no waiting for a second visit.
- **Nothing from `/exec` is ever cached by the worker.** The sheet is the single source of truth and `cycleCache`
  is the only permitted copy of its data. A worker that caches a read would put a second, invisible copy behind
  the one the staleness banner reports on.

Also confirm it cannot fight `selfRefresh()`: that exists to escape a cached page pointing at an archived `/exec`,
which is precisely the failure a badly-scoped worker would make permanent.

## Open questions for the expanding session

1. Chart.js is cross-origin, so a cached copy is an opaque response. Confirm a `<script src>` replay from the
   cache actually works offline before relying on it — if not, the dashboard charts are the one thing that stays
   broken offline, which is acceptable (say so on screen) but must not throw.
2. `showError` has no tab bar, so a writer who is offline with no display cache still cannot log. Decide whether
   this slice gives that screen a way into the entry form, or whether that is its own slice.
3. Does the worker need to survive a `PROXY_URL` change, the way `cycleCache` is dropped on one?

## Exit criteria

- With the phone in aeroplane mode and the tab **closed**, opening the app from the Home Screen icon paints
  something usable — not Chrome's offline page.
- A writer can reach the entry form and log a day from that cold start, and the entry is queued.
- After a `deploy.bat`, a phone with a signal gets the new version on the **next** open. Verify this deliberately;
  it is the one way this slice can do real harm.
- Nothing the worker caches can be mistaken for sheet data.
- The offline self-checks cannot run a service worker, so **the check for this slice is Mike's, on the phone**,
  and the plan says so rather than pretending otherwise. Anything testable offline (registration guarded, the
  cache list, the network-first order) gets a check that is mutation-tested per ca4a.
- Tirzah's outstanding aeroplane-mode check from ca7 is re-run afterwards, since this changes what she sees when
  she opens the app with no signal.
