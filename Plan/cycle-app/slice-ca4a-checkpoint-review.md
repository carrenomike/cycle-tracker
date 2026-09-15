# Slice ca4a — Checkpoint review of `4050005..HEAD` (stub)

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
