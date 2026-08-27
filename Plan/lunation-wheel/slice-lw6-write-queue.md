# Slice lw6 — Local unsent queue and persistent banner (stub)

## Scope

Make logging survive a bad signal. Entries queue locally when a write fails and flush when it can, with a banner
that stays visible the whole time anything is unsent.

## Verified facts

- Slice 5 ships the write path with no queue: a failed write is simply a visible error. This slice replaces that
  with a queue plus the same visible error.

## Locked decisions

- **The sheet is the single source of truth.** Local storage holds only (a) unsent entries and (b) a display cache.
  It is never treated as an alternative record of truth.
- **On successful push: delete the local entry and re-read the row from the sheet.** Do not keep the local copy and
  do not assume the sheet stored what was sent.
- On load, the sheet overwrites the display cache — except for queued entries, which stay on top and stay flagged
  as unsent so it is always obvious which numbers have not landed.
- **The unsent banner is persistent and not dismissible.** It stays until the queue is empty. (Contrast the
  viewer-side staleness banner in slice 7, which *is* dismissible — different banner, different rule.)
- The banner is **writer-only**. Tirzah never sees it.
- **Every failure is surfaced.** A flush that fails, a flush that partially fails, and a queue that has been stuck
  for a long time all get a visible state — not just a console line. This is the exact class of silent background
  failure this project has lost time to before.
- No silent data loss: an entry never leaves the queue except by a confirmed successful write.

## Dependencies

Slice 5 landed.

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: an entry queued while offline survives a reload; a successful
  flush removes it and the re-read row matches; a partial flush leaves exactly the failed entries queued.
- **Live test is Mike's**, on his phone: log with aeroplane mode on, confirm the banner appears and persists across
  a reload, turn the radio back on, confirm the flush and the banner clearing.
