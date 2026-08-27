# Slice lw8 — Restyle the dashboard tab to match (stub)

## ⛔ BLOCKED ON THE DESIGN GATE

Do not expand this stub into a full spec until the gate clears. See `README.md`.

## Scope

Bring tab 2 into the visual language the gate approved, so the two tabs do not look like two different apps. Colour,
type, spacing, chart styling. **No behaviour change** — the dashboard's logic, charts and tables stay exactly as
slice 4 moved them.

## Verified facts

- Slice 4 moves the existing Chart.js dashboard into tab 2 intact. This slice touches presentation only.
- Chart.js 4.4.0 is loaded from a CDN; restyling means Chart.js options and CSS, not a charting-library swap.

## Locked decisions

- The dashboard **survives intact**. It is restyled, never rebuilt. If this slice starts changing what the charts
  compute, it has gone out of scope.
- **Ovulation stays purple** on both tabs.
- The tab-1 rules that are about *meaning* carry over: no coverline before ovulation is marked, and no calculated
  ovulation day anywhere.
- The visual language is **earthy/organic, not tech-forward dashboard** — as approved at the gate, not re-decided here.
- Mobile-first. Both phones are Galaxy S22 Ultras in Chrome.

## Dependencies

Slice 4 landed, **and** the design gate cleared. Best run after slices 5-7 so the whole surface is restyled in one
pass rather than twice.

## Exit criteria

- No typecheck, test or build exists in this project.
- Nothing to verify headlessly — this slice has no logic. Confirm by diff that no computation changed.
- **Live test is Mike's**, on his phone, then Tirzah's: both tabs read as one app, and every number on tab 2 is the
  same as it was before the restyle.
