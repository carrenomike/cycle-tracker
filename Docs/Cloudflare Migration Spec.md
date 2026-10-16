# Spec — Move the data off Google Sheets onto Cloudflare

Standalone spec, two slices (**cf1**, **cf2**). Not part of the finished `Plan/cycle-app/` plan — do not edit that
plan's STATE or README for this.

## Why (Mike, 2026-10-16)

Saving and loading through Apps Script is slow and flaky. Google's `/exec` 302s to a second host, which 404s in
patches and, when re-fetched, runs `doGet` with no token and answers a phantom `no-access` for a write that landed.
ca5a–ca11 were mostly spent working around that hop, plus Sheets parsing a Note of `=1+1` as a formula. The
spreadsheet itself is not the complaint — Mike does not need to hand-edit cells.

## Locked decisions (grill, 2026-10-16 — do not re-litigate)

- **Cloudflare Worker + D1**, free plan. Supabase rejected: free projects pause after a week idle (a silent
  failure for Tirzah), no free backups, and its login/row-rule model does not fit the two-token design.
- **Same two tokens.** Neither link changes. Tokens live as Worker secrets (`wrangler secret put`), never in the
  repo. Unsent queue entries from before the switch flush to the new server unchanged.
- **Same wire protocol**, so the app change is the server address plus deletions: GET `?t=&callback=` answering
  JSONP `{ ok, role, cols, rows }` (keep `tz` if anything still reads it); POST `text/plain` JSON body
  `{ t, date, values }` / `{ t, date, op: 'delete' }`, same error strings (`no-access`, `read-only`,
  `not-configured`, `unknown-column:`, `bad-request:`). POST replies carry `Access-Control-Allow-Origin: *`.
- **Saving a day with every field blank deletes it.** Decided server-side after the merge (the client sends only
  changed fields, so only the server sees the whole row). Reply `action: 'deleted'`. No delete button.
- **Switchover:** copy, then check counts and every value match, **then** flip `PROXY_URL`. At the flip the old
  `doPost` refuses every write with a new refusal (`moved: reload the app`) so a stale offline copy fails loudly
  and its entry stays in the unsent queue for after reload. Old `doGet` stays on for now. The sheet is kept,
  frozen, as a backup. (The original pre-ca2 spreadsheet stays untouched as before.)
- **Cleanup — delete only the redirect workarounds**: ca11's confirm-a-refusal-with-a-second-send (app and
  `verify-proxy.js`), and treating 404/5xx as "may have landed". **Keep** the unsent queue, retry on
  timeout/no-signal, `unknown` (a timeout still may have landed), offline shell. Rewrite `verify-proxy.js` /
  `verify.bat` for the Worker.
- **Backups:** D1 Time Travel (7-day rewind on free) plus a writer-only **Download all data** button on the Log
  tab that saves a CSV. Built client-side from the rows already loaded — no new endpoint. No scheduled backup job.

## Design defaults (change only with a reason in the commit)

- One table: `days(date TEXT PRIMARY KEY, data TEXT NOT NULL)`, `data` = JSON object of column → string. A new
  field is one edit to the Worker's `COLS` list, never a schema change. Read = `SELECT … ORDER BY date`, so the
  sheet's insert-in-date-order logic, the script lock and `unreadableDates` all go — `INSERT … ON CONFLICT(date)
  DO UPDATE` is atomic and a retry rewrites the same row.
- Everything is stored as the string the app sent (flags as `'TRUE'` / `''`). No typing, no formulas, so
  `FLAG_COLS`, `TEXT_COLS`, the RAW write and `textNotStored` have no equivalent.
- `COLS` = the live sheet header at copy time, in the same order. Unknown column on write → `unknown-column:`
  as now (dropping a field the app thought it saved is still the one unforgivable failure).

## cf1 — stand up the Worker and copy the data (app untouched)

1. `Worker/` folder: `wrangler.toml`, one `worker.js` (port of `Code.gs` minus the sheet workarounds), schema
   SQL. Mike creates the account and runs the setup commands; write them out step by step in a `Worker/SETUP.md`.
2. Copy script in `Tools/`: reads through the **current** proxy's `doGet` (already flattened to the strings the
   app uses — reuse, do not re-parse the sheet), writes to D1. Refuses if the header differs from `COLS`.
   Then reads both back and compares: same dates, same value in every column. Any mismatch fails loudly.
3. `verify-proxy.js` pointed at the Worker URL passes every access/role/write/idempotence/delete check, plus
   new: clearing every field deletes the day; a Note of `=1+1` reads back as `=1+1`.
4. Self-check for the Worker's pure logic (merge, all-blank → delete, token check, unknown column) in the house
   style (one `Tools/*-selfcheck.js`, added to `checks.bat`).

## cf2 — switch the app over

1. `PROXY_URL` → Worker. Re-run the copy's compare immediately before (catches days logged since cf1).
2. `Code.gs` `doPost` → `moved:` refusal; app treats `moved` like the other refusals but says "reload".
3. Delete the redirect workarounds listed above, in the app and `verify-proxy.js`, keeping `retry-selfcheck.js`'s
   shared numbers in step.
4. Download-all-data button (writer only, Log tab).
5. `verify.bat` / `%USERPROFILE%\.cycle-proxy.txt` updated for the Worker (the sheet-ID line goes).
6. Live: Mike runs `verify.bat`, logs a real day on the phone, checks Tirzah's link still loads, and confirms a
   stale tab's save is refused with "reload".

## Risks to raise, not bury

- A phone offline across the flip runs the old page and writes to Google → refused (`moved`) and queued; it
  sends to the Worker only after a reload picks up the new `PROXY_URL`. Confirm live.
- `cycleCache`/`cycleRole` are keyed on `PROXY_URL`, so the flip drops both once on each phone — expected; the
  first open after the flip needs a signal to show the role-gated UI.
- Workers free plan: 100k requests/day, 10 ms CPU per request. Fine for two people; a bug that loops requests
  would hit it and fail loudly at midnight UTC reset, not silently.
