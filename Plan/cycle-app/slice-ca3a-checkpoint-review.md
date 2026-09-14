# Slice ca3a — Checkpoint review (stub)

## Why this exists

The README routes a checkpoint review whenever a slice touches a shared helper or invariant, regardless of diff
size. ca3 did both, so this runs before ca4 builds the safety engine on top of it.

## Scope

Review only. No features. Fix what the review finds, or record it as a deviation — do not redesign.

The unreviewed range is `1065c1e..HEAD`, Plan and Docs excluded: about 830 added lines, of which roughly 320 are
app or server code (`index.html` ~235 churn, `Apps Script/Code.gs` 90) and the rest are tools and a migration
script that has already done its one job.

## What to look at, hardest first

- **The adapter** (`index.html`, between the `// >>> ADAPTER` markers). Every downstream reader of `Day` and
  `Cycle` now depends on it, and ca4 is about to rewrite those readers. Check it against the real 165 rows, not
  just the fixtures in `Tools/adapter-selfcheck.js`: rows before the first `Cycle Start`, a cycle spanning a DST
  change, the six temp-less rows, and the 29 rows whose original wording was folded into `Note`.
- **The `Exclude` fix at `index.html:349`.** ca3 changed the test from `!== 'Y'` to "any non-empty value".
  Confirm no other comparison in the app still expects an old-schema spelling — `Flow`, `Ovulation`, `Cycle Start`
  and `Temp Quality` are all new or renamed, and the adapter only covers two of them.
- **`hasData`** (`index.html:269`) still lists old-schema columns and knows nothing about `Flow`, `Cycle Start`,
  `Temp Quality` or `Cervix Position`. Decide whether a row carrying only one of those reads as empty today, and
  whether that matters before ca4 or only after ca5 starts writing them.
- **`Apps Script/Code.gs`.** Token comparison, the order of the token check against the sheet read, what `cell()`
  does to a value type the migration never produced, and whether any error path can return something that is not
  valid JSON or valid JSONP.
- **Failure paths.** Every one is supposed to be visible. Walk them rather than trusting the claim.

## Exit criteria

- No typecheck, test or build exists in this project. Headless checks only, stated in the STATE line.
- `Tools/adapter-selfcheck.js` and `Tools/verify-proxy.js` both still pass.
- `STATE.md`'s `Last reviewed commit` marker is advanced to this slice's commit and its tally reset to zero.
- Anything found but deliberately not fixed is written into the slice that owns it, not left in STATE.
