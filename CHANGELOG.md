# Read me first

- This is the running log of everything that's actually shipped — completed items move here (once
  confirmed done by user), newest at the top.
- Every entry is tagged with where it came from — **[Plan]** (a slice in `Plan/cycle-app/`, whose
  full write-up lives in `Docs/Archive/Cycle App Log.md`) or **[Fly]** (if it was done on the fly) —
  so the origin is never lost.
- Every entry gets a `(YYYY-MM-DD)` timestamp for the day it was confirmed done, placed right after
  its tag, e.g. `**[Fly]** (2026-10-13) ...`.

# Changelog

- **[Plan]** (2026-10-16) **Data moved off Google Sheets to Cloudflare.** The app now saves and loads through a new server instead of the Google sheet; both links (yours and Tirzah's) are unchanged, and all 198 days came across matching. The Google sheet is kept as a frozen backup — a stale open copy of the app that tries to save there keeps the entry and says to reload. The Log tab has a new **Download all data** button that saves everything as a spreadsheet file. (Spec: `Docs/Cloudflare Migration Spec.md`.)

- **[Fly]** (2026-10-16) **Missed days show in the Daily Log.** A day you skipped between two logged days now appears in the dashboard's Daily Log table as a faded row with its day number, date and "not logged", so the days either side no longer look back to back. Nothing is saved for these rows — they are just drawn in.

- **[Fly]** (2026-10-16) **Log symptoms from a panel, with new fields.** The question bar is gone. Each day on the Log tab is one row: Temp, Time, and a **+** button that slides up a Symptoms panel with everything else (flow, mucus, cervix, breasts, arousal, acne, cramps, penetration, protected, mood, reading quality, ovulation, Day 1, note). Under each row, one line lists what the day holds, e.g. "penetration (protected)". Mood lets you pick several and add your own; added moods are remembered once saved. Protected stays greyed out until Penetration is ticked. On the dashboard, the Cervix, Pos, Mucus and Breasts columns are one Symptoms column, and the chart pop-up lists the same. If the sheet is missing a column, the save says so and keeps the change on screen instead of retrying forever. (Spec: `Docs/Symptoms Picker Spec.md`.)

- **[Fly]** (2026-10-13) **The BBT timeline scrolls sideways on a phone.** On a phone-width screen the Full Timeline shows about 90 days per screen and opens on today's end; swipe left for older days. The temperature scale stays pinned on the left while scrolling, and the auto-refresh keeps your place (or follows the newest day if you were at the end). Under 90 days of data it fits the screen as before. Tapping inside either chart (timeline or Cycle Comparison) no longer shows a pop-up or enlarges a dot; the Comparison legend still toggles cycles. Turning the phone sideways switches to the desktop view. Desktop unchanged.
