# Slice lw3 — Apps Script proxy, two tokens, private sheet (stub)

## Scope

Stand up a Google Apps Script web app in front of the new sheet, make the sheet fully private, and switch the app's
read path from the public `gviz/tq` endpoint to the proxy. Tokens arrive by URL fragment on first open and are
stored locally. **Read only in this slice** — the write endpoint is not built or exposed until slice 6.

After this slice: both phones open the same URL with their own token and see the existing dashboard, fed from the
new private sheet. A bad or missing token shows a plain explanatory message.

## Verified facts

- `index.html:1032` — current read is a JSONP `<script>` injection at the `gviz/tq` endpoint with a
  `responseHandler` callback. JSONP is used because the app must work from `file://` as well as GitHub Pages.
- `index.html:1009-1016` — the row-parsing code that consumes the gviz response shape. Changing the transport means
  changing what this parses; keep the parsed row object shape identical so nothing downstream has to change.
- The repo is public and served at `https://carrenomike.github.io/cycle-tracker/`. The Apps Script URL will be
  visible in that public source. It is discoverable and its quota is burnable by anyone who finds it.

## Locked decisions

- **Two tokens: reader (Tirzah) and writer (Mike). The writer token also grants read**, so Mike carries one link.
- Tokens are checked **inside the Apps Script**, as a query parameter. The tokens themselves are never committed to
  the repo — only the Apps Script URL is.
- **Token delivery: a one-time link with the token in the URL fragment** (`#t=...`). Text after `#` never leaves the
  browser. The app stores it on first open and strips the fragment from the address bar immediately.
- Recovery = re-send the link. Rotation = change the constant in the Apps Script and redeploy.
- **A bad or missing token must produce a visible message, never a blank wheel and never a silent retry loop.** So
  must a network failure, a quota rejection, and a malformed response. This project has repeatedly lost time to
  silent background failures — every failure path here gets a visible state.
- The token check must run **before** any sheet read, so a bad token costs no quota.
- Call `navigator.storage.persist()` on first run, and ship a small web manifest so Add to Home Screen installs
  properly. On Chrome/Android there is no Safari-style 7-day storage eviction, so Home Screen is convenience, not
  load-bearing — but the token must survive an ordinary browser restart.
- Target browser is **Chrome on Android** only. No Safari/ITP workarounds.
- The repo **stays public**. All the security is in the tokens. Revisitable later; not this slice.
- **The old sheet's public access is revoked at the end of this slice**, once the proxy is confirmed working. The
  old sheet itself is kept as a keepsake — private, not deleted.

## Dependencies

Slice 2 landed (the new sheet exists and is populated).

## Exit criteria

- No typecheck, test or build exists in this project.
- Headless verification, stated in the STATE line: proxy returns rows with a valid reader token; returns a clean
  rejection with no token, a wrong token, and a token for the wrong role; the sheet's own URL returns a permission
  error to a logged-out fetch.
- **Live test is Mike's**, on both phones: open the link with the fragment, confirm the address bar is clean
  afterwards, close and reopen the browser and confirm it still loads, then confirm that opening the bare URL in a
  fresh profile shows the "no access" message rather than a blank page.
