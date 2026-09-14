# Slice ca4 — Real safety engine on the dashboard (stub)

## Scope

Replace the dashboard's crude safe-window arithmetic with the full safety rule, and stop the status cards asserting
things the app cannot know. This is the surviving core of the scrapped wheel slice — the rules were always the
product; the circle was only a way of drawing them.

No new screen. This slice edits the existing stat cards in place.

## Verified facts

Line numbers confirmed by reading `index.html` at commit `b1d0ef5` (post-ca1).

- `index.html:420` — the entire current safety rule is one line:
  `ovDay != null && dayNumber < ovDay - 6 || ovDay != null && dayNumber >= ovDay + 4`. No opening-bleed-run
  concept, no three-over-six, no coverline involvement.
- `index.html:417-436` — `safeStatus` / `safeClass` / `safeHint` are computed here and rendered at `index.html:443`.
  Two states already (`Safe` / `Unsafe`), so the two-state decision needs no structural change.
- `index.html:272-285` — `detectPhase(cycle)` returns `menstrual` / `follicular` / `ovulation` / `luteal` and is
  rendered through `phaseLabel` into the "Current Phase" card at `index.html:452`. **`ovulation` is a status here,
  which this slice removes.**
- `index.html:287-292` — `detectOvRow` returns the manual marker or `null`; ca1 removed the mucus inference. The
  safety engine can call it directly without re-checking.
- `index.html:342-355` — `calcCoverline` already returns `null` until ovulation is marked, and already excludes
  rows flagged `Exclude`. Its baseline window is the 6 usable temps before the ovulation marker.
- **Added by ca3 (2026-09-13).** Line numbers above were re-checked at commit `05c3064` and are all still exact.
  Two things changed underneath them:
  - `calcCoverline`'s Exclude test is now `!(r.Exclude || '').trim()` — any non-empty value means excluded. It used
    to compare against `'Y'`, which ca2's `TRUE` would have silently defeated, quietly readmitting excluded temps
    into every coverline. Keep the non-empty test; do not reintroduce a literal.
  - `index.html` now carries an **adapter** between the `// >>> ADAPTER` and `// <<< ADAPTER` markers. It
    synthesises the `Day` and `Cycle` fields ca2 deleted from the sheet, which is the only reason the call sites
    this slice edits still compile. **This slice owns deleting the `Cycle` half of it**: as each reader of
    `r.Cycle` is rewritten against `Flow` and `Ovulation` directly, drop the corresponding line from the adapter,
    and delete the collision warning with it. The `Day` half stays — nothing replaces it in this plan.
  - Note `Flow === 'spotting'` is deliberately **not** `'Blood'`. The opening-bleed-run rule depends on that.
  - `Tools/adapter-selfcheck.js` runs offline and asserts the adapter's behaviour. Keep it passing, or delete the
    assertions that no longer describe anything.
- **A migrated row may have no temperature at all** (6 do, including Day 1 of cycle 1). "Usable" means *has a temp
  and is not flagged `Exclude`* — a temp-less row must be skipped by the coverline and three-over-six windows, not
  read as a zero or as a gap in the day count.
- `index.html:390` — cycle day is date arithmetic off the cycle's first row (ca1). This slice repoints the anchor
  at ca2's explicit `Cycle Start` flag.
- `index.html:357-362` — `lastDataIndex` already walks back to the last logged row; reuse it for the unlogged
  count rather than writing a second version.
- The safety logic was prototyped and verified against the real sheet on 2026-08-26. The prototype is
  scratchpad-only and is **not** a source file — port the logic, not the file.
- **Cycle 5 now carries an ovulation marker** — day 23, 2026-09-05, added by Tirzah after 2026-08-26. Every earlier
  statement in this plan that cycle 5 has no marker is stale (found in ca2, 2026-09-13). There are five markers.
- **The coverline comparison must run in integer hundredths of a degree, not floating point.** Found in ca2 while
  recomputing the expectations below: `97.88 + 0.1` is `97.97999999999999` in JS, so a temperature of exactly
  `97.98` tests as *above* a coverline that it actually ties. On cycle 4 that one tie opened the safe window at d36
  instead of d37 — a day early, on the unsafe side. Multiply every temperature and the `+0.1` / `+0.2` margins by
  100 and round to integers before comparing. A tie must never count as clearing the coverline.

## Locked decisions

Carried intact from the scrapped wheel slice. These are settled; do not re-litigate.

- **Two safety states only: Safe / Unsafe.** "Unsafe" absorbs "unknown".
- **The safety rule, in full:**
  1. The **opening bleed run** (Day 1 through the last *consecutive* bleeding day) → **Safe**.
  2. The day after that, until the post-ovulation window opens → **Unsafe**.
  3. The post-ovulation window opens on the **later** of (a) ovulation marker + 4 days, or (b) the three-over-six
     fire day. **With no ovulation marker the window never opens** — three-over-six may only *delay* the opening,
     never trigger it on its own.
  - Rule 1 keys off the **opening run specifically**, so mid-cycle breakthrough bleeding can never flip a fertile
    day to Safe.
- **Three-over-six:** coverline is the max of the six usable temps *before* the first high, plus 0.1. All three
  highs must exceed it and the third must clear it by ≥ 0.2°F. The six baseline days **must not overlap** the three
  high days — that overlap was a real bug in the prototype and made the rule never fire.
- **Ovulation day is a manual marker only.** No calculation may ever declare one.
- **No ovulation marker => no coverline.** Before the marker there is no coverline anywhere in the app.
- **Status vocabulary is Bleeding / Follicular / Luteal only**, shown plainly and never qualified. **Ovulation is
  never a status** — it is only known days later. The "Current Phase" card loses its `Ovulation` value.
- **"N days unlogged"** is surfaced whenever the data is behind, in a warning colour.
- **Missed-Day-1 guard:** cycle day ≥ 29 **and** unlogged days > 0 → the status line reads
  "Period may have started — log to confirm".
- **Cycle day is date arithmetic** from ca2's `Cycle Start` flag. Never a lookup of the last logged row.
- Expected safe-window openings against the real data, as a regression check: **d24 / d22 / d30 / d37 / d27**.
  Cycle 5 was `never` while it had no ovulation marker; with the day-23 marker and no three-over-six fire, it opens
  at marker + 4. Recomputed against the migrated data in integer hundredths on 2026-09-13; cycles 1-4 reproduce
  their original values exactly, which is what makes the new cycle-5 figure trustworthy.

## Constraint — the viewer sees no gate

Tirzah gets no design checkpoint on this plan (her choice). Her screen therefore changes **only** where a change is
a correctness or safety requirement: the safety verdict itself, the phase vocabulary, and the unlogged warning.
Nothing else about the dashboard's appearance moves in this slice.

## Dependencies

Slice ca3 landed. The rule needs ca2's `Flow` column for the opening bleed run and its `Cycle Start` flag for
cycle day, so it cannot run against the old schema. Note that ca2 put spotting days into `Flow` as `spotting`,
distinct from `bleeding` — the opening bleed run is `bleeding` only, or the run would swallow the spotting days
that trail the end of cycles 3 and 4.

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: the engine reproduces **d24 / d22 / d30 / d37 / d27** on the
  real data; a temperature that exactly ties the coverline is treated as *not* clearing it; the three-over-six baseline window provably does not overlap its three high days; a cycle with its
  ovulation marker removed never opens the window; mid-cycle breakthrough bleeding does not produce a Safe day;
  and today's cycle day matches the hand-count.
- **Live test is Mike's**, on his phone: confirm the Safe/Unsafe verdict and its hint text, confirm the phase card
  never reads "Ovulation", and confirm the unlogged counter appears after a skipped day.
