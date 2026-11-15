# Working notes

- Do not verify changes yourself using the Browser preview tools. The user will do all browser checks themselves and report back what they see.
- **Michael tests on his phone, and the phone only sees what is pushed.** So when a change is ready for him to
  test: run `checks.bat` (any failure → stop), commit the code by path with a plain-English subject (no slice
  prefix for off-plan work), and push to `origin main`. Then tell him it's live to test. Don't hand over a change
  for testing that isn't pushed. (`deploy.bat` does the same but stages everything and asks a question at a
  prompt, so it's for Michael's own use, not yours.)

## Wrap-up

For on-the-fly work (not a slice in `Plan/cycle-app/`). The code was already pushed for testing (above); wrap-up
only records it and checks nothing was left behind.

1. Add a `CHANGELOG.md` entry at the top of `# Changelog`: `- **[Fly]** (YYYY-MM-DD) **Title.** What changed,
   from Michael's point of view.` Date = the day Michael confirmed it done. Commit it on its own as
   `Changelog: <short title>`, and push.
2. Check `git status`: working tree clean and `main` not ahead of `origin/main`. Anything unpushed or uncommitted
   that belongs to this work → stop and tell Michael (it means he tested something other than what's live).
3. Old specs in `Docs/` are a record of what was planned at the time — don't edit them to match later changes.

# Working plan

**`Plan/cycle-app/` is the working plan.** Start a session with: *read `Plan/cycle-app/STATE.md`, then
`Plan/cycle-app/slice-caN-*.md`, execute that slice only.* Do not load the whole folder, the README, or the
archive log at session start.
