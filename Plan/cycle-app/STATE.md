# Cycle App — state

**Hard cap: 60 lines. One line per item.** Forensic detail goes to `Docs/Archive/Cycle App Log.md`, never here.

**On "Wrap up", run `README.md`'s "End every session with" checklist.** STATE.md is always loaded at session
start, the README isn't — this line is the only way a session learns what "wrap up" means.

**Last reviewed commit:** 24f6067 — ~240 unreviewed app lines (ca7). Next checkpoint review is ca7a, then ca8.

## Done
_(One line per slice. Detail lives in the archive log.)_
- **ca1** — 4 defects fixed in `index.html` + `deploy.bat`, headless 2026-08-26, live 2026-09-13.
- **ca2** — `Tools/migrate-sheet.js` (sheet ID is a CLI arg). 177 rows → 165, no Temp invented. Dropped `Time`.
- **ca3** — proxy live 2026-09-13: both roles read, bad tokens rejected, old sheet refused. `deploy.bat` was
  silently skipping the push — fixed.
- **ca3a** — review of `1065c1e..HEAD`: `hasData`, strict `=== 'TRUE'` reads, double sheet open. 8 pushed on. PASS.
- **ca2a** — `Time` recovered from Mike's xlsx export (88 values, none on a dropped row); an audit found it was the
  only loss. `migrate-sheet` carries it and refuses unmapped columns. `verify-proxy` PASS.
- **ca3b** — review of `3ee13e2..HEAD`, all 5 targets resolved. PASS live 2026-09-14.
- **ca7** — pulled forward ahead of ca4. Display cache (`cycleCache`, invalidated by a `PROXY_URL` change),
  dismissible banner naming the cached date and carrying ca3a's data warnings, 3-day "Out of date" expiry on the
  safety card; honest 20s timeout that self-reloads once past the browser cache. New `Tools/staleness-selfcheck.js`
  PASS, adapter + migrate still PASS. Tirzah's aeroplane-mode check outstanding.

## Open deviations from spec
_(Things later slices must know. One line each. Delete once resolved.)_
- **ca7a is optional** — README step 6 triggered on "touched a shared helper", not on size (~240 lines). Skip
  straight to ca4 if preferred; if skipped, ca7's lines carry forward to ca8.

## Locked decisions
_(From the /grill-me passes. Do not re-litigate. Slice-specific decisions live in their own slice files.)_
### Scope
- **The lunation wheel is scrapped** (2026-09-13, Tirzah didn't like it). No circular view, no lunation framing;
  its safety and display rules survive in ca4, its geometry does not.
- **The dashboard is the app** — not restyled, not rebuilt. No visual redesign in this plan.
- **The moon stays where it is**: the glyph strip above the timeline chart and the Moon at Day 1 / Moon at
  Ovulation columns. Nothing else lunar gets built.
- **Tirzah is hands off** — no design gate. In exchange, surfaces she sees change **only** for correctness.
### Data and access
- The sheet is the **single source of truth**. Local storage holds only unsent entries plus a display cache.
- **No pre-created future rows.** One row per actually-logged day — blanks caused the ca1 `detectPhase` bug.
- The **old sheet ID is permanently burned** (public repo since the first commit). New sheet, new ID, mandatory.
- The **original spreadsheet is kept untouched** as a historical keepsake.
- The repo **stays public** on GitHub Pages. All security lives in the two tokens, not in repo privacy.
- **Two tokens:** reader (Tirzah) and writer (Mike); the writer token also grants read — one link per person. A
  bad or missing token must produce a **visible message**, never a blank screen.
- Target browser is **Chrome on Android (Galaxy S22 Ultra)** only. No Safari/ITP workarounds.
- **Cervix Position is never inferred from texture** — it double-counts one observation in ca4.
### Shape
- **Same app both sides, one URL.** Reader gets one screen, **no tab bar**; writer gets `Dashboard | Log`. Hiding
  the tab is cosmetic — **writes are enforced in the Apps Script**, never the client.
- Writer-only surfaces: the Log tab and the unsent-queue banner. Viewer-only: staleness banner and 3-day expiry.
### Rules
- Ovulation day is a **manual marker only**. No calculation may ever declare an ovulation day.
- **No ovulation marker => no coverline, and the safe window never opens.** Three-over-six may only *delay* the
  opening, never trigger it. (2026-08-26: without this it declared a false "Safe" on cycle-5 day 12.)
- Cycle day is **date arithmetic** from the Cycle Start flag — never a lookup of the last logged row.
- Two safety states only: **Safe / Unsafe**. "Unsafe" absorbs "unknown".
- Status vocabulary is **Bleeding / Follicular / Luteal** only. **Ovulation is never a status.**
- **Mike drives all browser verification.** Never launch a browser tool to verify a change.
