# Slice ca10 — Surviving the flaky second hop (stub)

## Scope

A write that **landed** was reported to Mike as a write that failed. Give the app the retry `verify-proxy` has had
since ca5, and stop the queue asserting a thing it has not observed. Nothing else.

## What happened (2026-09-15, observed live, not theorised)

Mike opened the app and got ca6's queue banner:

> last attempt: the server did not reply within 30 seconds. Tue, Sep 15 could not be sent: the server did not
> reply within 30 seconds

The dashboard loaded fine alongside it. A read through the proxy confirmed the sheet already held
`2026-09-15` with `Temp: "99"` — **the row was written.** The POST reached Apps Script, `doPost` did its job, and
the reply never made it back inside the client's 30s budget. The client had no way to tell that apart from a write
that never happened, so it queued the entry and said so.

`verify.bat` was run at the same time and passed every check, end to end, including the whole ca5 write endpoint.
So this is not `Code.gs`, not the deployment, not the tokens, and not ca9 (which was committed in `85f73e5` but
never pushed — `origin/main` was still `e324f09` at the time).

## Verified facts (2026-09-15)

- **The cause is already documented in this repo**, at `Tools/verify-proxy.js:92`: *"Apps Script redirects `/exec`
  to a second Google host, and that second hop intermittently 404s or 5xxs under back-to-back requests."*
- **`verify-proxy.js` survives it and the app does not.** Both `call()` and `post()` retry up to 4 attempts on a
  404 or a 5xx, backing off `attempt * 1000` ms and saying so out loud. `postEntry()` in `index.html` makes exactly
  one attempt and treats anything else as final.
- `postEntry()` (`index.html:1219`) is the single write path — `saveEntry` and `flushQueue` both go through it, so
  a retry belongs there and nowhere else.
- `AbortSignal.timeout(30000)` in the app; `verify-proxy` allows 45000.
- **Re-sending is already safe and the code says so in three places.** `doPost` is update-or-insert keyed on the
  date, under a script lock, and only changed fields are sent — so a retry rewrites the same row rather than adding
  a second. `flushQueue`'s own comment relies on this already.
- `flushQueue` already counts attempts per entry (`e.tries`) and records `e.lastError`. `e.tries` is not currently
  shown to anyone.
- An entry leaves the queue **only** on a confirmed `ok:true` (ca6), and refusals (`read-only` / `no-access` /
  `not-configured`) are never queued and must never be retried — a refusal will refuse again.

## The two halves of the fix

1. **Retry the hop.** Mirror `verify-proxy`'s rule in `postEntry()`, because the two have to agree: if the tool
   that verifies the write path tolerates a flake that the app calls a failure, the tool is not verifying the app.
2. **Stop the banner asserting what it has not observed.** "could not be sent" is a claim about the sheet, and a
   timeout is not evidence for it. This is ca3b's lesson exactly, and ca7 already applied it once — the 20s load
   timeout was changed to say only that nothing came back, rather than blaming a quota. The queue needs the same
   correction: after a timeout the honest sentence is that the app did not hear back and does not know whether it
   landed, and that re-sending is safe either way.

**ca6's invariant has a converse nobody wrote down.** ca6 recorded that `ok: true` means the request was accepted,
not that the sheet holds what was sent. The mirror image is now live: **a timeout does not mean the write did not
land.** Whichever way this slice goes, that sentence belongs in STATE's open deviations or designed out.

## The risk this slice must not create

- **Do not retry a refusal.** ca6 is explicit: a refusal queued behind a retry loop is a banner no retry can ever
  clear.
- **Do not retry silently or forever.** Per the global rule this project keeps losing time to, a retry that hides
  a real outage is worse than the false alarm it replaces. Whatever the budget is, exhausting it must still produce
  something a person can see, and the console should say each attempt happened.
- **Watch the total wait.** Four attempts at a 30s timeout plus backoff is over two minutes with a card open and
  a spinner running. The budget for a retry after a *timeout* is not obviously the same as after a fast 404.
- **`saveEntry` and `flushQueue` have different appetites.** Mike pressing Save is watching the screen; a boot-time
  auto-flush is not. Retrying identically in both may be wrong.

## Open questions for the expanding session

1. **Does a browser see the 404/5xx at all?** `verify-proxy` runs under node, which follows the redirect with no
   CORS involved. On the phone the second hop must also answer CORS, and a redirect that fails CORS surfaces as a
   fast `TypeError`, not as a status code — so the browser's symptom may be a `TypeError`, a 404, *or* the 30s
   timeout Mike actually saw. Establish which before choosing what to retry on; retrying the wrong signal fixes
   nothing and retrying everything re-sends on genuine refusals.
2. **Should a timeout be retried?** It is the one case where the write may already have landed. It is safe because
   the endpoint is idempotent per date — but confirm that before relying on it, rather than inheriting it from
   this stub.
3. **Is 30s the right budget at all**, given `verify-proxy` uses 45s against the same endpoint and passes?
4. **Should `e.tries` become visible** now that it means something — "tried 3 times" on the banner is the
   difference between a flake and an outage, and the data is already there.

## Dependencies

ca6 (the queue and its banner), ca5 (`doPost`). Independent of ca9.

## Exit criteria

- One attempt-count and one backoff rule, shared in spirit with `verify-proxy.js`; if they drift, say why in a
  comment on both.
- A refusal still fails on the first reply, with no retry.
- No message claims a write did not land unless that was actually observed.
- `Tools/queue-selfcheck.js` covers: a flake then a success (the entry leaves the queue, exactly once), a refusal
  (no retry), and an exhausted budget (visible, and the entry stays). Each mutation-tested red first — ca9 shipped
  three false greens, two of them checks that exercised a function instead of the path calling it.
- `verify.bat` still passes.
- **Live test is Mike's.** The flake is intermittent, so the honest exit is the console showing a retry happening
  at least once in normal use, not a one-off green run.
