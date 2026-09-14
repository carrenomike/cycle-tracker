# Cycle App — state

**Hard cap: 60 lines. One line per item.** Forensic detail goes to `Docs/Archive/Cycle App Log.md`, never here.

**On "Wrap up", run `README.md`'s "End every session with" checklist.** STATE.md is always loaded at session
start, the README isn't — this line is the only way a session learns what "wrap up" means.

**Last reviewed commit:** 788b029 — 0 unreviewed app lines. Next checkpoint review is ca8.

## Done
_(One line per slice. Detail lives in the archive log.)_
- **ca1** — 4 defects fixed in `index.html` + `deploy.bat`, headless 2026-08-26, live 2026-09-13.
- **ca2** — `Tools/migrate-sheet.js` (sheet ID is a CLI arg, never in the repo). 2026-09-13: 177 rows → 165, 12
  placeholders dropped, no Temp invented. Dropped `Time`; ca2a got it back.
- **ca3** — proxy live, verified 2026-09-13: both roles read, bad tokens rejected, new sheet private, old sheet
  refused, paste intact. `deploy.bat` was silently skipping the push — fixed.
- **ca3a** — review of `1065c1e..HEAD`. Fixed: `hasData` blind to ca2's columns; strict `=== 'TRUE'` reads (now a
  warning `flag()`); `Code.gs` opened the sheet twice. 8 findings pushed on. PASS.
- **ca2a** — `Time` recovered from Mike's xlsx export: 88 values / 177 rows, none on a dropped row; a column audit
  found it was the only loss. `migrate-sheet` carries it and refuses unmapped columns; `cell()` no longer formats
  a time as a date; column back in the table. Pasted, redeployed, `verify-proxy` PASS 2026-09-14.
- **ca3b** — review of `3ee13e2..HEAD`, all 5 targets resolved. `cell()` formats by column name, not a year; `tz`
  returned and checked; `SOURCE_COLS` is a destination map and a column landing nowhere now fails; `hasData` names
  `Ovulation` (ca4 deletes the `r.Cycle` it leaned on); counts are floors. Self-checks PASS, redeploy pending.

## Open deviations from spec
_(Things later slices must know. One line each. Delete once resolved.)_
- **Apps Script needs a redeploy** — ca3b changed `cell()` and added `tz`; `verify-proxy` fails until then.

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
