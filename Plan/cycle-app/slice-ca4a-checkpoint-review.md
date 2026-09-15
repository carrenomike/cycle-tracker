# Slice ca4a — Checkpoint review of `4050005..HEAD`

## Scope

A read-only review of everything committed since the last review marker: ca7a's fixes and the whole of ca4. Fix
what the review finds, in this slice, then move the marker. No new features.

This checkpoint exists because ca4 touched a shared invariant, not because the diff was large (~300 app lines).
ca4 deleted a field that roughly twenty call sites read and rewrote all of them.

## Verified facts (confirm before trusting)

- ca4 deleted `row.Cycle` from `adaptRows` in `index.html` and rewrote every reader against `isOv()`,
  `isBleeding()` and `phaseTag()` in the SAFETY block. At the time of writing `grep -n "r\.Cycle" index.html`
  returns one hit, inside a comment. **Re-run it.** A single missed reader is a permanently blank tag or a
  permanently uncoloured point, not an error.
- Three marked blocks are now extracted and executed by tools: `ADAPTER`, `STALENESS`, `SAFETY`. Deleting or
  renaming a marker line silently breaks a check — confirm all three still throw loudly if their markers go.
- `render()` ends with ca7's "Out of date" override, which must stay **last** and must not consult
  `_bannerDismissed`. `staleness-selfcheck` greps for this; confirm the grep still matches what it means to.

## Targets

1. **Every former `r.Cycle` reader.** Charts, tooltips, the log table, the overlay chart. Does each one now get
   the same string it used to, on the same rows?
2. **The safety engine's boundaries.** Day 1 of a cycle with no rows; a cycle whose only marker sits on its last
   logged day; `dayNumber` past the end of the logged data; a cycle of one row.
3. **`unloggedDays` and `lastDataIndex`** against a cycle whose trailing rows are blank, and against the ca2
   promise that no future rows exist.
4. **The three self-checks as a suite.** Do any of them pass vacuously — a regex that cannot fail, a grep whose
   anchor moved, an assertion comparing a value to itself?
5. **ca7a's own fixes** (`24f6067..4050005`, ~81 lines, never reviewed): the conditional scrub, the cache-drop
   retry, the 4-item banner cap.

## Exit criteria

- No typecheck, test or build exists in this project. Headless only, plus Mike's browser pass.
- Every finding either fixed or written into the slice file that owns it.
- `STATE.md`'s `Last reviewed commit` marker moved to this slice's commit.


---

# Outcome — 2026-09-15

**2 defects fixed, 1 new check added. All four self-checks PASS.**

## Fixed

1. **The dashboard did not render at all.** ca4 deleted `const ovDay = ovDayNum;` from `render()` along with the
   old safe-sex arithmetic, but left the Cycle History current-cycle row reading `ovDay`. That is a
   `ReferenceError` thrown inside the template literal, before `#app` is written — a permanently blank screen on
   every load where the current cycle has any logged data, which is always. Fixed to `ovDayNum`
   (`index.html:730`). ca4 was never opened in a browser; all three self-checks passed straight through it,
   because none of them ran `render()`.
2. **A restored warning.** ca3's adapter warned when a day was marked both `Ovulation` and `Flow=bleeding`; ca4
   deleted that warning along with the synthesised `Cycle` column it guarded. Under ca4 the contradiction matters
   *more*, not less: `isOv` and `isBleeding` are independent, so such a day anchors the safe window **and** counts
   in the opening bleed run, while the log table shows only "Ovulation". The warning is back in `adaptRows`,
   reworded to say the day counts as both, and reaches Tirzah through ca7's banner.

## New — `Tools/render-selfcheck.js`

The three existing checks each extract one marked block and test it in isolation. `render()` is the largest piece
of code in the app and nothing executed it, which is exactly how defect 1 shipped green. The new check loads the
**whole page script** under stub browser globals (`document`, `localStorage`, `location`, a `Chart` stub) and
pushes two real fixtures through `renderPayload()` — the same entry point the live and the cached paths share. It
asserts only that every path runs and that the cards, both tables and the ovulation cell are present; what the
dashboard *looks like* is still Mike's browser pass. Mutation-tested: reintroducing `ovDay` turns 10 checks red.

## Targets, as reviewed

1. **Former `r.Cycle` readers** — `grep` returns one comment in `index.html`; the `Tools/migrate-sheet.js` hits
   read the *old* source sheet's own column and are correct. All rewritten readers verified equivalent against
   `git show e569994^`: ca3 synthesised `Ovulation → 'Ovulation'`, else `Flow === 'bleeding' → 'Blood'`, which is
   `phaseTag()` exactly. `isBleeding` additionally trims and lower-cases, which is strictly more permissive and
   identical on the real data.
2. **Safety boundaries** — clean. `threeOverSixDay`'s loop bound `i + 2 < u.length` is right; `coverlineCents`
   with the marker on the last logged row is right; `safetyVerdict`'s `dayNumber - ovDay` hint is only reachable
   when `opens != null`, which implies `ovDay != null`. A cycle of one row and a `dayNumber` past the data both
   render (covered by the new check's unlogged-days gap).
3. **`unloggedDays` / `lastDataIndex`** — safe. `splitCycles` only keeps rows with a parseable `Day`, so
   `lastDataIndex`'s all-blank fallback still lands on a row with a numeric `Day` and the `isNaN` guard is belt
   and braces. An empty `cycles` array cannot reach `render()` — `renderPayload` throws on it first.
4. **The three self-checks** — no vacuous passes. The `function render(cycles) \{([\s\S]*?)
\}` regex both
   files use does capture the entire body (11,447 chars, ending at `drawOverlayChart(cycles)`), so the greps
   anchored on it are real. One weak spot noted, not fixed: `staleness-selfcheck`'s
   `/location\.replace\([\s\S]*?location\.hash\)?;/` uses a lazy any-char run, so it would also match a
   `location.replace()` and an unrelated later `location.hash` in the same function. Correct today; tighten it if
   `selfRefresh()` ever grows.
5. **ca7a's own fixes** — all three correct as written. The conditional scrub only fires on `_tokenPersisted`;
   the cache-drop retry removes `CACHE_KEY` before re-`setItem`ing `TOKEN_KEY`, never the reverse; the banner cap
   truncates at 4 and names the remainder. `selfRefresh()` dropping `location.search` while keeping
   `location.hash` is deliberate — it is replacing `?v=`.

## Noted, not fixed

- **`detectPhase` can read "Bleeding" on a stale cycle.** It looks at the last five *logged* rows, so a cycle with
  few logged rows that opened with a bleed still says "Bleeding" on day 20 if nothing has been logged since. This
  is unchanged from ca3 — not a ca4 regression — and ca4's unlogged-days count now sits on the card beside it,
  which is the honest signal. Revisit only if Tirzah reports it.
- **Not covered by any check:** the cached render path with `_staleInfo` set (the "Out of date" card). Handed to
  ca8, whose stub is amended.

## Outstanding

- Mike's browser pass on ca4 + this fix. Until it happens the dashboard has never been seen rendering.
