# Slice ca5 — Writer-only catch-up entry screen (stub)

## Scope

The entry screen Mike uses to log from his phone instead of opening Google Sheets. Writes go straight to the sheet
via the proxy in this slice — the offline queue and unsent banner are slice 6.

## Verified facts

- Slice ca2 fixes the schema; slice ca3 fixes the transport. This slice adds a `doPost` (or equivalent) write
  endpoint to the existing Apps Script, gated on the **writer** token only.
- The entry screen is the **Log tab**, the second of the writer's two tabs. The reader renders no tab bar at all.
  Tab visibility is cosmetic — the write endpoint's token check is the only thing that actually stops a write.
- Slice ca2's decision that there are **no pre-created future rows** means every write here either appends a new row
  for a date or updates the existing row for that date. There is no "fill in the blank row" case.
- **`Temp Quality` is blank on all 165 migrated rows.** ca2 deliberately set none of them — 15 rows carry notes
  hinting an off-time or disturbed reading (`Switched to 6:30 AM`, `97.37 (4a)`, `Deep sleep`, `Bakersfield`), and
  the migration refused to guess. Re-run `Tools/migrate-sheet.js` against the old sheet to reprint that list; Mike
  sets those 15 by hand through this screen.
- **6 migrated rows have no temperature**, including Day 1 of cycle 1. Temp is required for a *new* entry made here,
  but this screen must be able to open and edit an existing temp-less row without inventing a value for it.

## Locked decisions

- **Backfill is the primary use pattern**, not same-day logging. The screen is a **catch-up list running newest
  first — today at the top, working backwards** — not a single-day form.
- Fields, in the ca2 schema: Temp (required), Time (the time the temp was taken), Temp Quality (multi-select:
  off-time, disturbed), Exclude,
  Flow (none / spotting / bleeding), Cervical Mucus (5-point), Cervix Texture (firm / medium / soft), Cervix
  Position (low / mid / high, optional), Breasts (none / minor / sore), Ovulation marker, Cycle Start, Note.
- **Ticking a Temp Quality flag pre-ticks Exclude** as a suggestion. It is overridable, not forced.
- The app **suggests `Cycle Start`** when bleeding begins after a long non-bleeding stretch. Mike confirms or
  overrides — it is never set automatically.
- **Second readings go in the Note field.** No dedicated field and no parsing of notes into temps, ever. ca2
  confirmed why: the notes carrying second readings are misaligned with their rows in the source data.
- **Free-text detail migrated into the Note** as `cervix: <original wording>` / `mucus: <original wording>` on 29
  rows, so ca2's mapping to the new enums stayed lossless. Editing such a row must not silently drop that text.
- The ovulation marker is entered **by hand only**. Nothing on this screen may suggest an ovulation day.
- **Writer token only.** The entry screen must not render at all for the reader token, and the endpoint must reject
  a reader token server-side as well — not just hide the UI.
- **Every write failure is visible.** No silent swallow, no optimistic UI that pretends a failed write succeeded.

## Added by ca3 (2026-09-13)

- The proxy is live and is `Apps Script/Code.gs`; `Apps Script/SETUP.md` is the redeploy sequence. **Editing the
  script is not enough — Deploy > Manage deployments > edit > New version, or nothing changes.**
- `doGet` already resolves the caller to `'reader'` or `'writer'` before touching the sheet, and `reply()` handles
  JSON and JSONP. Reuse both; the role string is already there for `doPost` to reject a reader on.
- **Google's `/exec` redirect is intermittently flaky.** It bounces to a second host that drops back-to-back
  requests with a 404; ca3's first verification run failed three of five checks on a correct setup. A write that
  fails this way has *not* necessarily failed. Whatever this slice ships must not double-write on a retry — make
  the write idempotent per date, which the "one row per date, append or update" rule already allows.
- Writes cannot use JSONP (it is GET-only). The write path needs `fetch` against the `/exec` URL, so confirm CORS
  behaves from GitHub Pages before building the UI on top of it — this is the slice's first unknown.
- The token lives in `localStorage` under `cycleToken`, read once into `TOKEN` at startup by `bootstrapToken()`.
- `Tools/verify-proxy.js` is the harness to extend for the write endpoint; it already has the retry logic.
- Phone-first: thumb-reachable, minimal typing, no tiny tap targets.

## Dependencies

Slice ca4 landed. (The entry screen writes the columns ca4's safety rule reads, so landing it first means a
backdated entry immediately moves a verdict that is already correct.)

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: a write with the writer token lands in the right row; a write
  with the reader token is rejected server-side; a write for an existing date updates rather than duplicating.
- **Live test is Mike's**, on his phone: log a day, log three backdated days in one sitting, confirm the dashboard
  updates, and confirm a deliberately broken write shows an error rather than appearing to succeed.
- **Live test on Tirzah's phone:** the reader build shows no tab bar and no route to the Log tab.

## Added by ca3a (2026-09-13)

- **The log table does not show four of the columns this slice writes.** It has Day, Date, Temp, Cervix Texture,
  Cervical Mucus, Breasts, Phase and Note — no `Flow`, `Temp Quality`, `Cervix Position` or `Exclude`. A day logged
  as spotting-only, or a reading marked off-time and excluded, will be invisible in the table it was just entered
  into. Add the columns here, or the entry screen will look like it silently dropped the value.
- ~~ca3a removed the table's `Time` column: the ca2 schema has no `Time`, so it rendered blank on every row.~~
  **Wrong — reversed by ca2a (2026-09-14).** `Time` is a real column with 88 recorded values; ca2 had dropped it
  and this note repeated the log's false claim that it was empty. The column is back in the table and in the
  sheet. **This slice must write it**: the entry screen takes a time alongside each temp. Note that Sheets stores
  a time cell as a Date on its 1899 epoch day — `cell()` in `Code.gs` handles that on read, and a write path has
  to send a string Sheets will accept as a time, not a date.
- `adaptRows`' `flag()` helper is the single place yes/no columns are read. Anything this slice writes to
  `Cycle Start`, `Ovulation` or `Exclude` should be the literal `TRUE`, matching what a ticked Sheets checkbox
  flattens to through the proxy.

## Added by ca3b (2026-09-14)

- **Write `Time` as the literal string `h:mm AM`** (e.g. `6:32 AM`, `12:07 AM` for midnight, `12:00 PM` for noon).
  That is what `fmtTime` in `migrate-sheet.js` produced for the 88 migrated rows and what `cell()` in `Code.gs`
  renders on read, so a new entry that matches it is indistinguishable from a migrated one. `verify-proxy` now
  fails any row whose `Time` does not match `h:mm AM/PM`, so a divergent write is caught on the next run.
- **`verify-proxy`'s row, last-date and time counts are now floors, not equalities**, precisely so this slice's
  first new entry does not fail the check. Do not turn them back into equalities; raise the floors if you want to
  pin a new baseline.
- **Adding a column means three edits, and one check enforces them.** `NEW_COLS` in `migrate-sheet.js`, `hasData`
  in `index.html`, and the table header/body in `buildLogRows`. `adapter-selfcheck` fails if `hasData` does not
  name every `NEW_COLS` column, so the first two cannot drift apart.
- **`cell()` decides a Date's format from the column name, not the value.** If this slice adds a second
  time-of-day column, add its name to `TIME_COLS` in `Code.gs` or it will arrive as `1899-12-30`.
