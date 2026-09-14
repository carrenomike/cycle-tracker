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

  // Token check happens before any sheet access, so a bad token costs no quota.
  const role = p.t && p.t === WRITER_TOKEN ? 'writer'
             : p.t && p.t === READER_TOKEN ? 'reader'
             : null;
  if (!role) return reply(p.callback, { ok: false, error: 'no-access' });

  if (!SHEET_ID || !READER_TOKEN || !WRITER_TOKEN) {
    return reply(p.callback, { ok: false, error: 'not-configured' });
  }

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) return reply(p.callback, { ok: false, error: 'sheet-missing: ' + SHEET_NAME });

    const values = sheet.getDataRange().getValues();
    const cols   = values.shift().map(String);
    const dateAt = cols.indexOf('Date');
    if (dateAt < 0) return reply(p.callback, { ok: false, error: 'sheet-missing-Date-column' });

    const tz = Spreadsheet_tz();
    const rows = values
      .filter(row => row[dateAt] !== '' && row[dateAt] !== null)
      .map(row => row.map(v => cell(v, tz)));

    return reply(p.callback, { ok: true, role: role, cols: cols, rows: rows });
  } catch (err) {
    // Never swallow: the client shows this string, and it lands in the Apps
    // Script execution log either way.
    console.error(err);
    return reply(p.callback, { ok: false, error: 'read-failed: ' + err.message });
  }
}

function Spreadsheet_tz() {
  return SpreadsheetApp.openById(SHEET_ID).getSpreadsheetTimeZone() || 'Etc/GMT';
}

/**
 * Sheets auto-types the pasted TSV: dates become Date objects, TRUE becomes a
 * boolean, temps become numbers. The client wants the same flat strings the
 * old gviz feed gave it, so flatten here rather than in twelve places there.
 */
function cell(v, tz) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
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
