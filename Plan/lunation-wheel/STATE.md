# Lunation Wheel — state

**Hard cap: 60 lines. One line per item.** Forensic detail goes to `Docs/Archive/Lunation Wheel Log.md`, never here.

**When the user says "Wrap up", run `README.md`'s "End every session with" checklist.** STATE.md is always loaded
at session start; the README isn't — this line is the only way a session learns what "wrap up" means.

**Last reviewed commit:** 1065c1e (plan start) — 53 unreviewed lines (lw1: 53)

**DESIGN GATE:** NOT CLEARED. Slices 4, 5, 7, 8 are blocked — do not expand their stubs into specs. Gate clears
only when Mike says the prototype's look is signed off *and* Tirzah has seen it and likes it. See README.

## Done

_(One line per slice, appended as each lands.)_

- **lw1** — 4 defects fixed in `index.html` + `deploy.bat`. Headless check vs live sheet 2026-08-26: (a) `detectPhase`
  window moved from blank rows 31-35 to logged rows 9-13; output `follicular` both ways today (coincidence, not a
  no-op). (b) `detectOvDay` unchanged 16/18/23/31 for cycles 1-4, `null` for cycle 5. (c) Cycle day = 13 by date
  math from 2026-08-14, matches hand-count and the old value today; no longer drifts on unlogged days. Awaiting
  Mike's live test.

## Open deviations from spec

_(Things later slices must know. One line each. Delete once resolved.)_

_(none)_

## Locked decisions

_(From the /grill-me pass. Do not re-litigate. Slice-specific decisions live in their own slice files.)_

- Ovulation day is a **manual marker only**. No calculation may ever declare an ovulation day.
- **No ovulation marker => no coverline, and the post-ovulation safe window never opens.** Three-over-six may only
  *delay* the opening, never trigger it. (Verified 2026-08-26: without this, 3o6 fired on cycle-5 day 12 on margins
  of +0.07/+0.07/+0.43 and declared a false "Safe"; the next day's temp crashed 1.17F.)
- Cycle day is **date arithmetic** from the Cycle Start flag — never a lookup of the last logged row.
- **No pre-created future rows.** One row per actually-logged day. Blank placeholders are the direct cause of the
  slice-1 `detectPhase` bug and must not come back.
- The sheet is the **single source of truth**. Local storage holds only unsent entries plus a display cache.
- Two safety states only: **Safe / Unsafe**. "Unsafe" absorbs "unknown".
- The **old sheet ID is permanently burned** (public repo since the first commit). New sheet, new ID, mandatory.
- The **original spreadsheet is kept untouched** as a historical keepsake.
- The repo **stays public** on GitHub Pages. All security lives in the two tokens, not in repo privacy.
- **Two tokens:** reader (Tirzah) and writer (Mike). The writer token also grants read — one link per person.
- A bad or missing token must produce a **visible message**, never a blank wheel.
- Target browser is **Chrome on Android (Galaxy S22 Ultra)** only. No Safari/ITP workarounds.
- **Same app both sides**, one URL. The only writer-only surfaces are the entry screen and the unsent-queue banner;
  the staleness banner and 3-day expiry are viewer-only.
- The existing Chart.js dashboard **survives intact** as a second tab. It is restyled, never rebuilt.
- Visual language is **earthy/organic, not tech-forward**. See the design gate in README.
- **Mike drives all browser verification.** Never launch a browser tool to verify a change.
