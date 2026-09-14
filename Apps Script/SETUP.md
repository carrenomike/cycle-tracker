# ca3 setup — the proxy and the two tokens

Everything here is done once, by hand, in a browser. Nothing in this file's
sequence puts a secret into this repo: the repo is public and stays public.

## 1. Make two tokens

Any two long random strings. From a terminal:

```bash
node -e "console.log('reader', require('crypto').randomBytes(24).toString('base64url')); console.log('writer', require('crypto').randomBytes(24).toString('base64url'))"
```

Keep them somewhere private (a password manager). They are the only thing
protecting the data.

## 2. Create the Apps Script

1. Open the **new** sheet → Extensions → Apps Script.
2. Delete whatever is in `Code.gs` and paste in this folder's `Code.gs`.
3. Fill in the four constants at the top: the new sheet's ID (from its URL,
   between `/d/` and `/edit`), the tab name if it isn't `Sheet1`, and the two
   tokens from step 1.
4. Save.

## 3. Deploy it

Deploy → New deployment → type **Web app**:

- Execute as: **Me**
- Who has access: **Anyone**

"Anyone" is what lets Tirzah's phone reach it without a Google login. The
tokens are the access control, not this setting.

Copy the **/exec** URL it gives you.

> Every time you change `Code.gs`, you must **Deploy → Manage deployments →
> edit → New version**. Saving alone changes nothing that is live.

> **Re-entering the secrets is part of every paste.** The repo's `Code.gs` is a
> template: `SHEET_ID`, `READER_TOKEN` and `WRITER_TOKEN` are blank in it, so
> pasting it over the editor wipes the live values. Put all three back *before*
> deploying, or every request comes back `not-configured`. (Happened 2026-09-14
> on the ca3b redeploy.)

## 4. Point the app at it

In `index.html`, set `PROXY_URL` to that /exec URL, then run `deploy.bat`.
The URL is not a secret — it is fine in the public repo.

## 5. Verify, before anyone's phone is involved

```bash
node Tools/verify-proxy.js <execUrl> <readerToken> <writerToken> <newSheetId>
```

This checks the rejection paths, both roles, that the sheet itself is private
to a logged-out fetch, that the ca2 paste landed intact (165 rows,
2026-03-25 to 2026-09-11), and that the dashboard's numbers still come out the
same — 5 cycles, the five Day-1 dates, and ovulation on days 16/18/23/31/23.

Do not go on until it says **All checks passed**.

## 6. Send the links

- Tirzah: `https://carrenomike.github.io/cycle-tracker/#t=<readerToken>`
- Mike:   `https://carrenomike.github.io/cycle-tracker/#t=<writerToken>`

The part after `#` is never sent to any server. The app saves it on first open
and wipes it from the address bar straight away. Send each link once, over
something reasonably private, and tell the person to open it and then add the
page to their Home Screen.

Lost or leaked link → change that token in `Code.gs`, redeploy a **new
version**, and send a fresh link.

## 7. Lock the old sheet

Only after step 5 passes and both phones have loaded: open the **old** sheet →
Share → set General access to **Restricted**. Keep the sheet; it is the
keepsake. Its ID has been public since the first commit, so leaving it readable
leaves the whole history readable.
