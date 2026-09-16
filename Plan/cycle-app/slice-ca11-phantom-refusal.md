# Slice ca11 — The refusal that never happened (stub)

## Scope

Apps Script can answer a write that **already succeeded** with `no-access`. The app treats that as a final refusal,
tells Mike he has no access, and — since ca9a — forgets he is the writer. Make a refusal survivable. Nothing else.

## What happened (2026-09-15, observed, then reproduced on demand)

Straight after ca10 was committed, `verify.bat` was run four times against the live endpoint. Three runs failed,
each a different way, all on the same flaky hop ca10 is about:

1. a read that never came back (ca10's retry did not cover it — `verify-proxy` retried error codes but not
   silence; fixed in the ca11 commit, see below);
2. a reader-token read that gave up after four no-answers;
3. **twice, a write refused with `{"ok":false,"error":"no-access"}` — using the writer token that had worked
   seconds earlier in the same run.**

(3) is the new finding. A refusal is the one reply this plan has always treated as certain.

## Verified facts (2026-09-15, from probes in the scratchpad, not theory)

- **Apps Script's `/exec` answers a POST with a `302`** — 39 of 40 POSTs, the fortieth timed out. Not 307/308.
- **The script runs on the first hop. The redirect points at a one-time URL that holds the already-computed
  answer.** Google stores the result and hands back a link to it; the body is never re-sent.
- **Fetching that link a second time does not replay the answer — it runs `doGet` with no token:**

  | request | 1st GET of the redirect target | 2nd GET of the same target |
  |---|---|---|
  | POST with the writer token | `{"ok":false,"error":"bad-request: date must be YYYY-MM-DD"}` | `{"ok":false,"error":"no-access"}` |
  | POST with a junk token | `{"ok":false,"error":"no-access"}` | an HTML page |

  (A deliberately malformed date was used throughout, so nothing was ever written. `bad-request` is proof the
  token was accepted; `no-access` is `doGet` at `Apps Script/Code.gs:41` seeing no `t` parameter.)
- **So `no-access` has two meanings and they are byte-identical:** the token is wrong, or the answer link got
  fetched twice. Nothing in the reply distinguishes them.
- **The second fetch is not something this code asks for.** 80 ordinary POSTs through `fetch` (both tokens, good
  and bad, alternating) produced zero phantoms — but the HTTP stack may re-issue a request on a connection it
  considers failed, and that is enough. It happened twice in four `verify.bat` runs.
- **The write has already landed when this happens.** The script ran on the first hop. This is ca10's lesson in a
  new costume: a reply that says the write was refused is not evidence that the sheet lacks the row.
- **The app acts on a refusal in two ways, both irreversible-looking to Mike:** `postEntry()` returns it as final
  and never retries (ca10, deliberately), and `forgetRole()` drops the remembered `writer` role (ca9a) — so one
  hiccup can demote a writer to "no access" on a cold, offline-capable app whose cache has just been cleared.
- A refusal is also **never queued** (ca6). A phantom refusal therefore loses the entry from the queue's point of
  view while the row may be sitting in the sheet — the exact pair of claims ca10 spent a slice removing.

## The fix, in one sentence

**A refusal must be confirmed before it is believed:** send it once more, and only a second refusal counts.

Re-sending is safe for the same reason ca10's retry is safe — `doPost` is update-or-insert keyed on the date under
a script lock, so the second send rewrites the same row rather than adding one.

## The risks this slice must not create

- **Do not turn a real refusal into a retry loop.** ca6 is explicit: a refusal behind a loop is a banner nothing
  can clear. One confirming re-send, not the ca10 budget.
- **`forgetRole()` must fire only on a confirmed refusal**, and still exactly once. ca9a's whole point is that the
  write path is the only place that can learn a remembered `writer` is wrong; making it fire on a phantom is
  worse than not firing at all, and making it fire twice re-breaks ca9a.
- **Do not weaken the read path's refusal handling on a guess.** The same phantom is possible on a GET (the JSONP
  read follows the same two hops), but it was not observed there and a read has no queue to corrupt. Establish
  whether it can happen before changing it.
- **Do not make a genuine `read-only` cost Tirzah two round trips on every action.** She never writes; check where
  the write path can even be reached from her side before adding a second request to it.

## Open questions for the expanding session

1. **Does one extra send actually settle it?** The phantom comes from a re-fetch, so a second POST is a fresh
   script run with a fresh answer link — very likely clean. Confirm the reasoning holds rather than inheriting it.
2. **Is `not-configured` in the same class?** It is a refusal today. It cannot be a phantom (it comes from the
   first hop's own script run), so it may not need the extra send.
3. **Should the confirming send be visible?** Per the standing rule about silent background failures: a phantom
   that was survived is still evidence Google's hop is misbehaving, and a `console.warn` costs nothing.
4. **Does the same doubt apply to a `bad-request`?** It is a reply, so it is trustworthy in the same way the good
   replies are — but it is worth one sentence in the code saying why it is not treated like `no-access`.
5. **Can `verify-proxy` tell the two apart better than the app can?** It has both tokens and can re-read the sheet,
   so it may be able to assert "this refusal was real" rather than retrying blind.

## Dependencies

ca10 (the retry loop this sits next to), ca9a (`forgetRole()`), ca6 (the queue), ca5 (`doPost`). Runs before ca8.

## Exit criteria

- A single refusal never reaches Mike, the queue, or `forgetRole()`; a repeated one does, unchanged.
- The confirming send is bounded — one, not a budget — and says so in the console.
- `Tools/queue-selfcheck.js` covers: a phantom refusal followed by success (the day is saved, the role survives,
  nothing is reported as a problem), and a genuine refusal (refused once to Mike, role forgotten once, not
  queued). Both mutation-tested red first.
- `verify.bat` passes end to end, with no phantom refusal counted as a failure.
- **Live test is Mike's**, and it is the same honest exit ca10 has: this is intermittent, so the evidence is the
  console showing a phantom being survived during normal use.

## Already done, in the ca11 commit, not by the expanding session

`Tools/verify-proxy.js` now retries when Google never answers, not only when it answers with an error code — one
shared `flakyFetch()` for the read and write sides, same four attempts and `attempt * 1000` backoff as before.
Failure (1) above was this and only this. The phantom refusal was left alone: it is what this slice is for.
