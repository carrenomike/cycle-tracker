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
  **Trap added by ca7a (2026-09-15):** `bannerHTML` now truncates that list to `MAX_BANNER_WARNINGS` (4). A queue
  message pushed onto `_dataWarnings` can therefore be silently dropped behind four bad rows — which is precisely
  the silent failure this slice exists to prevent. If the queue message routes through `_dataWarnings`, it must be
  exempt from the cap or carried in its own argument. `_dataWarnings` is also cleared at the top of every
  `renderPayload()`, so anything pushed outside a parse does not survive the next 10-minute refresh.
- **The display cache ca7 wrote is `localStorage.cycleCache`**, one record `{proxy, at, cols, rows}`, written only
  after a payload actually renders and refused if `proxy` no longer matches `PROXY_URL`. The queue must be its own
  key: ca7's write path deliberately drops **only** `cycleCache` on a quota error, so that recovery must never be
  able to take unsent entries with it.
- ca7's `failLoad()` falls back to the cache on a failed read. **A failed *write* must never be answered from the
  cache** — a queued entry that has not landed is not in `cycleCache` and must not look like it is.

## Added by ca5 (2026-09-15) — the write path this slice wraps already exists

- **`postEntry(iso, values)`** is the whole write: one `fetch` POST of `{t, date, values}` with
  `Content-Type: text/plain` (a "simple" request — Apps Script cannot answer a CORS preflight; changing this
  content type breaks writing from GitHub Pages) and a 30s `AbortSignal.timeout`. Queue around it; do not write a
  second fetch.
- **The write is already idempotent per date.** `doPost` updates the row for that date or inserts one in date
  order, under a `LockService` script lock. So a flush may safely re-send an entry it is unsure about — that is
  what makes a queue safe here — but it also means **the queue must key on the date**: two queued entries for the
  same day are not two writes, they are a lost edit. Merge them.
- **Only changed fields are sent** (`entryDiff`). A queued entry is therefore a *patch*, not a whole row, and it
  was diffed against the sheet as it looked when the form was opened. If the sheet changes underneath while the
  entry sits in the queue, flushing that patch still only overwrites the fields Mike touched — which is the
  intended behaviour, but say so in the banner wording rather than implying the row was re-checked.
- **`writeErrorText(err)` maps the endpoint's errors to plain sentences** (`read-only`, `no-access`,
  `not-configured`) and passes anything else through verbatim. Reuse it for flush failures; do not invent a second
  vocabulary.
- **The display cache record gained a field:** it is now `{proxy, at, role, cols, rows}`. `writeCache` takes
  `(cols, rows, role)`. `role` is what keeps the Log tab visible when the app loads from cache offline — which is
  exactly when this slice's queue matters, so do not drop it.
- **The 10-minute refresh is suppressed while a day's form is open** (`_openDate` is set), because a re-render
  wipes a half-typed entry. A queue flush that re-renders must respect the same rule.
- **`_openDate`, `_catchupDays`, `_byIso` and `_saving`** are the entry screen's state, and `render()` now has an
  early return for `_tab === 'log'`. A banner added to `render()` must be added to **both** exits or it will be
  invisible on the exact screen where the queue is used.
