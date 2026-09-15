# Cycle App — how to run a session

**Goal:** Move the app onto a private Google Sheet behind an Apps Script proxy, put the real safety engine on the
existing dashboard, and add a writer-only catch-up entry screen so logging happens in the app instead of in Google
Sheets. **Out of scope for this plan:** any change to the fertility science itself, multi-user accounts, native
apps, moving off Google Sheets, and any visual restyle of the dashboard.

**History:** this plan began as "Lunation Wheel" and was going to replace the home screen with a circular lunation
wheel. The wheel was scrapped on 2026-09-13 — Tirzah did not like it. Its safety and display rules survived and now
live in `slice-ca4-safety-engine.md`; everything geometric about it is gone and is not coming back.

## Start a session with exactly this

> Read `Plan/cycle-app/STATE.md`, then `Plan/cycle-app/slice-caN-*.md`. Execute that slice only.

That's it. Do **not** ask a session to read this README, the whole folder, or the archive log.

## The three-file rule

| File | Mutable? | Grows? | Loaded at session start |
|---|---|---|---|
| `slice-caN-*.md` | **No** — immutable once written | Never | Only its own session |
| `STATE.md` | Yes, append one line per slice | ~1 line/slice, hard cap 60 | Always |
| `Docs/Archive/Cycle App Log.md` | Yes | Freely | **Never** |

**The discipline that makes it work:** when a slice reveals that a *later* slice's spec is wrong, edit that
later slice's file. Do not append corrections to STATE or bolt them onto the current slice.

## The viewer gets no design gate

Tirzah is the view-only user and has asked to stay hands off. There is **no design checkpoint** in this plan and
nothing waits on her approval. The consequence is a constraint, not a freedom: **her screen changes only where a
change is a correctness or safety requirement.** Cosmetic changes to surfaces she sees are out of scope for every
slice in this plan.

Writer-only surfaces — the Log tab, the unsent-queue banner — are unconstrained.

## End every session with

1. Append one line to `STATE.md` under `## Done`.
2. Forensics — bugs found, root causes, commit hashes — to `Docs/Archive/Cycle App Log.md`.
3. If this slice invalidated a later slice's stub, edit that stub now, in this session.
4. (No knowledge-graph refresh is configured for this project.)
5. Commit — one slice, one commit, including the STATE line and the log entry above.
6. Checkpoint-size check: diff `STATE.md`'s `Last reviewed commit` marker against `HEAD` (Plan/Docs paths
   excluded), and ask whether this slice touched a shared helper or invariant. Over ~1,500 lines or yes to that
   question: create `slice-ca<N><letter>-checkpoint-review.md` now, add it to the Slice index below, and route
   step 7 there. Otherwise append this slice's own diff to the marker's running tally.
7. Give the user the next slice's prompt. If this was the final review slice, say so instead.

## Ground rules (every slice)

- **Slice 1 is a full spec; every later slice ships as a stub.** A stub session's first job is to read the code
  the stub names, confirm its verified facts still hold, and expand it in place into a full spec — before writing
  any code, as part of that slice's commit.
- One slice = one commit, live-testable on landing.
- **This project has no build step, no test suite and no typechecker.** It is one static `index.html` loaded
  directly by the browser. Do not invent verification commands.
  - **Mike drives all browser verification.** Both CLAUDE.md files say so. Never launch a browser tool to check a
    UI change; hand Mike the change and wait for his report.
  - For anything with logic in it (safety rule, cycle-day arithmetic, coverline, migration), the session must
    verify it **headlessly** first — a throwaway node/python script in the scratchpad, run against the real sheet
    data — and state the result in the STATE line. "Looks right" is not verification.
- **Surface failures loudly.** Per global CLAUDE.md, this project has repeatedly lost time to silent background
  failures. Every fetch, write, token check and queue flush needs a visible failure state — a banner, a console
  error, or both. Never a blank screen and never a silent swallow.
- Before staging a commit, review `git status` for anything unexpected — the working tree should hold only this
  slice's work.
- `deploy.bat` is the deploy path and the repo is public. Nothing secret may ever be committed.

## Slice index

| # | File | Scope | Depends on |
|---|---|---|---|
| 1 | `slice-ca1-fix-live-bugs.md` | Fix the four confirmed defects in the shipped app + `deploy.bat` staging bug | — |
| 2 | `slice-ca2-new-sheet-and-migration.md` | New private sheet, new schema, migration script, outlier review | 1 |
| 2a | `slice-ca2a-recover-time-column.md` | Recover the `Time` column ca2 silently dropped + an unmapped-column guard | 2 |
| 3 | `slice-ca3-proxy-and-tokens.md` | Apps Script read proxy, two tokens, fragment delivery, visible auth failure | 2 |
| 3a | `slice-ca3a-checkpoint-review.md` | Checkpoint review of `1065c1e..HEAD` — the adapter, the schema-spelling invariants, the proxy | 3 |
| 3b | `slice-ca3b-checkpoint-review.md` | Checkpoint review of `3ee13e2..HEAD` (ca2a) — `cell()` is on every column’s read path | 1 |
| 4 | `slice-ca4-safety-engine.md` | Real safety rule + honest status cards on the existing dashboard | 3 |
| 4a | `slice-ca4a-checkpoint-review.md` | Checkpoint review of `4050005..HEAD` (ca7a + ca4) — the deleted `Cycle` field and its ~20 readers | 4 |
| 5 | `slice-ca5-catch-up-entry.md` | Writer-only Log tab, catch-up list newest first | 4 |
| 6 | `slice-ca6-write-queue.md` | Local unsent queue + persistent banner, sheet stays source of truth | 5 |
| 7 | `slice-ca7-viewer-staleness.md` | Viewer cache, dismissible staleness banner, 3-day expiry | 3 |
| 7a | `slice-ca7a-checkpoint-review.md` | Checkpoint review of `24f6067..HEAD` (ca7) — the cache, the expiry override, the reworked read path | 7 |
| 8 | `slice-ca8-review.md` | Code review of the whole plan's committed diff | all |

Run in index order unless a "Depends on" column says otherwise. Slice 7 only needs the read path from slice 3, so
it can be pulled forward if a stale-cache problem shows up sooner. The review slice is always last and always runs
after every other slice is committed.
