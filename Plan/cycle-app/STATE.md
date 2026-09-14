# Cycle App — state

**Hard cap: 60 lines. One line per item.** Forensic detail goes to `Docs/Archive/Cycle App Log.md`, never here.

**When the user says "Wrap up", run `README.md`'s "End every session with" checklist.** STATE.md is always loaded
at session start; the README isn't — this line is the only way a session learns what "wrap up" means.

**Last reviewed commit:** 3ee13e2 — 0 unreviewed app lines.

## Done
_(One line per slice. Detail lives in the archive log.)_
- **ca1** — 4 defects fixed in `index.html` + `deploy.bat`, headless 2026-08-26, live 2026-09-13.
- **ca2** — `Tools/migrate-sheet.js` (sheet ID is a CLI arg, never in the repo). Verified 2026-09-13: 177 rows →
  165, 12 empty placeholders dropped, nothing lost, no Temp invented.
- **ca3** — proxy live, verified headless + live 2026-09-13: both roles read, three bad-token paths rejected, new
  sheet private, ca2 paste intact (165 rows, 2026-03-25..09-11), 5 cycles, ov days 16/18/23/31/23, cycle day 31.
  Mike's four live checks pass; old sheet Restricted and confirmed refused 2026-09-13. `deploy.bat` was also
  silently skipping the push — fixed, it now always pushes.
- **ca3a** — review of `1065c1e..HEAD`. Fixed: `hasData` blind to ca2's new columns; adapter read `Cycle Start`/
  `Ovulation` as strict `=== 'TRUE'`, ignoring others silently (now a warning `flag()`); dead `Time` column;
  `Code.gs` opened the sheet twice. 8 findings pushed on. `adapter-selfcheck` + `verify-proxy` PASS; live 2026-09-14.

## Open deviations from spec
_(Things later slices must know. One line each. Delete once resolved.)_
_(None.)_

## Locked decisions
_(From the /grill-me passes. Do not re-litigate. Slice-specific decisions live in their own slice files.)_
### Scope
- **The lunation wheel is scrapped** (2026-09-13, Tirzah didn't like it). No circular view, no lunation framing,
  no second visual language. Its safety and display rules survive in ca4; its geometry does not.
- **The dashboard is the app** — not restyled, not rebuilt. No visual redesign in this plan.
- **The moon stays where it already is**: the glyph strip above the timeline chart and the Moon at Day 1 / Moon at
  Ovulation columns. Nothing else lunar gets built.
- **Tirzah is hands off** — no design gate, no approval checkpoint. In exchange, surfaces she sees change **only**
  for correctness or safety reasons, never cosmetically.
### Data and access
- The sheet is the **single source of truth**. Local storage holds only unsent entries plus a display cache.
- **No pre-created future rows.** One row per actually-logged day — blanks caused the ca1 `detectPhase` bug.
- The **old sheet ID is permanently burned** (public repo since the first commit). New sheet, new ID, mandatory.
- The **original spreadsheet is kept untouched** as a historical keepsake.
- The repo **stays public** on GitHub Pages. All security lives in the two tokens, not in repo privacy.
- **Two tokens:** reader (Tirzah) and writer (Mike). The writer token also grants read — one link per person.
- A bad or missing token must produce a **visible message**, never a blank screen.
- Target browser is **Chrome on Android (Galaxy S22 Ultra)** only. No Safari/ITP workarounds.
- **Cervix Position is never inferred from texture.** Correlated in reality, but a derived position would
  double-count one observation in ca4's rules.
### Shape
- **Same app both sides, one URL.** Reader sees a single screen with **no tab bar at all**. Writer sees two tabs,
  `Dashboard | Log`. Hiding the tab is cosmetic only — **writes are enforced in the Apps Script**, never the client.
- Writer-only surfaces: the Log tab and the unsent-queue banner. Viewer-only: staleness banner and 3-day expiry.
### Rules
- Ovulation day is a **manual marker only**. No calculation may ever declare an ovulation day.
- **No ovulation marker => no coverline, and the post-ovulation safe window never opens.** Three-over-six may only
  *delay* the opening, never trigger it. (Verified 2026-08-26: without this, 3o6 fired on cycle-5 day 12 on margins
  of +0.07/+0.07/+0.43 and declared a false "Safe"; the next day's temp crashed 1.17F.)
- Cycle day is **date arithmetic** from the Cycle Start flag — never a lookup of the last logged row.
- Two safety states only: **Safe / Unsafe**. "Unsafe" absorbs "unknown".
- Status vocabulary is **Bleeding / Follicular / Luteal** only. **Ovulation is never a status.**
- **Mike drives all browser verification.** Never launch a browser tool to verify a change.
