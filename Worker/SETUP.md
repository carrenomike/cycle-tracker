# Setting up the Cloudflare Worker (slice cf1)

This puts a copy of the data on Cloudflare and checks it. **The app keeps using Google the whole time** —
nothing here changes what Tirzah or you see. Switching the app over is cf2, a separate session.

Every command below is typed into **PowerShell**. Where it says *paste*, right-click pastes in the terminal.
Nothing here ever goes in the repo: the tokens live only in Cloudflare and in your two files in
`C:\Users\Mike` (the same place as `.cycle-proxy.txt`).

## 1. Make the Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up>, sign up (free plan), and confirm the email.
2. That's all in the browser for now. No credit card needed.

## 2. Log the terminal in to Cloudflare

```powershell
cd "C:\Users\Mike\Desktop\Claude Code\Menstrual Cycle\Worker"
npx wrangler login
```

- If it asks to install `wrangler`, say **y**.
- A browser tab opens — click **Allow**. The terminal then says you're logged in.

## 3. Check it worked

```powershell
npx wrangler whoami
```

It should print your email. Stay in the `Worker` folder for steps 4–8.

## 4. Make the database

```powershell
npx wrangler d1 create cycle
```

- If it asks *"Would you like Wrangler to add it on your behalf?"*, answer **n** (it would add a second,
  differently named entry).
- It prints a block with a line like `database_id = "1a2b3c…"`. Copy just the long ID.
- Open `Worker\wrangler.toml`, replace `PASTE-THE-ID-FROM-SETUP-STEP-4` with that ID (keep the quotes), save.
  The ID is not a secret — it is useless without your login.

## 5. Make the table

```powershell
npx wrangler d1 execute cycle --remote --file=schema.sql
```

If it asks to continue, say **y**. It should finish with a success line.

## 6. Put the Worker online

```powershell
npx wrangler deploy
```

- The first time, it may ask you to pick a **workers.dev subdomain** (any name, e.g. your name). Pick one.
- At the end it prints the Worker's address, like `https://cycle-tracker.<your-subdomain>.workers.dev`.
  Copy it.

## 7. Give the Worker the two tokens

Use the **same** tokens as now — lines 2 and 3 of `C:\Users\Mike\.cycle-proxy.txt` — so neither link changes.

```powershell
notepad $env:USERPROFILE\.cycle-proxy.txt
```

Then, one at a time (it asks for the value; paste it and press Enter — nothing shows as you paste, that's normal):

```powershell
npx wrangler secret put READER_TOKEN
```

← paste **line 2** (Tirzah's, read-only).

```powershell
npx wrangler secret put WRITER_TOKEN
```

← paste **line 3** (yours).

Close Notepad **without saving** if you changed anything by accident.

## 8. Quick check in the browser

Open the address from step 6 with `?t=wrong` on the end, e.g.
`https://cycle-tracker.<your-subdomain>.workers.dev/?t=wrong`

You should see `{"ok":false,"error":"no-access"}`.
If you see `not-configured`, one of the tokens in step 7 didn't take — run that step again.

## 9. Tell the tools where the Worker is

```powershell
notepad $env:USERPROFILE\.cycle-worker.txt
```

Notepad asks to create the file — **Yes**. Paste the Worker address from step 6 as the only line, save, close.
It must start with `https://cycle-tracker.` — the subdomain alone (`https://<your-subdomain>.workers.dev`)
reaches nothing.

## 10. Copy the data and compare

```powershell
cd "C:\Users\Mike\Desktop\Claude Code\Menstrual Cycle"
node Tools\copy-to-worker.js
```

It reads every day through the Google link, writes each one to the Worker, then reads both back and compares
every value. The last line should be **`Match: … days, … columns, every value the same.`**

If it says **FAIL**, copy what it printed to me. It's safe to run again — it never duplicates a day.

## 11. Run the full check against the Worker

```powershell
.\verify.bat worker
```

This is the same check as `verify.bat`, aimed at the Worker: the access rules, the write tests on a test day
(added and removed again), and your real cycles still adding up to the same dashboard numbers.
It should end with **All checks passed.** A few `retry "…" from Google` lines are expected for now — that
old workaround is removed in cf2.

## Then tell me

Tell me the results of steps 10 and 11 (or paste anything that failed). That's the end of cf1.

---

### Good to know

- **Backups:** Cloudflare keeps a 7-day rewind of the database automatically ("Time Travel"). Nothing to set up.
- **Logs**, if something misbehaves later: `npx wrangler tail` in the `Worker` folder shows live errors.
- **Changing the Worker** (e.g. a new field in `COLS`): edit `worker.js`, then `npx wrangler deploy` from the
  `Worker` folder. `deploy.bat` does *not* deploy the Worker — it only publishes the app.
- **Days logged on the phone after step 10** go to Google only, until cf2. cf2 re-runs the compare just
  before switching, so they're not lost — you can also run `node Tools\copy-to-worker.js` again any time.
