/**
 * Cycle tracker read/write proxy.
 *
 * Sits in front of the private sheet so the sheet itself can stay private and
 * the app can keep working from GitHub Pages and from file://. doGet reads for
 * either token; doPost (ca5) writes for the writer token only.
 *
 * The three constants below are the only secrets in this system. This file
 * lives in the Apps Script editor, NOT in the public repo — the copy in the
 * repo is a template with the values blanked. Rotation = change a token here
 * and redeploy; recovery = re-send the person their link.
 *
 * Deploy: Deploy > New deployment > Web app,
 *   Execute as: Me,  Who has access: Anyone.
 * "Anyone" is what lets an anonymous browser reach it; the tokens below are
 * the actual access control.
 */

const SHEET_ID     = '';  // the new (private) sheet's ID
const SHEET_NAME    = 'Sheet1';
const READER_TOKEN = '';  // Tirzah — read only
const WRITER_TOKEN = '';  // Mike — read now, write from ca5

function doGet(e) {
  const p = (e && e.parameter) || {};

  // Config before tokens, deliberately. The repo's copy of this file is a
  // template with the three constants blanked, so pasting it over the editor
  // wipes them — and with blank tokens EVERY request fails the role check. That
  // reports 'no-access' and sends you hunting a token problem that isn't there.
  // "This deployment is not set up" is not a secret; say it first. (2026-09-14,
  // after a redeploy did exactly this.)
  if (!SHEET_ID || !READER_TOKEN || !WRITER_TOKEN) {
    return reply(p.callback, { ok: false, error: 'not-configured' });
  }

  // Token check happens before any sheet access, so a bad token costs no quota.
  const role = p.t && p.t === WRITER_TOKEN ? 'writer'
             : p.t && p.t === READER_TOKEN ? 'reader'
             : null;
  if (!role) return reply(p.callback, { ok: false, error: 'no-access' });

  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return reply(p.callback, { ok: false, error: 'sheet-missing: ' + SHEET_NAME });

    const values = sheet.getDataRange().getValues();
    const cols   = values.shift().map(String);
    const dateAt = cols.indexOf('Date');
    if (dateAt < 0) return reply(p.callback, { ok: false, error: 'sheet-missing-Date-column' });

    const tz = ss.getSpreadsheetTimeZone() || 'Etc/GMT';
    const rows = values
      .filter(row => row[dateAt] !== '' && row[dateAt] !== null)
      .map(row => row.map((v, i) => cell(v, tz, cols[i])));

    // tz travels with the payload: a time-of-day cell round-trips through it,
    // so a wrong or fallback timezone silently shifts every time by an hour.
    // Tools/verify-proxy.js asserts on it rather than trusting it.
    return reply(p.callback, { ok: true, role: role, tz: tz, cols: cols, rows: rows });
  } catch (err) {
    // Never swallow: the client shows this string, and it lands in the Apps
    // Script execution log either way.
    console.error(err);
    return reply(p.callback, { ok: false, error: 'read-failed: ' + err.message });
  }
}

/**
 * Sheets auto-types the pasted TSV: dates become Date objects, TRUE becomes a
 * boolean, temps become numbers. The client wants the same flat strings the
 * old gviz feed gave it, so flatten here rather than in twelve places there.
 */
const TIME_COLS = ['Time'];

function cell(v, tz, col) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    // Sheets stores a time-of-day cell ("6:32 AM") as a Date on its epoch day,
    // 1899-12-30. Formatting that as yyyy-MM-dd would hand the app "1899-12-30"
    // instead of the time — the whole Time column, silently wrong.
    //
    // Which format to use is decided by the COLUMN, never by the value. ca2a
    // guessed from the year (<1900 means a time), which is a guess about every
    // column at once: any cell Sheets happens to auto-type as a date — a Note
    // that reads like one, a stray typed time — gets rewritten by a rule that
    // was only ever meant for Time. The column name is knowledge we already
    // have, so use it.
    return Utilities.formatDate(v, tz, TIME_COLS.indexOf(col) >= 0 ? 'h:mm a' : 'yyyy-MM-dd');
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : '';
  return String(v).trim();
}

/**
 * JSONP when a callback is asked for, plain JSON otherwise. JSONP is how the
 * app already talks to Google and is what keeps file:// working — an Apps
 * Script /exec response is cross-origin from both GitHub Pages and file://.
 */
function reply(callback, obj) {
  const json = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ca5 write endpoint. One row per date: update the row that already carries the
 * date, otherwise insert a new one IN DATE ORDER. Nothing here ever appends
 * blindly — the app reads the sheet top to bottom and splits cycles on the Day
 * numbers it derives from the dates, so one out-of-order row would reshape
 * every cycle after it.
 *
 * Keyed on the date and on nothing else, so a retry after Google's flaky /exec
 * redirect rewrites the same row instead of adding a second one.
 *
 * Body is JSON, sent as text/plain so the browser treats it as a simple request
 * and never fires a CORS preflight (Apps Script cannot answer one).
 *   { t: <token>, date: 'YYYY-MM-DD', values: { 'Temp': '97.88', ... } }
 *   { t: <token>, date: 'YYYY-MM-DD', op: 'delete' }
 */
function doPost(e) {
  if (!SHEET_ID || !READER_TOKEN || !WRITER_TOKEN) {
    return reply(null, { ok: false, error: 'not-configured' });
  }

  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || 'null'); }
  catch (err) { return reply(null, { ok: false, error: 'bad-request: body is not JSON' }); }
  if (!body || typeof body !== 'object') {
    return reply(null, { ok: false, error: 'bad-request: no body' });
  }

  // Writer only, checked server-side. Hiding the Log tab from the reader is
  // cosmetic; this is the line that actually stops a read-only link writing.
  // A reader token gets its own error so the app can say something true.
  if (body.t !== WRITER_TOKEN) {
    return reply(null, { ok: false, error: body.t === READER_TOKEN ? 'read-only' : 'no-access' });
  }

  var date = String(body.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return reply(null, { ok: false, error: 'bad-request: date must be YYYY-MM-DD' });
  }
  var del = body.op === 'delete';
  if (!del && (!body.values || typeof body.values !== 'object')) {
    return reply(null, { ok: false, error: 'bad-request: no values' });
  }

  // Two writes racing each other would both read the same last row and both
  // insert. The retry on a flaky redirect is exactly that race.
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (err) { return reply(null, { ok: false, error: 'busy: another write is still running' }); }

  try {
    return reply(null, writeRow(date, body.values, del));
  } catch (err) {
    console.error(err);
    return reply(null, { ok: false, error: 'write-failed: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

// Flags are written as the boolean a ticked checkbox holds, not the string
// 'TRUE' — the columns carry checkboxes and a string would sit in them as an
// invalid value. cell() flattens the boolean back to 'TRUE' on the way out.
var FLAG_COLS = ['Cycle Start', 'Ovulation', 'Exclude'];

// setValues() enters a string the way a person typing it would, so Sheets parses
// it: a Note of '=1+1' becomes a formula and the text is lost (the live ca5a
// checks read it back as '2' twice). Two fixes were tried against the real sheet
// and both failed: a leading apostrophe (a convention of the typing UI, not of the
// API) and a plain-text number format on the cell (setValues parses first and
// formats the result). A RichTextValue is text by construction — there is nothing
// for Sheets to parse — so the text columns are written again, on their own, after
// the row write that would otherwise overwrite them.
//
// Note is the only free-text column — every other column the app writes is a
// flag, a number, a time, or one of a fixed list — and it is the only one whose
// parsing we have to switch off. Temp and Time rely on that same parsing to land
// as a number and a time, so this must stay a list, not a blanket.
var TEXT_COLS = ['Note'];

function writeRow(date, values, del) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: false, error: 'sheet-missing: ' + SHEET_NAME };

  var tz     = ss.getSpreadsheetTimeZone() || 'Etc/GMT';
  var cols   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  var dateAt = cols.indexOf('Date');
  if (dateAt < 0) return { ok: false, error: 'sheet-missing-Date-column' };

  // An unknown column stops the write. Dropping a field the app thought it
  // saved is the one failure this screen must never have.
  if (!del) {
    for (var k in values) {
      if (k === 'Date') return { ok: false, error: 'bad-request: Date is the key, not a value' };
      if (cols.indexOf(k) < 0) return { ok: false, error: 'unknown-column: ' + k };
    }
  }

  var lastRow = sheet.getLastRow();
  var dates   = lastRow > 1 ? sheet.getRange(2, dateAt + 1, lastRow - 1, 1).getValues() : [];
  var target = 0, insertAt = 0, odd = [];
  for (var i = 0; i < dates.length; i++) {
    var v = dates[i][0];
    if (v === '' || v === null) continue;
    var iso = v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v).trim();
    // insertAt is chosen by a STRING comparison, which is only sound on
    // yyyy-MM-dd. A cell holding anything else ('3/29/2026', a stray note)
    // would compare as greater than every 2026 date and drag the new row to
    // the top of the sheet, silently reshaping every cycle after it. Skip it
    // for ordering and say so in the reply rather than guess.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) { odd.push(String(v)); continue; }
    if (iso === date) { target = i + 2; break; }
    if (iso > date && !insertAt) insertAt = i + 2;   // first row dated later
  }

  if (del) {
    if (!target) return { ok: true, action: 'absent', date: date };
    sheet.deleteRow(target);
    return { ok: true, action: 'deleted', date: date, row: target };
  }

  var action, row;
  if (target) {
    action = 'updated';
    row    = target;
  } else if (insertAt) {
    // insertRowBefore/After copy the formatting (and the checkboxes) of the
    // neighbouring row, so a new row looks and behaves like a migrated one.
    sheet.insertRowBefore(insertAt);
    action = 'inserted';
    row    = insertAt;
  } else {
    sheet.insertRowAfter(Math.max(lastRow, 1));
    action = 'appended';
    row    = Math.max(lastRow, 1) + 1;
  }

  // Read-patch-write: one read and one write, and every column this request did
  // not mention keeps exactly what it had.
  var cur = sheet.getRange(row, 1, 1, cols.length).getValues()[0];
  if (action !== 'updated') {
    // Noon, not midnight: the script's timezone and the sheet's need not be the
    // same, and a midnight date read back through a different one lands on the
    // day before. Nothing reads the time part of a Date column.
    cur[dateAt] = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 12, 0, 0);
  }
  for (var col in values) {
    var at = cols.indexOf(col);
    cur[at] = FLAG_COLS.indexOf(col) >= 0
      ? (String(values[col]).trim().toUpperCase() === 'TRUE')
      : String(values[col] == null ? '' : values[col]).trim();
  }
  sheet.getRange(row, 1, 1, cols.length).setValues([cur]);

  // Every text column on the row, not only the ones this request patched: the write
  // above re-enters the whole row, so a Note already holding '=1+1' would be turned
  // into a formula by a save of nothing but a temperature.
  for (var j = 0; j < TEXT_COLS.length; j++) {
    var ta = cols.indexOf(TEXT_COLS[j]);
    if (ta < 0) continue;
    var txt = String(cur[ta] == null ? '' : cur[ta]);
    if (txt === '') continue;   // newRichTextValue() will not take an empty string
    sheet.getRange(row, ta + 1)
         .setRichTextValue(SpreadsheetApp.newRichTextValue().setText(txt).build());
  }

  var out = { ok: true, action: action, date: date, row: row };
  if (odd.length) out.unreadableDates = odd;   // never swallowed — the app shows it
  return out;
}
