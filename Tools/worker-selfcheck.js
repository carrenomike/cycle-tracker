#!/usr/bin/env node
// Offline check of the Cloudflare Worker — no network, no tokens.
//
//   node Tools/worker-selfcheck.js
//
// Runs Worker/worker.js itself (not a copy) against an in-memory SQLite built
// from Worker/schema.sql, through a small stand-in for D1's API. D1 is SQLite,
// so the merge (json_patch) and the all-blank delete run as the real SQL.
// Needs Node 22.5+ for node:sqlite.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DIR = path.join(__dirname, '..', 'Worker');
const src = fs.readFileSync(path.join(DIR, 'worker.js'), 'utf8');
if (!/^export default \{/m.test(src)) throw new Error('worker.js no longer has one `export default {` — update this loader');
const worker = new Function(src.replace(/^export default \{/m, 'return {'))();

// Just enough of D1: prepare().bind().all(), and batch() as one transaction.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8'));
  const stmt = (sql, args) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return {
    raw: db,
    prepare: sql => stmt(sql, []),
    batch: async stmts => {
      db.exec('BEGIN');
      try {
        const out = stmts.map(s => ({ results: db.prepare(s.sql).all(...s.args) }));
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

let failed = 0;
const pass = m => console.log(`  ok    ${m}`);
const fail = m => { failed++; console.log(`  FAIL  ${m}`); };
const is = (actual, expected, what) =>
  JSON.stringify(actual) === JSON.stringify(expected)
    ? pass(what)
    : fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const W = 'writer-token', R = 'reader-token';
const ENV = { READER_TOKEN: R, WRITER_TOKEN: W, DB: fakeD1() };
const URL_ = 'https://cycle.example.workers.dev/';

const get = async (qs, env = ENV) => {
  const res = await worker.fetch(new Request(URL_ + qs), env);
  return { res, text: await res.text() };
};
const getJson = async (t, env) => JSON.parse((await get(t == null ? '' : `?t=${t}`, env)).text);
const post = async (body, env = ENV) => {
  const res = await worker.fetch(new Request(URL_, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), env);
  return { res, json: JSON.parse(await res.text()) };
};
const rowOf = async date => {
  const r = await getJson(W);
  const at = r.rows.findIndex(x => x[0] === date);
  if (at < 0) return null;
  const o = {};
  r.cols.forEach((c, i) => { o[c] = r.rows[at][i]; });
  return o;
};

(async () => {
  console.log('\n--- CONFIG AND TOKENS ---');
  is((await getJson(W, { READER_TOKEN: '', WRITER_TOKEN: W, DB: ENV.DB })).error, 'not-configured',
     'a missing secret reads as not-configured, not no-access');
  is((await post({ t: W, date: '2026-01-01', values: {} }, { READER_TOKEN: R, WRITER_TOKEN: W })).json.error,
     'not-configured', 'a missing database binding reads as not-configured');
  is((await getJson(null)).error, 'no-access', 'no token is refused');
  is((await getJson('')).error, 'no-access', 'an empty token is refused');
  is((await getJson('nope')).error, 'no-access', 'a wrong token is refused');
  is((await getJson(R)).role, 'reader', 'the reader token reads as reader');
  is((await getJson(W)).role, 'writer', 'the writer token reads as writer');

  console.log('\n--- JSONP ---');
  const jp = await get(`?t=${R}&callback=_sheetCallback`);
  is(/^_sheetCallback\(\{.*\}\);$/s.test(jp.text), true, 'a callback wraps the reply as JSONP');
  is(jp.res.headers.get('Content-Type').startsWith('text/javascript'), true, 'JSONP is served as JavaScript');
  const bad = await get(`?t=${R}&callback=alert(1)`);
  is(bad.text.startsWith('{'), true, 'a callback that is not a plain name is ignored, not echoed');
  const jperr = await get('?t=nope&callback=cb');
  is(jperr.text, 'cb({"ok":false,"error":"no-access"});', 'a refusal also comes back through the callback');

  console.log('\n--- WRITE REFUSALS ---');
  for (const [what, body, expected] of [
    ['a reader token', { t: R, date: '2026-01-01', values: { Temp: '97' } }, 'read-only'],
    ['a wrong token', { t: 'nope', date: '2026-01-01', values: { Temp: '97' } }, 'no-access'],
    ['no token', { date: '2026-01-01', values: { Temp: '97' } }, 'no-access'],
    ['a body that is not JSON', 'not json', 'bad-request: body is not JSON'],
    ['a malformed date', { t: W, date: '01/01/2026', values: { Temp: '97' } }, 'bad-request: date must be YYYY-MM-DD'],
    ['no values', { t: W, date: '2026-01-01' }, 'bad-request: no values'],
    ['an unknown column', { t: W, date: '2026-01-01', values: { Temp: '97', NotAColumn: 'x' } }, 'unknown-column: NotAColumn'],
    ['Date sent as a value', { t: W, date: '2026-01-01', values: { Date: '2026-01-02' } }, 'bad-request: Date is the key, not a value'],
  ]) {
    const { json } = await post(body);
    is(json.error, expected, `${what} is refused (${expected})`);
  }
  is((await getJson(W)).rows.length, 0, 'no refused write left anything behind');
  const { res: pr } = await post({ t: W, date: '2026-01-01', values: {} });
  is(pr.headers.get('Access-Control-Allow-Origin'), '*', 'a POST reply allows any origin');

  console.log('\n--- MERGE ---');
  is((await post({ t: W, date: '2026-03-02', values: { Temp: '97.11', Note: '  =1+1 ', Exclude: 'TRUE' } })).json.action,
     'inserted', 'a new day is inserted');
  is((await post({ t: W, date: '2026-03-01', values: { Temp: '97.50' } })).json.action, 'inserted', 'an earlier day is inserted');
  is((await getJson(W)).rows.map(r => r[0]), ['2026-03-01', '2026-03-02'], 'days read back in date order');
  is((await post({ t: W, date: '2026-03-02', values: { Temp: '97.22' } })).json.action, 'updated', 'a second write updates');
  let row = await rowOf('2026-03-02');
  is([row.Temp, row.Note, row.Exclude], ['97.22', '=1+1', 'TRUE'], 'the update kept every field it did not name; values trimmed');
  is(row.Note, '=1+1', 'a Note of =1+1 reads back as =1+1');
  is(row.Flow, '', 'a field never written reads back blank');
  is((await post({ t: W, date: '2026-03-02', values: { Exclude: '' } })).json.action, 'updated', 'clearing one field updates');
  row = await rowOf('2026-03-02');
  is([row.Temp, row.Exclude], ['97.22', ''], 'one field cleared, the rest kept');
  is((await post({ t: W, date: '2026-03-02', values: { Temp: '97.22' } })).json.action, 'updated', 'a retry of the same write is an update');
  is((await getJson(W)).rows.length, 2, 'the retry did not add a row');

  console.log('\n--- ALL BLANK DELETES ---');
  is((await post({ t: W, date: '2026-03-02', values: { Temp: '', Note: ' ' } })).json.action,
     'deleted', 'clearing the last fields deletes the day');
  is(await rowOf('2026-03-02'), null, 'the day is gone');
  is((await post({ t: W, date: '2026-03-05', values: { Temp: '', Flow: '' } })).json.action,
     'absent', 'an all-blank save of a day that never existed stores nothing');
  is(await rowOf('2026-03-05'), null, 'nothing was stored');

  console.log('\n--- DELETE OP ---');
  is((await post({ t: W, date: '2026-03-01', op: 'delete' })).json.action, 'deleted', 'op delete removes a day');
  is((await post({ t: W, date: '2026-03-01', op: 'delete' })).json.action, 'absent', 'a second delete says absent');
  is((await post({ t: R, date: '2026-03-01', op: 'delete' })).json.error, 'read-only', 'a reader cannot delete');

  console.log('\n--- STORAGE ---');
  await post({ t: W, date: '2026-04-01', values: { Temp: '97' } });
  is(ENV.DB.raw.prepare('SELECT data FROM days').get().data, '{"Temp":"97"}', 'stored as a JSON object of strings');
  let refused = false;
  try { ENV.DB.raw.prepare("INSERT INTO days VALUES ('Apr 1', '{}')").run(); } catch { refused = true; }
  is(refused, true, 'the table refuses a date that is not YYYY-MM-DD');

  console.log(failed ? `\n${failed} CHECK(S) FAILED\n` : '\nAll checks passed.\n');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
