# Slice lw5 — Writer-only catch-up entry screen (stub)

## ⛔ BLOCKED ON THE DESIGN GATE

Do not expand this stub into a full spec until the gate clears. See `README.md`.

## Scope

The entry screen Mike uses to log from his phone instead of opening Google Sheets. Writes go straight to the sheet
via the proxy in this slice — the offline queue and unsent banner are slice 6.

## Verified facts

- Slice 2 fixes the schema; slice 3 fixes the transport. This slice adds a `doPost` (or equivalent) write endpoint
  to the existing Apps Script, gated on the **writer** token only.
- Slice 2's decision that there are **no pre-created future rows** means every write here either appends a new row
  for a date or updates the existing row for that date. There is no "fill in the blank row" case.

## Locked decisions

- **Backfill is the primary use pattern**, not same-day logging. The screen is a **catch-up list running newest
  first — today at the top, working backwards** — not a single-day form.
- Fields, in the slice-2 schema: Temp (required), Temp Quality (multi-select: off-time, disturbed), Exclude,
  Flow (none / spotting / bleeding), Cervical Mucus (5-point), Cervix Texture (firm / medium / soft), Cervix
  Position (low / mid / high, optional), Breasts (none / minor / sore), Ovulation marker, Cycle Start, Note.
- **Ticking a Temp Quality flag pre-ticks Exclude** as a suggestion. It is overridable, not forced.
- The app **suggests `Cycle Start`** when bleeding begins after a long non-bleeding stretch. Mike confirms or
  overrides — it is never set automatically.
- **Second readings go in the Note field.** No dedicated field and no parsing of notes into temps, ever.
- The ovulation marker is entered **by hand only**. Nothing on this screen may suggest an ovulation day.
- **Writer token only.** The entry screen must not render at all for the reader token, and the endpoint must reject
  a reader token server-side as well — not just hide the UI.
- **Every write failure is visible.** No silent swallow, no optimistic UI that pretends a failed write succeeded.
- Phone-first: thumb-reachable, minimal typing, no tiny tap targets.

## Dependencies

Slice 4 landed, **and** the design gate cleared.

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: a write with the writer token lands in the right row; a write
  with the reader token is rejected server-side; a write for an existing date updates rather than duplicating.
- **Live test is Mike's**, on his phone: log a day, log three backdated days in one sitting, confirm the wheel
  updates, and confirm a deliberately broken write shows an error rather than appearing to succeed.
