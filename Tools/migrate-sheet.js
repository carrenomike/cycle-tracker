#!/usr/bin/env node
// Migrates the original tracker sheet to the ca2 schema.
//
//   node Tools/migrate-sheet.js <oldSheetId> <out.tsv>
//
// Writes a paste-ready TSV and prints an outlier report to stderr. The sheet ID
// is an argument, not a constant: this repo is public and must not carry one.
// The output holds personal health data — write it OUTSIDE the repo.
//
// Rules that are not negotiable (see Plan/cycle-app/slice-ca2-*.md):
//   - Never parse a number out of a Note into Temp. Second thermometer readings
//     live in notes and are known to sit on the wrong dates.
//   - Never invent a value. Unmappable free text stays in the Note verbatim and
//     the structured cell is left blank for a human to fill in.
//   - Never carry a pre-created blank row across.

const NEW_COLS = ['Date', 'Cycle Start', 'Temp', 'Time', 'Temp Quality', 'Exclude', 'Flow',
  'Cervical Mucus', 'Cervix Texture', 'Cervix Position', 'Breasts', 'Ovulation', 'Note'];

// Every column this migration knows how to handle. It is an allowlist on purpose,
// but an allowlist with nothing watching the other side of it is how the original
// run lost `Time`: the column simply had no destination and no check could see a
// column that was never mentioned. verify() now refuses to write unless every
// column the source actually carries appears here, so the next unlisted column
// stops the migration instead of disappearing from it.
const SOURCE_COLS = new Set([
  'Day',            // -> not stored; the app derives it from Cycle Start
  'Date', 'Temp', 'Time', 'Cervix Texture', 'Cervical Mucus', 'Breasts',
  'Exclude', 'Cycle', 'Note',
]);

// Free text seen in the source -> new enum. Anything absent here is reported as
// an outlier and left blank rather than guessed at.
const MUCUS = {
  'watery': 'Watery',
  'copius fluid': 'Watery',
  'sticky': 'Sticky',
  'thick and sticky': 'Sticky',
  'thick lotion': 'Creamy',
  'clumpy lotion': 'Creamy',
  'thick jelly mucus': 'Creamy',
  'thick mucus': 'Creamy',
  'egg white': 'Egg-white',
  'egg-whitey': 'Egg-white',
  'some egg-white': 'Egg-white',
  'stretchy, some egg-white': 'Egg-white',
};
const TEXTURE = {
  'soft': 'soft', 'softer': 'soft', 'super soft': 'soft', 'very soft': 'soft', 'squishy': 'soft',
  'getting firmer': 'medium', 'firm inside (soft outside)': 'medium',
  'harder, closer to opening': 'firm', 'little harder and rubbery': 'firm',
};
const BREASTS = { 'sore': 'sore', 'light soreness': 'minor' };

// Cervix Position is only ever filled from wording that actually says where the
// cervix was. Softness and height are correlated in reality, but the correlation
// is a tendency, not a rule — and a position inferred from texture is not an
// independent observation, so a later safety rule reading both would count one
// data point twice. Decided with Mike, 2026-09-13.
const POSITION = { 'harder, closer to opening': 'low' };

// Mike logged a run of breast soreness in the Note instead of the Breasts
// column (2026-08-02..08-11). Confirmed by him: those rows are Breasts = sore.
const BREASTS_IN_NOTE = /\b(boobs?|nipples?|b\/n)\b.*\bsore|\bsore\b.*\b(boobs?|nipples?|b\/n)\b/i;

// Notes that hint the reading was off-time or disturbed. Reported only — the
// migration never sets Temp Quality itself, that is Mike's call row by row.
const OFF_TIME = /\(\s*\d{1,2}(:\d{2})?\s*(am?|pm?)?\s*\)|switched to \d/i;
const DISTURBED = /deep sleep|after moving|travel|bakersfield|germany|zion/i;

// gviz hands a time-of-day cell back as [h, m, s, ms]; a plain text cell comes
// back as the string the sheet shows. Both are kept verbatim as "6:32 AM" rather
// than reformatted, so a row nobody can re-read still reads the way Mike wrote it.
function fmtTime(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    const [h, m] = v;
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return String(v).trim();
}

const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function fetchRows(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gviz fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const table = JSON.parse(json).table;
  const cols = table.cols.map(c => c.label);
  return table.rows.map(r => {
    const o = {};
    cols.forEach((c, i) => {
      const cell = (r.c || [])[i];
      const v = cell && cell.v !== null && cell.v !== undefined ? cell.v : '';
      o[c] = v;
      if (c === 'Date' && typeof v === 'string') {
        const m = /^Date\((\d+),(\d+),(\d+)/.exec(v);
        if (!m) throw new Error(`Unparseable Date cell: ${v}`);
        o._date = new Date(+m[1], +m[2], +m[3]);
      }
    });
    return o;
  });
}

function migrate(rows) {
  const out = [], outliers = [], dropped = [], recovered = [];

  for (const r of rows) {
    const date = r._date;
    if (!date) { dropped.push(['(no date)', 'row has no Date cell']); continue; }
    const iso = fmtDate(date);
    const note = String(r.Note || '').trim();
    const temp = r.Temp === '' || r.Temp === null ? '' : Number(r.Temp);
    const time = fmtTime(r.Time);
    const mucusRaw = String(r['Cervical Mucus'] || '').trim();
    const textureRaw = String(r['Cervix Texture'] || '').trim();
    const breastsRaw = String(r.Breasts || '').trim();
    const isDay1 = r.Day === 1;

    // A row carrying nothing but Day + Date is a pre-created placeholder, not a
    // logged day. Those caused the ca1 detectPhase bug; they do not come across.
    if (temp === '' && !time && !note && !mucusRaw && !textureRaw && !breastsRaw && !r.Cycle && !r.Exclude) {
      dropped.push([iso, `empty placeholder row (Day ${r.Day || '-'})`]);
      continue;
    }

    const noteParts = note ? [note] : [];

    let mucus = '';
    if (mucusRaw) {
      mucus = MUCUS[mucusRaw.toLowerCase()] || '';
      if (!mucus) outliers.push([iso, `mucus "${mucusRaw}" has no mapping — left blank, wording kept in Note`]);
      if (mucus.toLowerCase() !== mucusRaw.toLowerCase()) noteParts.push(`mucus: ${mucusRaw}`);
    }

    let texture = '', position = '';
    if (textureRaw) {
      position = POSITION[textureRaw.toLowerCase()] || '';
      if (position) recovered.push([iso, `Cervix Position = ${position} from texture wording "${textureRaw}"`]);
      texture = TEXTURE[textureRaw.toLowerCase()] || '';
      if (!texture) outliers.push([iso, `cervix texture "${textureRaw}" has no mapping — left blank, wording kept in Note`]);
      if (texture.toLowerCase() !== textureRaw.toLowerCase()) noteParts.push(`cervix: ${textureRaw}`);
    }

    let breasts = '';
    if (breastsRaw) {
      breasts = BREASTS[breastsRaw.toLowerCase()] || '';
      if (!breasts) outliers.push([iso, `breasts "${breastsRaw}" has no mapping — left blank, wording kept in Note`]);
      if (breasts.toLowerCase() !== breastsRaw.toLowerCase()) noteParts.push(`breasts: ${breastsRaw}`);
    } else if (BREASTS_IN_NOTE.test(note)) {
      breasts = 'sore';
      recovered.push([iso, `Breasts = sore recovered from note "${note}"`]);
    }

    // Flow: the old sheet only ever recorded full bleeding, in the Cycle column.
    // Spotting was never a column — it only ever appears as a note.
    let flow = '';
    if (r.Cycle === 'Blood') flow = 'bleeding';
    else if (/spotting/i.test(note)) flow = 'spotting';

    if (temp === '') outliers.push([iso, `no temperature in source${flow ? ` (Flow = ${flow})` : ''}${isDay1 ? ' — this is a Day 1 row' : ''}`]);
    if (/\d{2}\.\d/.test(note)) outliers.push([iso, `note carries a number ("${note}") — NOT copied into Temp by design`]);
    if (note && OFF_TIME.test(note)) outliers.push([iso, `note suggests an off-time reading ("${note}") — Temp Quality left blank`]);
    if (note && DISTURBED.test(note)) outliers.push([iso, `note suggests a disturbed reading ("${note}") — Temp Quality left blank`]);
    if (r.Cycle && r.Cycle !== 'Blood' && r.Cycle !== 'Ovulation') outliers.push([iso, `unrecognised Cycle value "${r.Cycle}"`]);

    out.push({
      Date: iso,
      'Cycle Start': isDay1 ? 'TRUE' : '',
      Temp: temp,
      Time: time,
      'Temp Quality': '',
      Exclude: String(r.Exclude || '').trim().toUpperCase().startsWith('Y') ? 'TRUE' : '',
      Flow: flow,
      'Cervical Mucus': mucus,
      'Cervix Texture': texture,
      'Cervix Position': position,
      Breasts: breasts,
      Ovulation: r.Cycle === 'Ovulation' ? 'TRUE' : '',
      Note: noteParts.join(' | '),
    });
  }
  return { out, outliers, dropped, recovered };
}

// Refuses to hand back a file that lost or invented anything. Compares the
// migrated rows against the source, not against itself.
function verify(src, out) {
  const fails = [];
  const eq = (a, b, what) => { if (a !== b) fails.push(`${what}: source [${a}] vs migrated [${b}]`); };
  const srcDated = src.filter(r => r._date);

  const srcTemps = srcDated.filter(r => r.Temp !== '' && r.Temp !== null).map(r => `${fmtDate(r._date)}=${Number(r.Temp)}`).sort();
  const outTemps = out.filter(r => r.Temp !== '').map(r => `${r.Date}=${r.Temp}`).sort();
  eq(srcTemps.join(','), outTemps.join(','), 'temperatures');

  eq(srcDated.filter(r => r.Day === 1).map(r => fmtDate(r._date)).sort().join(','),
     out.filter(r => r['Cycle Start']).map(r => r.Date).sort().join(','), 'Day 1 dates');
  eq(srcDated.filter(r => r.Cycle === 'Ovulation').map(r => fmtDate(r._date)).sort().join(','),
     out.filter(r => r.Ovulation).map(r => r.Date).sort().join(','), 'ovulation markers');
  eq(srcDated.filter(r => String(r.Exclude).trim()).map(r => fmtDate(r._date)).sort().join(','),
     out.filter(r => r.Exclude).map(r => r.Date).sort().join(','), 'Exclude flags');
  eq(srcDated.filter(r => r.Cycle === 'Blood').map(r => fmtDate(r._date)).sort().join(','),
     out.filter(r => r.Flow === 'bleeding').map(r => r.Date).sort().join(','), 'bleeding days');

  const srcNotes = new Map(srcDated.filter(r => String(r.Note || '').trim()).map(r => [fmtDate(r._date), String(r.Note).trim()]));
  for (const [date, note] of srcNotes) {
    const row = out.find(r => r.Date === date);
    if (!row) fails.push(`note on ${date} was dropped with its row`);
    else if (!row.Note.includes(note)) fails.push(`note on ${date} not preserved`);
  }
  if (new Set(out.map(r => r.Date)).size !== out.length) fails.push('duplicate dates in output');

  // The check that would have caught the lost `Time` column. Everything above
  // compares a source column against its destination; this one asks whether a
  // source column has a destination at all.
  const seen = new Set();
  src.forEach(r => Object.keys(r).forEach(k => { if (k !== '_date') seen.add(k); }));
  const unmapped = [...seen].filter(c => c && !SOURCE_COLS.has(c));
  if (unmapped.length) {
    fails.push(`source columns this migration does not handle: ${unmapped.join(', ')} ` +
      `— add each to SOURCE_COLS and give it a destination, or state in SOURCE_COLS why it is dropped`);
  }

  const srcTimes = srcDated.filter(r => fmtTime(r.Time)).map(r => `${fmtDate(r._date)}=${fmtTime(r.Time)}`).sort();
  const outTimes = out.filter(r => r.Time).map(r => `${r.Date}=${r.Time}`).sort();
  eq(srcTimes.join(','), outTimes.join(','), 'times');

  return fails;
}

module.exports = { migrate, verify, fmtTime, NEW_COLS, SOURCE_COLS };

// Only run the migration when invoked directly, so the checks below it can
// exercise migrate() and verify() without hitting the network.
if (require.main !== module) return;

(async () => {
  const [sheetId, outPath] = process.argv.slice(2);
  if (!sheetId || !outPath) {
    console.error('usage: node Tools/migrate-sheet.js <oldSheetId> <out.tsv>   (write the TSV outside this public repo)');
    process.exit(2);
  }
  const src = await fetchRows(sheetId);
  const { out, outliers, dropped, recovered } = migrate(src);
  const fails = verify(src, out);
  const log = (...a) => console.error(...a);

  log(`\nSource rows: ${src.length}    Migrated rows: ${out.length}    Dropped: ${dropped.length}`);
  log(`Date range:  ${out[0].Date} .. ${out[out.length - 1].Date}`);
  log(`Cycle Starts: ${out.filter(r => r['Cycle Start']).length}   Ovulation markers: ${out.filter(r => r.Ovulation).length}   Temps: ${out.filter(r => r.Temp !== '').length}   Exclude: ${out.filter(r => r.Exclude).length}`);

  log(`\n--- DROPPED ROWS (${dropped.length}) ---`);
  dropped.forEach(([d, why]) => log(`  ${d}  ${why}`));
  log(`\n--- RECOVERED FROM NOTES (${recovered.length}) ---`);
  recovered.forEach(([d, why]) => log(`  ${d}  ${why}`));
  log(`\n--- OUTLIERS FOR REVIEW (${outliers.length}) ---`);
  outliers.forEach(([d, why]) => log(`  ${d}  ${why}`));

  log(`\n--- VERIFICATION ---`);
  if (fails.length) { fails.forEach(f => log(`  FAIL ${f}`)); log('\nRefusing to write output.'); process.exit(1); }
  log('  OK: every temperature, time, Day 1, ovulation marker, Exclude flag, bleeding day and note preserved.');
  log('  OK: every column the source carries has a destination here.');
  log('  OK: no Temp cell exists that was not in the source. No blank placeholder rows carried over.');

  require('fs').writeFileSync(outPath,
    [NEW_COLS.join('\t'), ...out.map(r => NEW_COLS.map(c => String(r[c])).join('\t'))].join('\n') + '\n');
  log(`\nWrote ${outPath}`);
})();
