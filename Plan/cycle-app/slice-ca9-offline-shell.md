# Slice ca9 — Cold-start offline

## Scope

The app cannot be opened at all without a signal. There is no service worker, so `index.html` is only ever served
from Chrome's own HTTP cache; when that misses, the browser shows its offline error page and the app never runs.
Every ca6 mechanism behind it — the unsent queue, the banner, the manual flush — is unreachable in exactly the
situation it was built for. Give the app a shell it can start from offline, and nothing more.

**Runs before ca8.** ca8 is the final review and needs a settled diff, so this lands first (same reasoning that
pulled ca7 forward ahead of ca4).

## Verified facts (2026-09-15, ca6a — all re-confirmed at the top of this session)

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
success and the phone would keep running last week's safety engine. Two rules follow, and they are written at the
top of `sw.js` as RULE 1 and RULE 2:

- **The page itself is network-first**, cache only as the fallback. A deploy takes effect on the next load with a
  signal, with no cache-busting ritual and no waiting for a second visit.
- **Nothing from `/exec` is ever cached by the worker.** The sheet is the single source of truth and `cycleCache`
  is the only permitted copy of its data.

Both are enforced by the cheapest possible rule: the worker answers **same-origin GETs and one pinned CDN URL**,
and declines everything else. `script.google.com` is therefore never named in `sw.js` at all — reads (a JSONP
`<script src>` GET) and writes (a POST) both fall through untouched, and there is no duplicated `PROXY_URL`
constant to drift.

It cannot fight `selfRefresh()`: that reload is a same-origin navigation, so it goes to the network first like any
other. Offline it is answered from the cache via `ignoreSearch: true`, and the refreshed copy is stored under the
path with the query **stripped**, so a rescue cannot grow the cache by one dead entry per attempt.

## Answers to the stub's open questions

1. **Chart.js.** jsDelivr sends `Access-Control-Allow-Origin: *`, so the worker's copy is a normal readable
   response, not an opaque one, and replaying it into a `<script src>` works. The URL is version-pinned and
   immutable, so it is the one thing cached **first**, network second. It is still not relied on: `index.html`
   gained `chartsUnavailable()`, so a missing Chart.js draws a "These charts need an internet connection to load."
   panel in each chart's place instead of throwing. That throw would have been the ca4a failure exactly — a drawn
   dashboard, `renderPayload` throwing past it, and `failLoad` replacing the lot with an error screen.
2. **The entry form on the error screen: yes, in this slice.** Without it ca9's exit criteria cannot be met — a
   cold start offline is precisely when the unsent queue matters, and a writer who cannot reach the form cannot
   use it. `showMessage()` now carries the tab bar, and answers the Log tab with `entryScreenHTML(allCycles || [])`
   — which needs no cycle data: every day comes out "not logged" with no day number, which is exactly true. The
   Dashboard tab has genuinely nothing to draw and stays the message.
   - That needs the role, which with no `cycleCache` was `null`. New key **`cycleRole`** (`PROXY_URL\nrole`),
     written on every successful read and read at boot before `bootFromCache()`. It is separate from the display
     cache because ca7 and ca6 both **drop that whole key** to make room, and the role is what decides whether
     Tirzah is shown a writer-only surface. `bootFromCache()` now fills the role in rather than overwriting it.
   - A remembered role outlives a token, so `not-configured` / `no-access` clear it (`_role = null`,
     `_tab = 'dashboard'`, `rememberRole(null)`) before their message — otherwise the entry form would be drawn
     over a refusal that says the link is dead.
3. **No `PROXY_URL` keying on the worker.** `PROXY_URL` lives inside `index.html`, `index.html` is network-first,
   so a proxy change lands on the next online open. The cache is retired by bumping `CACHE` ('cycle-shell-v1'),
   and `activate` deletes every other cache name. `cycleRole` *is* keyed on `PROXY_URL`, for the same reason
   `cacheIsUsable()` checks it.

## What shipped

- **`sw.js`** (new) — precaches `./`, `index.html`, `manifest.json`, `icon.svg` and the pinned Chart.js;
  network-first for same-origin, cache-first for Chart.js, pass-through for everything else.
- **`index.html`** — worker registration guarded on `window.isSecureContext` (https and localhost, not `file://`,
  where it throws) with a loud `console.error` on failure; `chartsUnavailable()` + `.chart-missing`;
  `rememberRole()` / `recallRole()`; `_lastMessage` and a single `redraw()` that every "put the screen back" path
  now goes through (`switchTab`, `openDay`, `showMoreDays`, the offline save, `redrawAfterQueueChange`);
  `showMessage()` carries the tab bar and the Log screen.
- **`Tools/offline-selfcheck.js`** (new) — runs `sw.js` under a stub worker global.
- **`Tools/render-selfcheck.js`** — four new sections for the page side of ca9.
- **`Tools/page-harness.js`** — stub elements gained a `parentNode`, so a check can read what replaced a canvas.

## Verification

Eight self-checks, all PASS. Eleven mutations, each one confirmed red and reverted:

| # | Mutation | Caught by |
|---|---|---|
| M1 | page served cache-first | offline |
| M2 | `ignoreSearch` dropped | offline |
| M3 | same-origin bail removed (proxy cached) | offline |
| M4 | refreshed page keyed with its query string | offline |
| M5 | `activate` retires nothing | offline |
| M6 | secure-context guard removed | offline |
| M7 | registration failure swallowed | offline |
| M8 | `sw.js` Chart.js URL drifts from `index.html` | offline |
| P1 | `chartsUnavailable()` guards removed | render |
| P2/P3 | tab bar / Log screen off the message screen | render |
| P4/P5/P6 | role not remembered / not recalled / clobbered by a role-less cache | render |
| P7 | a dead link still shows the Log tab | render |

## Exit criteria — Mike's, on the phone

A service worker cannot run in a self-check, so the cold-start test is Mike's and the plan says so rather than
pretending otherwise.

1. Aeroplane mode, tab **closed**, open from the Home Screen icon: something usable, not Chrome's offline page.
   (Needs one online visit first, to install the worker.)
2. From that cold start, reach the Log tab, log a day, see it queued and flagged "not sent yet".
3. **Run `deploy.bat`, then open the app with a signal: the new version must be there on the *next* open.** This
   is the one way this slice can do real harm — verify it deliberately.
4. Nothing the worker caches can be mistaken for sheet data — the staleness banner still dates the cached
   dashboard, and a read still goes to the network every time.
5. Tirzah's outstanding aeroplane-mode check from ca7 is re-run afterwards: she must see the dated dashboard and
   **no tab bar, no entry form**, cold start or not.
