/**
 * Cycle tracker read proxy.
 *
 * Sits in front of the private sheet so the sheet itself can stay private and
 * the app can keep working from GitHub Pages and from file://. Read only —
 * ca5 adds the write endpoint; there is deliberately no doPost here yet.
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
