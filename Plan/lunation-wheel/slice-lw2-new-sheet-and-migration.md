# Slice lw2 — New private sheet, new schema, migrated data (stub)

## Scope

Create a brand-new Google Sheet with a new ID and the new schema, migrate the existing history into it by script,
review the outliers with Mike, and paste the result in. **The app is not switched over in this slice** — it keeps
reading the old sheet, so it stays working the whole time. Slice 3 does the switch.

## Verified facts

- `index.html:243` — `const SHEET_ID = '1F3Wym...'`, in a **public** repo since the first commit `57d49c9`. The ID
  is a burned credential; a new sheet with a new ID is mandatory and non-negotiable.
- `index.html:1047` — the current read is the `gviz/tq` JSONP endpoint, which returns 200 with no auth at all.
- `index.html:1021-1032` — the `Date` column is a real date cell; the raw value carries the year as `Date(y,m,d)`
  even though the formatted string drops it. The migration must read the raw value, not the display string.
- Live sheet as of 2026-08-26: 177 rows, 2026-03-25 through 2026-09-17, with blank pre-created rows at the end.
  Day-1 dates: Mar 25, Apr 26, May 25, Jul 1, Aug 14. Cycle lengths 32 / 29 / 37 / 44 / 35(open).
- Ovulation markers exist on cycles 1-4 (days 16 / 18 / 23 / 31). Cycle 5 has none.
- Rows on cycle-5 days 7 and 8 carry notes `97.64` and `97.59`. These are second thermometer readings and are
  **currently attached to the wrong dates**.

## Locked decisions

- New schema columns: **Date**, **Cycle Start** (boolean), **Temp** (required), **Temp Quality** (multi-select:
  off-time, disturbed), **Exclude** (boolean), **Flow** (none / spotting / bleeding), **Cervical Mucus** (5-point:
  None-Dry / Sticky / Creamy / Watery / Egg-white), **Cervix Texture** (firm / medium / soft), **Cervix Position**
  (low / mid / high, optional), **Breasts** (none / minor / sore), **Ovulation** (boolean marker), **Note** (free text).
- The `Cycle` column **leaves the schema**. Bleeding derives from `Flow = bleeding`; the ovulation marker becomes
  its own boolean column.
- **`Cycle Start` is an explicit boolean**, not derived. Cycle day, the coverline window, the safety rule and the
  Day-1 spoke all hang off it. The app will *suggest* it when bleeding begins after a long non-bleeding stretch;
  Mike confirms or overrides.
- **No pre-created future rows.** One row per actually-logged day. The migration must not carry the blank
  placeholder rows across.
- **Second readings stay in the Note field.** No dedicated column, no new functionality. The migration script must
  **never parse a number out of a note into a Temp cell** — the existing day-7/day-8 notes are misaligned with their
  rows and doing so would fabricate data.
- The **original spreadsheet is kept untouched** as a historical keepsake. Do not delete, edit or repoint it.
- Migration is script → **review the outliers with Mike together** → paste. Not a blind bulk import.
- Do not put the new sheet ID in the repo in this slice. Slice 3 decides where it lives (Apps Script, not source).

## Dependencies

Slice 1 landed.

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: row count old vs new, every Day-1 date preserved, every
  ovulation marker preserved, every temperature identical, every `Exclude` flag preserved, zero blank rows carried
  over, and zero Temp cells that did not exist in the source.
- The list of outliers is presented to Mike and resolved before anything is pasted.
- Live test: none — the app is untouched this slice and must still work exactly as it did after slice 1.
