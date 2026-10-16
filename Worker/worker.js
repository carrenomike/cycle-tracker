/**
 * Cycle tracker read/write server — the Cloudflare replacement for
 * Apps Script/Code.gs (Docs/Cloudflare Migration Spec.md).
 *
 * Same wire protocol as Code.gs, so the app only changes its server address:
 *   GET  ?t=<token>[&callback=fn]   -> { ok, role, cols, rows }  (JSONP if callback)
 *   POST text/plain JSON body       -> { ok, action, date } or { ok: false, error }
 *        { t, date: 'YYYY-MM-DD', values: { Temp: '97.88', ... } }
 *        { t, date: 'YYYY-MM-DD', op: 'delete' }
 *
 * The tokens are Worker secrets (`wrangler secret put`), never in this file —
 * this repo is public. The database is D1, bound as env.DB (wrangler.toml).
 *
 * One table, days(date, data): data is a JSON object of column -> string. A new
 * field is one edit to COLS below, never a schema change.
 *
 * Kept deliberately self-contained (no imports, one `export default`):
 * Tools/worker-selfcheck.js runs this exact file against a local SQLite.
 */

// The live sheet header at copy time, same order. The app reads cols from the
// GET reply, so this order is the order it sees. Removing a name here HIDES
// that field's stored data from the app (it stays in D1) — add, don't remove.
const COLS = ['Date', 'Cycle Start', 'Temp', 'Time', 'Temp Quality', 'Exclude', 'Flow',
  'Cervical Mucus', 'Cervix Texture', 'Cervix Position', 'Breasts', 'Ovulation',
  'Arousal', 'Acne', 'Cramps', 'Penetration', 'Protected', 'Mood', 'Note'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'GET') return await read(new URL(request.url).searchParams, env);
      if (request.method === 'POST') return await write(await request.text(), env);
      return reply(null, { ok: false, error: 'bad-request: GET or POST only' }, 405);
    } catch (err) {
      // Never swallow: the client shows this string, and `wrangler tail` logs it.
      // A GET error goes back through the callback, or the app only sees a timeout.
      console.error(err);
      if (request.method === 'POST') return reply(null, { ok: false, error: 'write-failed: ' + (err && err.message) });
      return reply(new URL(request.url).searchParams.get('callback'),
        { ok: false, error: 'read-failed: ' + (err && err.message) });
    }
  },
};

// Config before tokens, as in Code.gs: a missing secret would otherwise make
// every request read as 'no-access' and send you hunting a token problem.
function configured(env) {
  return !!(env.READER_TOKEN && env.WRITER_TOKEN && env.DB);
}

function roleOf(t, env) {
  if (!t) return null;
  if (t === env.WRITER_TOKEN) return 'writer';
  if (t === env.READER_TOKEN) return 'reader';
  return null;
}

async function read(params, env) {
  const callback = params.get('callback');
  if (!configured(env)) return reply(callback, { ok: false, error: 'not-configured' });
  const role = roleOf(params.get('t'), env);
  if (!role) return reply(callback, { ok: false, error: 'no-access' });

  const { results } = await env.DB.prepare('SELECT date, data FROM days ORDER BY date').all();
  const rows = results.map(r => {
    const d = JSON.parse(r.data);
    return COLS.map(c => (c === 'Date' ? r.date : d[c] == null ? '' : d[c]));
  });
  return reply(callback, { ok: true, role, cols: COLS, rows });
}

async function write(text, env) {
  if (!configured(env)) return reply(null, { ok: false, error: 'not-configured' });

  let body;
  try { body = JSON.parse(text || 'null'); }
  catch (err) { return reply(null, { ok: false, error: 'bad-request: body is not JSON' }); }
  if (!body || typeof body !== 'object') return reply(null, { ok: false, error: 'bad-request: no body' });

  // Writer only, checked here. Hiding the Log tab from the reader is cosmetic.
  if (!body.t || body.t !== env.WRITER_TOKEN) {
    return reply(null, { ok: false, error: body.t && body.t === env.READER_TOKEN ? 'read-only' : 'no-access' });
  }

  const date = String(body.date || '').trim();
  if (!ISO_DATE.test(date)) return reply(null, { ok: false, error: 'bad-request: date must be YYYY-MM-DD' });

  if (body.op === 'delete') {
    const { results } = await env.DB.prepare('DELETE FROM days WHERE date = ? RETURNING date').bind(date).all();
    return reply(null, { ok: true, action: results.length ? 'deleted' : 'absent', date });
  }

  if (!body.values || typeof body.values !== 'object') return reply(null, { ok: false, error: 'bad-request: no values' });
  const patch = {};
  for (const k in body.values) {
    if (k === 'Date') return reply(null, { ok: false, error: 'bad-request: Date is the key, not a value' });
    // Dropping a field the app thought it saved is the one unforgivable failure.
    if (COLS.indexOf(k) < 0) return reply(null, { ok: false, error: 'unknown-column: ' + k });
    const v = body.values[k];
    patch[k] = String(v == null ? '' : v).trim();   // trimmed, as Code.gs did
  }

  // One transaction. The client sends only the fields that changed, so the
  // merge happens here (json_patch keeps every key the patch does not name),
  // and only after it can anyone see the whole row: a day whose every field is
  // now blank is deleted. Keyed on the date alone, so a retry rewrites the same
  // row instead of adding a second one.
  const [before, , gone] = await env.DB.batch([
    env.DB.prepare('SELECT 1 AS had FROM days WHERE date = ?').bind(date),
    env.DB.prepare('INSERT INTO days (date, data) VALUES (?, ?) ' +
      'ON CONFLICT(date) DO UPDATE SET data = json_patch(days.data, excluded.data)')
      .bind(date, JSON.stringify(patch)),
    env.DB.prepare("DELETE FROM days WHERE date = ? AND NOT EXISTS " +
      "(SELECT 1 FROM json_each(days.data) WHERE value <> '') RETURNING date").bind(date),
  ]);
  const had = before.results.length > 0;
  const action = gone.results.length ? (had ? 'deleted' : 'absent') : had ? 'updated' : 'inserted';
  return reply(null, { ok: true, action, date });
}

// JSONP when a callback is asked for (that is how the app reads, and what keeps
// file:// working), plain JSON otherwise. Every reply allows any origin so the
// app's POST can read its answer.
function reply(callback, obj, status) {
  const json = JSON.stringify(obj);
  const jsonp = callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback);
  return new Response(jsonp ? callback + '(' + json + ');' : json, {
    status: status || 200,
    headers: {
      'Content-Type': jsonp ? 'text/javascript; charset=utf-8' : 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}
