# Lunation Wheel — how to run a session

**Goal:** Replace the app's home screen with a circular lunation wheel (one wheel = one lunation, new moon at
top) driven by a private Google Sheet behind an Apps Script proxy, with a writer-only catch-up entry screen. The
existing Chart.js dashboard survives intact as a second tab. **Out of scope for this plan:** any change to the
fertility science itself, multi-user accounts, native apps, and moving off Google Sheets.

## Start a session with exactly this

> Read `Plan/lunation-wheel/STATE.md`, then `Plan/lunation-wheel/slice-lwN-*.md`. Execute that slice only.

That's it. Do **not** ask a session to read this README, the whole folder, or the archive log.

## The three-file rule

| File | Mutable? | Grows? | Loaded at session start |
|---|---|---|---|
| `slice-lwN-*.md` | **No** — immutable once written | Never | Only its own session |
| `STATE.md` | Yes, append one line per slice | ~1 line/slice, hard cap 60 | Always |
| `Docs/Archive/Lunation Wheel Log.md` | Yes | Freely | **Never** |

**The discipline that makes it work:** when a slice reveals that a *later* slice's spec is wrong, edit that
later slice's file. Do not append corrections to STATE or bolt them onto the current slice.

## THE DESIGN GATE — read this before touching slices 4 onward

Slices 4, 5, 7 and 8 are **blocked** until Mike signs off on the visual design, and Tirzah (the view-only user)
has seen it and likes it. She reads as "earthy", not "tech-forward dashboard"; approval of a wireframe is **not**
approval of the aesthetic.

- The gate is worked in a **scratchpad prototype** — no commits, no repo changes, no slice number.
- Iterate freely until Mike says the look is signed off.
- The gate covers **aesthetics and phone ergonomics only.** The safety maths and the wheel's information layout
  are already settled and proven against the real data — the gate does not re-open them.
- Slices 1, 2 and 3 are design-independent and may run before or during the gate.
- **No blocked slice may be expanded from stub into a full spec before the gate clears.** Writing that spec early
  is describing an interface nobody has approved.

## End every session with

1. Append one line to `STATE.md` under `## Done`.
2. Forensics — bugs found, root causes, commit hashes — to `Docs/Archive/Lunation Wheel Log.md`.
3. If this slice invalidated a later slice's stub, edit that stub now, in this session.
4. (No knowledge-graph refresh is configured for this project.)
5. Commit — one slice, one commit, including the STATE line and the log entry above.
6. Checkpoint-size check: diff `STATE.md`'s `Last reviewed commit` marker against `HEAD` (Plan/Docs paths
   excluded), and ask whether this slice touched a shared helper or invariant. Over ~1,500 lines or yes to that
   question: create `slice-lw<N><letter>-checkpoint-review.md` now, add it to the Slice index below, and route
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
| 1 | `slice-lw1-fix-live-bugs.md` | Fix the four confirmed defects in the shipped app + `deploy.bat` staging bug | — |
| 2 | `slice-lw2-new-sheet-and-migration.md` | New private sheet, new schema, migration script, outlier review | 1 |
| 3 | `slice-lw3-proxy-and-tokens.md` | Apps Script read proxy, two tokens, fragment delivery, visible auth failure | 2 |
| 4 | `slice-lw4-wheel-home-tab.md` | Wheel becomes the home tab; dashboard demoted to tab 2 | 3 + **design gate** |
| 5 | `slice-lw5-catch-up-entry.md` | Writer-only catch-up entry screen, newest first | 4 + **design gate** |
| 6 | `slice-lw6-write-queue.md` | Local unsent queue + persistent banner, sheet stays source of truth | 5 |
| 7 | `slice-lw7-viewer-staleness.md` | Viewer cache, dismissible staleness banner, 3-day expiry | 4 + **design gate** |
| 8 | `slice-lw8-dashboard-restyle.md` | Restyle the dashboard tab into the approved visual language | 4 + **design gate** |
| 9 | `slice-lw9-review.md` | Code review of the whole plan's committed diff | all |

Run in index order unless a "Depends on" column says otherwise. The review slice is always last and always runs
after every other slice is committed.
