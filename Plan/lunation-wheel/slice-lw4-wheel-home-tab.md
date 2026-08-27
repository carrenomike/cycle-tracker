# Slice lw4 — Wheel becomes the home tab (stub)

## ⛔ BLOCKED ON THE DESIGN GATE

Do not expand this stub into a full spec until Mike has signed off on the prototype's look **and** Tirzah has seen
it and likes it. See the design gate section in `README.md`. Writing this spec early means describing an interface
nobody has approved.

## Scope

A two-tab app. Tab 1 is the lunation wheel, the new home screen. Tab 2 is the existing Chart.js dashboard, moved
wholesale and otherwise unchanged. Mobile-first; both phones are Galaxy S22 Ultras in Chrome.

## Verified facts

- `index.html` is a single ~1055-line vanilla JS/HTML file with Chart.js 4.4.0 from a CDN and no build step.
- `index.html:301-330` — mean-synodic moon maths already exists (`SYNODIC_MONTH = 29.530588853`,
  `NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14)`) and is accurate to a few hours. Reuse it; do not add a library.
- `index.html:342-351` — `calcCoverline` already exists and already returns `null` until ovulation is marked.
- `index.html:375-389` (post-slice-1) — the dashboard's `dayNumber` already computes cycle day by date
  arithmetic off `current[0]._date`, normalising both ends to local midnight. Reuse that pattern for the wheel's
  cycle day; the only difference is that the anchor becomes the `Cycle Start` flag instead of `current[0]`.
- `detectOvRow` (post-slice-1) returns the manual marker or `null` — it no longer infers ovulation from mucus.
  The wheel can call it directly without re-checking.
- The wheel's geometry, safety engine and information layout were prototyped and verified against the real sheet
  data on 2026-08-26. The prototype is scratchpad-only and is **not** a source file — port the logic, not the file.

## Locked decisions — structure (settled, not re-openable by the design gate)

- **One wheel = one lunation. New moon always at top.** Swipe left/right between lunations; a button returns to the
  current one.
- One slice per calendar day of the lunation (29 or 30), each 360/n degrees wide.
- **Ring 1 (inner) = temperature**: bar length plus the coverline, coloured binary blue/red against it. No colour ramp.
- **No coverline exists unless ovulation is marked.** Before that, bars are neutral grey and no dashed line is drawn.
  The recolour when it appears *is* the signal.
- The coverline renders as a **dashed arc spanning only its own cycle's slices** — never a full circle. A lunation
  can straddle two cycles with two different coverlines.
- **Ring 2 = flow and the ovulation marker.** Ovulation is purple on both tabs.
- **Today's slice is drawn as an outline/stroke, not a fill.**
- **Rim labels are cycle days.** Calendar dates appear only at the four moon quarters, plus on the Day-1 spoke.
  Minor moon glyphs are dimmed so the four quarters read as anchors.
- The **fertile-window arc is dropped.**
- **The centre is pinned to today, always** — on every lunation swiped to, not just the current one. Four lines:
  cycle day / status / safety / "N days unlogged" (last line only when behind, in a warning colour).
- Status vocabulary is **Bleeding / Follicular / Luteal** only, shown **plainly and never qualified**. Ovulation is
  never a status — it is only known days later.
- **Cycle day is date arithmetic** from the `Cycle Start` flag. Never a lookup of the last logged row.
- **Missed-Day-1 guard:** cycle day ≥ 29 **and** unlogged days > 0 → the status line reads
  "Period may have started — log to confirm".
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
- Expected safe-window openings against the real data, as a regression check: **d24 / d22 / d30 / d37 / never**.
- The existing dashboard **moves intact** into tab 2. It is not rebuilt and not re-specified. Its restyle is slice 8.
- The **visual language is earthy/organic, not tech-forward** — the design gate settles what that means.

## Open question the design gate must answer

- Whether future slices render differently from past-unlogged slices, or identically. The prototype's "Mark
  unlogged" toggle exists to answer this; Mike has not yet reported back on it.

## Dependencies

Slice 3 landed, **and** the design gate cleared.

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: the safety engine reproduces d24 / d22 / d30 / d37 / never on the
  real data, and cycle day for today matches the hand-count.
- **Live test is Mike's**, on his phone: swipe between lunations, confirm the centre stays pinned to today
  throughout, confirm the return-to-current button works, and confirm tab 2 shows the dashboard exactly as before.
- Tirzah opens it on her phone and can read it without explanation.
