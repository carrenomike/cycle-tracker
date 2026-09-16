#!/usr/bin/env node
// The stub browser index.html's page script runs under, shared by the
// self-checks that need the WHOLE app rather than one marked block.
//
// Deliberately dumb: anything the page needs that is missing here shows up as
// the failure it would be on the phone, not as a silent no-op. The one thing it
// does properly is storage, because storage surviving a reload is the whole
// point of the unsent queue.

const fs = require('fs');
const path = require('path');

function pageScript() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const a = src.indexOf('<script>');
  const b = src.lastIndexOf('</script>');
  if (a < 0 || b < 0 || b < a) throw new Error('Could not find the page script in index.html');
  return src.slice(a + '<script>'.length, b);
}

// A real Map behind getItem/setItem, so one store can be handed to two boots in
// a row and answer the second exactly as a phone would after a reload.
function makeStore(map) {
  const m = map || new Map();
  return {
    _map: m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

class ChartStub {
  constructor() { this.data = { datasets: [] }; }
  destroy() {} update() {}
  getDatasetMeta() { return { hidden: false }; }
}

// One object per element id, remembered, so a check can read back what the page
// wrote into #saveStatus without the page and the check disagreeing about which
// element they mean.
function makeElement(id) {
  return {
    id,
    innerHTML: '', outerHTML: '', textContent: '', className: '',
    value: '', checked: false, disabled: false,
    remove() {}, insertAdjacentHTML(_, html) { this.innerHTML += html; },
    getContext: () => ({}),
  };
}

// `opts.store`   — a store from makeStore(), to survive a reload
// `opts.fetch`   — the write path; omit and any write throws, which is a real answer
// `opts.env`     — extra or replacement globals
// `opts.expose`  — a JS expression body listing what the check needs back
function bootPage(opts) {
  opts = opts || {};
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };
  const env = Object.assign({
    document: {
      getElementById,
      createElement: () => ({ set src(_) {}, onerror: null }),
      head: { appendChild() {} },
    },
    localStorage: opts.store || makeStore(),
    sessionStorage: makeStore(),
    location: { hash: '', pathname: '/', search: '', replace() {} },
    history: { replaceState() {} },
    navigator: {},
    window: { addEventListener() {} },
    alert() {},
    confirm: () => true,
    fetch: opts.fetch || (() => { throw new Error('no fetch stub was given to this check'); }),
    Chart: ChartStub,
    // The page schedules a 10-minute refresh and a 20s load timeout; neither
    // should hold the process open or fire mid-check.
    setTimeout: () => 0,
    setInterval: () => 0,
    clearTimeout: () => {},
  }, opts.env || {});

  const api = new Function(...Object.keys(env), `${pageScript()}\n; return ${opts.expose};`)
    (...Object.values(env));
  api._elements = elements;
  api._el = getElementById;
  return api;
}

module.exports = { pageScript, makeStore, bootPage, makeElement, ChartStub };
