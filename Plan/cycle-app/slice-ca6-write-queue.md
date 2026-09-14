# Slice ca6 — Local unsent queue and persistent banner (stub)

## Scope

Make logging survive a bad signal. Entries queue locally when a write fails and flush when it can, with a banner
that stays visible the whole time anything is unsent.

## Verified facts

- Slice ca5 ships the write path with no queue: a failed write is simply a visible error. This slice replaces that
  with a queue plus the same visible error.

## Locked decisions

- **The sheet is the single source of truth.** Local storage holds only (a) unsent entries and (b) a display cache.
  It is never treated as an alternative record of truth.
- **On successful push: delete the local entry and re-read the row from the sheet.** Do not keep the local copy and
  do not assume the sheet stored what was sent.
- On load, the sheet overwrites the display cache — except for queued entries, which stay on top and stay flagged
  as unsent so it is always obvious which numbers have not landed.
- **The unsent banner is persistent and not dismissible.** It stays until the queue is empty. (Contrast the
  viewer-side staleness banner in ca7, which *is* dismissible — different banner, different rule.)
- The banner is **writer-only**. Tirzah never sees it.
- **Every failure is surfaced.** A flush that fails, a flush that partially fails, and a queue that has been stuck
  for a long time all get a visible state — not just a console line. This is the exact class of silent background
  failure this project has lost time to before.
- No silent data loss: an entry never leaves the queue except by a confirmed successful write.

## Dependencies

Slice ca5 landed.

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: an entry queued while offline survives a reload; a successful
  flush removes it and the re-read row matches; a partial flush leaves exactly the failed entries queued.
- **Live test is Mike's**, on his phone: log with aeroplane mode on, confirm the banner appears and persists across
  a reload, turn the radio back on, confirm the flush and the banner clearing.

## Added by ca7 (2026-09-14) — ca7 landed first, and it already built a banner

- **The `.banner` / `.banner-x` CSS and `bannerHTML()` already exist** in `index.html`, built for ca7's viewer-side
  staleness message. Reuse the CSS. Do **not** reuse `id="banner"` or `dismissBanner()` — this slice's queue banner
  is persistent and not dismissible, and both banners can be on screen at once for Mike (unsent entries *and* a
  failed read are exactly the same bad-signal moment).
- `bannerHTML(staleInfo, warnings, dismissed, now)` takes all its state as arguments and returns a string; it is
  called once inside `render()`. Add the queue banner alongside that call rather than inventing a second injection
  point.
- **`_dataWarnings` is already the list of "things the user should see about this data."** ca3a's dropped-row and
  bad-yes/no messages go through it. A stuck or partially-failed flush is the same kind of message — consider
  pushing to it rather than building a third mechanism.
- **The display cache ca7 wrote is `localStorage.cycleCache`**, one record `{proxy, at, cols, rows}`, written only
  after a payload actually renders and refused if `proxy` no longer matches `PROXY_URL`. The queue must be its own
  key: ca7's write path deliberately drops **only** `cycleCache` on a quota error, so that recovery must never be
  able to take unsent entries with it.
- ca7's `failLoad()` falls back to the cache on a failed read. **A failed *write* must never be answered from the
  cache** — a queued entry that has not landed is not in `cycleCache` and must not look like it is.
